package catalog

import (
	"context"
	"errors"
	"io/fs"
	"sync"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/platform"
	"cloud.lazycat.app.backup/apps/server/internal/probe"
	"cloud.lazycat.app.backup/apps/server/internal/source"
)

type Service struct {
	store           *persistence.Store
	provider        platform.Catalog
	resolver        source.Resolver
	tenantUID       string
	allowSharedApps bool
	backupAppID     string
	workers         int

	coordinator *syncCoordinator
}

type syncCoordinator struct {
	mu            sync.Mutex
	running       map[string]bool
	runningScope  map[string]string
	initialSynced map[string]bool
}

func New(store *persistence.Store, provider platform.Catalog, resolver source.Resolver, tenantUID, backupAppID string, workers int) *Service {
	if workers < 1 {
		workers = 1
	}
	if workers > 8 {
		workers = 8
	}
	return &Service{store: store, provider: provider, resolver: resolver, tenantUID: tenantUID, allowSharedApps: true, backupAppID: backupAppID, workers: workers, coordinator: &syncCoordinator{running: map[string]bool{}, runningScope: map[string]string{}, initialSynced: map[string]bool{}}}
}

// ForTenant binds catalog access to the authenticated gateway UID. The app
// deployment ID remains available only for startup and OIDC transaction scope;
// it must never be passed to the platform catalog as a user identity.
func (s *Service) ForTenant(tenantUID string) *Service {
	return s.ForSession(tenantUID, domain.RoleNormal)
}

// ForSession binds the catalog to the authenticated gateway UID. Every
// authenticated role may use all installed applications; role differences do
// not narrow the application catalog.
func (s *Service) ForSession(tenantUID string, _ domain.Role) *Service {
	clone := *s
	clone.tenantUID = tenantUID
	clone.allowSharedApps = true
	return &clone
}

func (s *Service) scopeKey() string {
	return s.tenantUID + "\x00all-apps"
}

// StartSync keeps the existing fire-and-forget call shape for startup callers.
func (s *Service) StartSync(ctx context.Context) bool {
	started, _ := s.StartSyncWithStatus(ctx)
	return started
}

// StartSyncWithStatus coalesces refresh requests. It writes RUNNING before
// returning so the next list read can reliably poll this asynchronous sync.
func (s *Service) StartSyncWithStatus(ctx context.Context) (bool, error) {
	s.coordinator.mu.Lock()
	started, err := s.startSyncLocked(ctx)
	s.coordinator.mu.Unlock()
	return started, err
}

func (s *Service) startSyncLocked(ctx context.Context) (bool, error) {
	if s.coordinator.running[s.tenantUID] {
		return false, nil
	}
	syncCtx := context.WithoutCancel(ctx)
	if err := s.store.StartSync(syncCtx, s.tenantUID, time.Now().UTC()); err != nil {
		return false, err
	}
	s.coordinator.running[s.tenantUID] = true
	s.coordinator.runningScope[s.tenantUID] = s.scopeKey()
	go func() {
		defer func() {
			s.coordinator.mu.Lock()
			delete(s.coordinator.running, s.tenantUID)
			delete(s.coordinator.runningScope, s.tenantUID)
			s.coordinator.mu.Unlock()
		}()
		s.run(syncCtx)
	}()
	return true, nil
}

// StartInitialSync keeps the existing fire-and-forget call shape for startup
// callers that do not need to return an API error.
func (s *Service) StartInitialSync(ctx context.Context) bool {
	started, _ := s.StartInitialSyncWithStatus(ctx)
	return started
}

// StartInitialSyncWithStatus refreshes a tenant once per process even when the
// control database contains a successful result from an older identity-scoping
// implementation. This lets an upgraded instance replace stale catalog rows
// without requiring the browser to know about the migration.
func (s *Service) StartInitialSyncWithStatus(ctx context.Context) (bool, error) {
	scope := s.scopeKey()
	s.coordinator.mu.Lock()
	if s.coordinator.initialSynced[scope] {
		s.coordinator.mu.Unlock()
		return false, nil
	}
	if s.coordinator.running[s.tenantUID] {
		if s.coordinator.runningScope[s.tenantUID] == scope {
			s.coordinator.initialSynced[scope] = true
		}
		s.coordinator.mu.Unlock()
		return false, nil
	}
	s.coordinator.initialSynced[scope] = true
	started, err := s.startSyncLocked(ctx)
	if err != nil {
		delete(s.coordinator.initialSynced, scope)
	}
	s.coordinator.mu.Unlock()
	return started, err
}

