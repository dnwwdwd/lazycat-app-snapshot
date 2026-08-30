// Package plans validates current-tenant schedule definitions and expands due
// plans through the persistent queue.
package plans

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/queue"
	"github.com/robfig/cron/v3"
)

type Service struct {
	store     *persistence.Store
	queue     *queue.Service
	tenantUID string
}

func New(store *persistence.Store, queueService *queue.Service, tenantUID string) (*Service, error) {
	if store == nil || queueService == nil || tenantUID == "" {
		return nil, errors.New("plan store, queue and tenant are required")
	}
	return &Service{store: store, queue: queueService, tenantUID: tenantUID}, nil
}

func (s *Service) Create(ctx context.Context, input domain.PlanInput, subject string) (domain.BackupPlan, error) {
	now := time.Now().UTC()
	plan, err := s.normalize(input, now)
	if err != nil {
		return domain.BackupPlan{}, err
	}
	id, err := randomID("plan")
	if err != nil {
		return domain.BackupPlan{}, err
	}
	plan.ID, plan.TenantUID, plan.CreatedBySubject, plan.CreatedAt, plan.UpdatedAt = id, s.tenantUID, subject, now, now
	if err := s.validateTargets(ctx, plan); err != nil {
		return domain.BackupPlan{}, err
	}
	if err := s.store.CreatePlan(ctx, plan); err != nil {
		return domain.BackupPlan{}, err
	}
	return s.store.Plan(ctx, s.tenantUID, plan.ID)
}

func (s *Service) Update(ctx context.Context, id string, input domain.PlanInput) (domain.BackupPlan, error) {
	current, err := s.store.Plan(ctx, s.tenantUID, id)
	if err != nil {
		return domain.BackupPlan{}, err
	}
	now := time.Now().UTC()
	plan, err := s.normalize(input, now)
	if err != nil {
		return domain.BackupPlan{}, err
	}
	plan.ID, plan.TenantUID, plan.CreatedBySubject, plan.CreatedAt, plan.UpdatedAt, plan.LastScheduledAt = current.ID, s.tenantUID, current.CreatedBySubject, current.CreatedAt, now, current.LastScheduledAt
	if err := s.validateTargets(ctx, plan); err != nil {
		return domain.BackupPlan{}, err
	}
	changed := applyScopeRevisions(&plan, current)
	if err := s.store.UpdatePlan(ctx, s.tenantUID, plan, changed); err != nil {
		return domain.BackupPlan{}, err
	}
	return s.store.Plan(ctx, s.tenantUID, id)
}

func (s *Service) List(ctx context.Context) ([]domain.BackupPlan, error) {
	return s.store.Plans(ctx, s.tenantUID)
}
func (s *Service) Plan(ctx context.Context, id string) (domain.BackupPlan, error) {
	return s.store.Plan(ctx, s.tenantUID, id)
}
func (s *Service) Delete(ctx context.Context, id string) error {
	return s.store.DeletePlan(ctx, s.tenantUID, id)
}

func (s *Service) Pause(ctx context.Context, id string) (domain.BackupPlan, error) {
	if err := s.store.SetPlanEnabled(ctx, s.tenantUID, id, false, nil, time.Now().UTC()); err != nil {
		return domain.BackupPlan{}, err
	}
	return s.store.Plan(ctx, s.tenantUID, id)
}

func (s *Service) Resume(ctx context.Context, id string) (domain.BackupPlan, error) {
	plan, err := s.store.Plan(ctx, s.tenantUID, id)
	if err != nil {
		return domain.BackupPlan{}, err
	}
	now := time.Now().UTC()
	next, err := nextRun(plan, now)
	if err != nil {
		return domain.BackupPlan{}, err
	}
	if err := s.store.SetPlanEnabled(ctx, s.tenantUID, id, true, next, now); err != nil {
		return domain.BackupPlan{}, err
	}
	return s.store.Plan(ctx, s.tenantUID, id)
}

func (s *Service) Run(ctx context.Context, id string) (domain.BackupBatch, error) {
	plan, err := s.store.Plan(ctx, s.tenantUID, id)
	if err != nil {
		return domain.BackupBatch{}, err
	}
	return s.queue.RunPlan(ctx, plan, "manual", time.Now().UTC())
}

