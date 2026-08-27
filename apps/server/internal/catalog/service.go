package catalog

import (
	"context"
	"errors"
	"sync"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/platform"
	"cloud.lazycat.app.backup/apps/server/internal/probe"
	"cloud.lazycat.app.backup/apps/server/internal/source"
)

type Service struct {
	store       *persistence.Store
	provider    platform.Catalog
	resolver    source.Resolver
	tenantUID   string
	backupAppID string
	workers     int

	mu      sync.Mutex
	running bool
}

func New(store *persistence.Store, provider platform.Catalog, resolver source.Resolver, tenantUID, backupAppID string, workers int) *Service {
	if workers < 1 {
		workers = 1
	}
	if workers > 8 {
		workers = 8
	}
	return &Service{store: store, provider: provider, resolver: resolver, tenantUID: tenantUID, backupAppID: backupAppID, workers: workers}
}

// StartSync coalesces refresh requests. One tenant instance has one catalog
// worker, so a burst of browser refreshes cannot create unbounded scans.
func (s *Service) StartSync(ctx context.Context) (started bool) {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return false
	}
	s.running = true
	s.mu.Unlock()
	go func() {
		defer func() { s.mu.Lock(); s.running = false; s.mu.Unlock() }()
		s.run(context.WithoutCancel(ctx))
	}()
	return true
}

func (s *Service) run(ctx context.Context) {
	startedAt := time.Now().UTC()
	if err := s.store.StartSync(ctx, s.tenantUID, startedAt); err != nil {
		return
	}
	apps, err := s.provider.List(ctx, s.tenantUID, s.backupAppID)
	if err != nil {
		_ = s.store.FinishSync(ctx, s.tenantUID, "FAILED", "APPLICATION_CATALOG_UNAVAILABLE", time.Now().UTC())
		return
	}
	counts := map[string]int{}
	for _, app := range apps {
		if app.OwnerUID == s.tenantUID && app.DeployID != "" && app.AppID != "" {
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
			// A second owner check keeps fixture and future provider adapters
			// from ever crossing the container's frozen tenant identity.
			if app.OwnerUID != s.tenantUID || app.DeployID == "" || app.AppID == "" || app.AppID == s.backupAppID {
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

func (s *Service) probe(ctx context.Context, app platform.Application, ambiguous bool) domain.ApplicationInstance {
	result := domain.ApplicationInstance{
		TenantUID: s.tenantUID, AppID: app.AppID, Name: app.Name, Version: app.Version, Icon: app.Icon, DeployID: app.DeployID,
		MultiInstance: app.MultiInstance, ReadOnlyMode: "", LastSyncedAt: time.Now().UTC(),
	}
	if ambiguous {
		result.CapabilityStatus, result.ProbeErrorCode = "SOURCE_MAPPING_AMBIGUOUS", "SOURCE_MAPPING_AMBIGUOUS"
		return result
	}
	resolved, err := s.resolver.Resolve(source.Request{TenantUID: s.tenantUID, AppID: app.AppID, DeployID: app.DeployID, OwnerUID: app.OwnerUID})
	if err != nil {
		result.CapabilityStatus, result.ProbeErrorCode = source.Code(err), source.Code(err)
		return result
	}
	result.ReadOnlyMode = resolved.ReadOnlyMode
	scan, err := probe.Run(ctx, resolved, app.MultiInstance)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			result.ProbeErrorCode = "PROBE_TIMEOUT"
		} else {
			result.ProbeErrorCode = "PROBE_FAILED"
		}
		result.CapabilityStatus = "PROBE_FAILED"
		return result
	}
	probedAt := time.Now().UTC()
	result.CapabilityStatus, result.TotalBytes, result.FileCount, result.SQLiteCount, result.SkippedCount = scan.CapabilityStatus, scan.TotalBytes, scan.FileCount, scan.SQLiteCount, scan.SkippedCount
	result.DatabaseFindings, result.LastProbedAt = scan.Findings, &probedAt
	return result
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