func (s *Service) run(ctx context.Context) {
	apps, err := s.provider.List(ctx, s.tenantUID, s.backupAppID)
	if err != nil {
		_ = s.store.FinishSync(ctx, s.tenantUID, "FAILED", "APPLICATION_CATALOG_UNAVAILABLE", time.Now().UTC())
		return
	}
	counts := map[string]int{}
	for _, app := range apps {
		if s.includes(app) {
			counts[app.AppID]++
		}
	}
	type task struct {
		app       platform.Application
		ambiguous bool
	}
	tasks := make(chan task)
	results := make(chan domain.ApplicationInstance, len(apps))
	var workers sync.WaitGroup
	for i := 0; i < s.workers; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for item := range tasks {
				results <- s.probe(ctx, item.app, item.ambiguous)
			}
		}()
	}
	go func() {
		for _, app := range apps {
			// A second scope check keeps fixture and future provider adapters from
			// returning malformed records outside the all-installed catalog scope.
			if !s.includes(app) {
				continue
			}
			tasks <- task{app: app, ambiguous: counts[app.AppID] > 1}
		}
		close(tasks)
		workers.Wait()
		close(results)
	}()
	instances := make([]domain.ApplicationInstance, 0, len(apps))
	for item := range results {
		instances = append(instances, item)
	}
	if err := s.store.ReplaceInstances(ctx, s.tenantUID, instances, time.Now().UTC()); err != nil {
		_ = s.store.FinishSync(ctx, s.tenantUID, "FAILED", "CONTROL_DATABASE_WRITE_FAILED", time.Now().UTC())
		return
	}
	_ = s.store.FinishSync(ctx, s.tenantUID, "SUCCEEDED", "", time.Now().UTC())
}

func (s *Service) includes(app platform.Application) bool {
	if app.OwnerUID == "" || app.DeployID == "" || app.AppID == "" || app.AppID == s.backupAppID {
		return false
	}
	return true
}

func (s *Service) probe(ctx context.Context, app platform.Application, ambiguous bool) domain.ApplicationInstance {
	result := domain.ApplicationInstance{
		TenantUID: s.tenantUID, AppID: app.AppID, Name: app.Name, Version: app.Version, Icon: app.Icon, DeployID: app.DeployID,
		MultiInstance: app.MultiInstance, ReadOnlyMode: "", LastSyncedAt: time.Now().UTC(),
	}
	if ambiguous {
		result.CapabilityStatus, result.ProbeErrorCode = "SOURCE_MAPPING_AMBIGUOUS", "SOURCE_MAPPING_AMBIGUOUS"
		return result
	}
	resolved, err := s.resolver.Resolve(source.Request{TenantUID: s.tenantUID, AppID: app.AppID, DeployID: app.DeployID, OwnerUID: app.OwnerUID, AllowSharedApp: s.allowSharedApps})
	if err != nil {
		result.CapabilityStatus, result.ProbeErrorCode = classifySourceError(err)
		return result
	}
	result.ReadOnlyMode = resolved.ReadOnlyMode
	scan, err := probe.Run(ctx, resolved, app.MultiInstance)
	if err != nil {
		result.CapabilityStatus, result.ProbeErrorCode = classifyProbeError(err)
		return result
	}
	probedAt := time.Now().UTC()
	result.CapabilityStatus, result.TotalBytes, result.FileCount, result.SQLiteCount, result.SkippedCount = scan.CapabilityStatus, scan.TotalBytes, scan.FileCount, scan.SQLiteCount, scan.SkippedCount
	result.DatabaseFindings, result.LastProbedAt = scan.Findings, &probedAt
	return result
}

func classifyProbeError(err error) (capabilityStatus, probeErrorCode string) {
	if errors.Is(err, probe.ErrEntryLimitExceeded) {
		return "SYSTEM_UNSUPPORTED", "SOURCE_ENTRY_LIMIT_EXCEEDED"
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return "PROBE_FAILED", "PROBE_TIMEOUT"
	}
	if errors.Is(err, fs.ErrPermission) {
		return "SYSTEM_UNSUPPORTED", "SOURCE_PERMISSION_DENIED"
	}
	if errors.Is(err, fs.ErrNotExist) {
		return "SYSTEM_UNSUPPORTED", "SOURCE_PROJECTION_UNAVAILABLE"
	}
	var pathErr *fs.PathError
	if errors.As(err, &pathErr) {
		return "SYSTEM_UNSUPPORTED", "SOURCE_PROJECTION_UNAVAILABLE"
	}
	return "PROBE_FAILED", "PROBE_FAILED"
}

func classifySourceError(err error) (capabilityStatus, probeErrorCode string) {
	probeErrorCode = source.Code(err)
	if probeErrorCode == "SOURCE_PERMISSION_DENIED" || probeErrorCode == "RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE" || probeErrorCode == "SOURCE_PROJECTION_UNAVAILABLE" || probeErrorCode == "SOURCE_NOT_READY" {
		return "SYSTEM_UNSUPPORTED", probeErrorCode
	}
	return probeErrorCode, probeErrorCode
}

func (s *Service) SyncStatus(ctx context.Context) (domain.SyncStatus, error) {
	return s.store.SyncStatus(ctx, s.tenantUID)
}
func (s *Service) List(ctx context.Context, filter domain.ApplicationFilter) (domain.ApplicationPage, error) {
	return s.store.ListInstances(ctx, s.tenantUID, filter)
}
func (s *Service) Instance(ctx context.Context, deployID string) (domain.ApplicationInstance, error) {
	return s.store.Instance(ctx, s.tenantUID, deployID)
}
func (s *Service) App(ctx context.Context, appID string) ([]domain.ApplicationInstance, error) {
	return s.store.InstancesForApp(ctx, s.tenantUID, appID)
}