// RunDue processes all missed occurrences in a bounded loop. The persisted
// next_run_at move is committed after every occurrence, so a restart can
// resume without re-expanding the same plan time.
func (s *Service) RunDue(ctx context.Context, now time.Time) error {
	plans, err := s.store.DuePlans(ctx, s.tenantUID, now)
	if err != nil {
		return err
	}
	for _, plan := range plans {
		for steps := 0; plan.NextRunAt != nil && !plan.NextRunAt.After(now) && steps < 128; steps++ {
			scheduled := plan.NextRunAt.UTC()
			next, err := nextRun(plan, scheduled)
			if err != nil {
				return err
			}
			delay := now.Sub(scheduled)
			if (!plan.CatchUp && delay > time.Minute) || delay > time.Duration(plan.MaxCatchUpSeconds)*time.Second {
				if err := s.recordSkipped(ctx, plan, scheduled); err != nil && !errors.Is(err, domain.ErrConflict) {
					return err
				}
			} else if _, err := s.queue.RunPlan(ctx, plan, "scheduled", scheduled); err != nil && !errors.Is(err, domain.ErrConflict) {
				return err
			} else {
				latest, lookupErr := s.store.Plan(ctx, s.tenantUID, plan.ID)
				if lookupErr != nil {
					return lookupErr
				}
				if !latest.Enabled && latest.PauseReason != nil {
					break
				}
			}
			if err := s.store.AdvancePlan(ctx, s.tenantUID, plan.ID, scheduled, next, now); err != nil {
				return err
			}
			plan.LastScheduledAt, plan.NextRunAt = &scheduled, next
		}
	}
	return nil
}

func (s *Service) normalize(input domain.PlanInput, now time.Time) (domain.BackupPlan, error) {
	plan := domain.BackupPlan{Name: strings.TrimSpace(input.Name), TargetKind: input.TargetKind, Targets: input.Targets, SharedRiskAccepted: input.SharedRiskAccepted, ScheduleType: input.ScheduleType, ExecutionTime: strings.TrimSpace(input.ExecutionTime), CronExpression: strings.TrimSpace(input.CronExpression), Timezone: strings.TrimSpace(input.Timezone), Enabled: input.Enabled, CatchUp: input.CatchUp, MaxCatchUpSeconds: input.MaxCatchUpSeconds, Retry: input.Retry, Retention: input.Retention}
	if plan.Name == "" || len(plan.Name) > 120 {
		return domain.BackupPlan{}, &ValidationError{Code: "INVALID_PLAN_NAME"}
	}
	if plan.TargetKind == "" {
		plan.TargetKind = "EXPLICIT"
	}
	if plan.TargetKind != "EXPLICIT" {
		return domain.BackupPlan{}, &ValidationError{Code: "INVALID_PLAN_TARGETS"}
	}
	if len(plan.Targets) == 0 {
		return domain.BackupPlan{}, &ValidationError{Code: "INVALID_PLAN_TARGETS"}
	}
	for index := range plan.Targets {
		scope, err := normalizeScope(plan.Targets[index].Scope)
		if err != nil {
			return domain.BackupPlan{}, &ValidationError{Code: "INVALID_BACKUP_SCOPE"}
		}
		plan.Targets[index].Scope = scope
	}
	if plan.ScheduleType == "" {
		plan.ScheduleType = "DAILY"
	}
	if plan.ExecutionTime == "" {
		plan.ExecutionTime = "02:00"
	}
	if _, err := time.Parse("15:04", plan.ExecutionTime); err != nil {
		return domain.BackupPlan{}, &ValidationError{Code: "INVALID_EXECUTION_TIME"}
	}
	if plan.Timezone == "" {
		plan.Timezone = "Asia/Shanghai"
	}
	if _, err := time.LoadLocation(plan.Timezone); err != nil {
		return domain.BackupPlan{}, &ValidationError{Code: "INVALID_TIMEZONE"}
	}
	if plan.MaxCatchUpSeconds <= 0 {
		plan.MaxCatchUpSeconds = int((24 * time.Hour).Seconds())
	}
	if plan.MaxCatchUpSeconds > int((30 * 24 * time.Hour).Seconds()) {
		return domain.BackupPlan{}, &ValidationError{Code: "INVALID_CATCH_UP_WINDOW"}
	}
	if plan.Retry.MaxRetries < 0 || plan.Retry.MaxRetries > 8 || plan.Retry.BackoffSeconds < 0 || plan.Retry.BackoffSeconds > 24*60*60 {
		return domain.BackupPlan{}, &ValidationError{Code: "INVALID_RETRY_POLICY"}
	}
	if plan.Retry.BackoffSeconds == 0 {
		plan.Retry.BackoffSeconds = 60
	}
	if plan.Retention.KeepLast <= 0 {
		plan.Retention.KeepLast = 1
	}
	if plan.Retention.KeepLast > 10000 || plan.Retention.KeepDaily < 0 || plan.Retention.KeepWeekly < 0 || plan.Retention.KeepMonthly < 0 || plan.Retention.TrashGraceHours < 0 || plan.Retention.TrashGraceHours > 24*365 {
		return domain.BackupPlan{}, &ValidationError{Code: "INVALID_RETENTION_POLICY"}
	}
	if plan.Retention.TrashGraceHours == 0 {
		plan.Retention.TrashGraceHours = 7 * 24
	}
	if plan.ScheduleType == "MANUAL" {
		plan.Enabled, plan.CronExpression = false, ""
		return plan, nil
	}
	expression, err := cronExpression(plan.ScheduleType, plan.ExecutionTime, plan.CronExpression)
	if err != nil {
		return domain.BackupPlan{}, err
	}
	plan.CronExpression = expression
	next, err := nextRun(plan, now)
	if err != nil {
		return domain.BackupPlan{}, err
	}
	plan.NextRunAt = next
	return plan, nil
}

func normalizeScope(input domain.BackupScope) (domain.BackupScope, error) {
	mode := strings.ToUpper(strings.TrimSpace(input.Mode))
	if mode == "" {
		mode = "FULL"
	}
	if mode != "FULL" && mode != "CORE" && mode != "CUSTOM" {
		return domain.BackupScope{}, errors.New("invalid scope mode")
	}
	result := domain.BackupScope{Mode: mode, Revision: input.Revision}
	if result.Revision < 1 {
		result.Revision = 1
	}
	if mode == "FULL" {
		result.Summary = "全部支持数据"
		return result, nil
	}
	clean := func(values []string) ([]string, error) {
		seen := map[string]bool{}
		out := make([]string, 0, len(values))
		for _, value := range values {
			value = strings.Trim(strings.ReplaceAll(value, "\\", "/"), "/ ")
			if value == "" || strings.HasPrefix(value, "../") || value == ".." || strings.Contains(value, "/../") {
				return nil, errors.New("unsafe path")
			}
			if !seen[value] {
				seen[value] = true
				out = append(out, value)
			}
		}
		if len(out) > 500 {
			return nil, errors.New("too many paths")
		}
		return out, nil
	}
	var err error
	if result.Directories, err = clean(input.Directories); err != nil {
		return domain.BackupScope{}, err
	}
	if result.Files, err = clean(input.Files); err != nil {
		return domain.BackupScope{}, err
	}
	for _, file := range result.Files {
		lower := strings.ToLower(file)
		if strings.HasSuffix(lower, "-wal") || strings.HasSuffix(lower, "-shm") || strings.HasSuffix(lower, "-journal") {
			return domain.BackupScope{}, errors.New("sqlite companion files cannot be selected")
		}
	}
	result.Directories = removeCoveredDirectories(result.Directories)
	result.Files = removeFilesCoveredByDirectories(result.Files, result.Directories)
	if mode == "CUSTOM" && len(result.Directories)+len(result.Files) == 0 {
		return domain.BackupScope{}, errors.New("empty scope")
	}
	if mode == "CORE" {
		result.Summary = "Notus 核心 SQLite 档案"
	} else {
		result.Summary = fmt.Sprintf("%d 个目录，%d 个文件", len(result.Directories), len(result.Files))
	}
	return result, nil
}

func removeCoveredDirectories(values []string) []string {
	sort.SliceStable(values, func(i, j int) bool {
		if len(values[i]) == len(values[j]) {
			return values[i] < values[j]
		}
		return len(values[i]) < len(values[j])
	})
	result := make([]string, 0, len(values))
	for _, value := range values {
		covered := false
		for _, parent := range result {
			if strings.HasPrefix(value, parent+"/") {
				covered = true
				break
			}
		}
		if !covered {
			result = append(result, value)
		}
	}
	return result
}

func removeFilesCoveredByDirectories(files, directories []string) []string {
	result := make([]string, 0, len(files))
	for _, file := range files {
		covered := false
		for _, directory := range directories {
			if strings.HasPrefix(file, directory+"/") {
				covered = true
				break
			}
		}
		if !covered {
			result = append(result, file)
		}
	}
	return result
}

func applyScopeRevisions(plan *domain.BackupPlan, current domain.BackupPlan) bool {
	previous := map[string]domain.BackupScope{}
	for _, target := range current.Targets {
		previous[target.DeployID] = target.Scope
	}
	changed := false
	for index := range plan.Targets {
		next := &plan.Targets[index].Scope
		old, exists := previous[plan.Targets[index].DeployID]
		if !exists || old.Mode != next.Mode || !samePaths(old.Directories, next.Directories) || !samePaths(old.Files, next.Files) {
			if exists {
				next.Revision = old.Revision + 1
			} else {
				next.Revision = 1
			}
			changed = true
			continue
		}
		next.Revision = old.Revision
	}
	return changed || len(plan.Targets) != len(current.Targets)
}

func samePaths(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func (s *Service) validateTargets(ctx context.Context, plan domain.BackupPlan) error {
	seen := map[string]bool{}
	for _, target := range plan.Targets {
		if target.DeployID == "" || seen[target.DeployID] {
			return &ValidationError{Code: "INVALID_PLAN_TARGETS"}
		}
		seen[target.DeployID] = true
		instance, err := s.store.Instance(ctx, s.tenantUID, target.DeployID)
		if err != nil {
			return err
		}
		if instance.CapabilityStatus != "BACKUPABLE" && instance.CapabilityStatus != "BACKUPABLE_SHARED_WARNING" {
			return &ValidationError{Code: "INSTANCE_NOT_BACKUPABLE"}
		}
		if target.Scope.Mode == "CORE" && instance.AppID != "cloud.lazycat.notus" {
			return &ValidationError{Code: "CORE_SCOPE_PROFILE_UNAVAILABLE"}
		}
	}
	return nil
}

func (s *Service) recordSkipped(ctx context.Context, plan domain.BackupPlan, scheduled time.Time) error {
	id, err := randomID("batch")
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	return s.store.CreateBatch(ctx, domain.BackupBatch{ID: id, TenantUID: s.tenantUID, PlanID: plan.ID, PlanName: plan.Name, TriggerType: "scheduled", Status: "SKIPPED", ScheduledAt: scheduled, CreatedAt: now, FinishedAt: &now})
}

func nextRun(plan domain.BackupPlan, after time.Time) (*time.Time, error) {
	if plan.ScheduleType == "MANUAL" {
		return nil, nil
	}
	location, err := time.LoadLocation(plan.Timezone)
	if err != nil {
		return nil, err
	}
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	schedule, err := parser.Parse(plan.CronExpression)
	if err != nil {
		return nil, &ValidationError{Code: "INVALID_CRON"}
	}
	next := schedule.Next(after.In(location)).UTC()
	return &next, nil
}

func cronExpression(kind, executionTime, value string) (string, error) {
	clock, err := time.Parse("15:04", executionTime)
	if err != nil {
		return "", &ValidationError{Code: "INVALID_EXECUTION_TIME"}
	}
	switch kind {
	case "HOURLY":
		return "0 * * * *", nil
	case "DAILY":
		return fmt.Sprintf("%d %d * * *", clock.Minute(), clock.Hour()), nil
	case "WEEKLY":
		return fmt.Sprintf("%d %d * * 1", clock.Minute(), clock.Hour()), nil
	case "CRON":
		parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
		if _, err := parser.Parse(value); err != nil {
			return "", &ValidationError{Code: "INVALID_CRON"}
		}
		return value, nil
	default:
		return "", &ValidationError{Code: "INVALID_SCHEDULE"}
	}
}

type ValidationError struct{ Code string }

func (e *ValidationError) Error() string { return e.Code }

func randomID(prefix string) (string, error) {
	bytes := make([]byte, 12)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(bytes)), nil
}
