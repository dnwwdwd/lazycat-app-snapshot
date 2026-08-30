// Package queue runs current-tenant backup work from the persistent control
// database. It deliberately does not accept source paths or tenant IDs from
// callers.
package queue

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/backup"
	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
)

type Config struct {
	TenantUID      string
	Workers        int
	LeaseDuration  time.Duration
	PollInterval   time.Duration
	AfterSucceeded func(context.Context, domain.BackupTask) error
	OnTaskUpdated  func(context.Context, domain.BackupTask)
	OnBatchUpdated func(context.Context, domain.BackupBatch)
	OnScopeInvalid func(context.Context, domain.PlanPauseReason)
}

type Service struct {
	store          *persistence.Store
	backups        *backup.Service
	tenantUID      string
	lease          time.Duration
	poll           time.Duration
	workerID       string
	mu             sync.Mutex
	cancelByID     map[string]context.CancelFunc
	afterSucceeded func(context.Context, domain.BackupTask) error
	onTaskUpdated  func(context.Context, domain.BackupTask)
	onBatchUpdated func(context.Context, domain.BackupBatch)
	onScopeInvalid func(context.Context, domain.PlanPauseReason)
}

func New(store *persistence.Store, backups *backup.Service, config Config) (*Service, error) {
	if store == nil || backups == nil || config.TenantUID == "" {
		return nil, errors.New("queue store, backup engine and tenant are required")
	}
	if config.Workers < 1 {
		config.Workers = 1
	}
	if config.Workers > 4 {
		config.Workers = 4
	}
	if config.LeaseDuration <= 0 {
		config.LeaseDuration = 2 * time.Minute
	}
	if config.PollInterval <= 0 {
		config.PollInterval = 300 * time.Millisecond
	}
	workerID, err := randomID("worker")
	if err != nil {
		return nil, err
	}
	service := &Service{store: store, backups: backups, tenantUID: config.TenantUID, lease: config.LeaseDuration, poll: config.PollInterval, workerID: workerID, cancelByID: map[string]context.CancelFunc{}, afterSucceeded: config.AfterSucceeded, onTaskUpdated: config.OnTaskUpdated, onBatchUpdated: config.OnBatchUpdated, onScopeInvalid: config.OnScopeInvalid}
	if err := store.RequeueExpiredTasks(context.Background(), config.TenantUID, time.Now().UTC()); err != nil {
		return nil, fmt.Errorf("recover expired task leases: %w", err)
	}
	for index := 0; index < config.Workers; index++ {
		go service.worker(index)
	}
	return service, nil
}

func (s *Service) StartManual(ctx context.Context, deployID string, sharedRiskAccepted bool, subject string, role domain.Role) (domain.BackupJob, error) {
	instance, err := s.store.Instance(ctx, s.tenantUID, deployID)
	if err != nil {
		return domain.BackupJob{}, err
	}
	now := time.Now().UTC()
	batchID, err := randomID("batch")
	if err != nil {
		return domain.BackupJob{}, err
	}
	batch := domain.BackupBatch{ID: batchID, TenantUID: s.tenantUID, PlanID: "manual-" + batchID, PlanName: "手动备份", TriggerType: "manual", Status: "QUEUED", ScheduledAt: now, CreatedAt: now}
	if err := s.store.CreateBatch(ctx, batch); err != nil {
		return domain.BackupJob{}, err
	}
	job, _, err := s.enqueueInstance(ctx, batch, instance, sharedRiskAccepted, subject, role, 0, 60, 0, domain.BackupScope{Mode: "FULL", Revision: 1})
	if err != nil {
		return domain.BackupJob{}, err
	}
	s.emitBatch(ctx, batch.ID)
	return job, nil
}

// RunPlan expands only the current user's persisted targets. Invalid or no
// longer backupable targets are recorded as skipped tasks and never resolved.
func (s *Service) RunPlan(ctx context.Context, plan domain.BackupPlan, trigger string, scheduledAt time.Time) (domain.BackupBatch, error) {
	batchID, err := randomID("batch")
	if err != nil {
		return domain.BackupBatch{}, err
	}
	batch := domain.BackupBatch{ID: batchID, TenantUID: s.tenantUID, PlanID: plan.ID, PlanName: plan.Name, TriggerType: trigger, Status: "QUEUED", ScheduledAt: scheduledAt.UTC(), CreatedAt: time.Now().UTC()}
	if err := s.store.CreateBatch(ctx, batch); err != nil {
		if errors.Is(err, domain.ErrConflict) {
			return s.existingBatch(ctx, plan.ID, scheduledAt)
		}
		return domain.BackupBatch{}, err
	}
	instances, accepted, scopes, err := s.planInstances(ctx, plan)
	if err != nil {
		return domain.BackupBatch{}, err
	}
	for _, instance := range instances {
		if err := s.backups.ValidateScope(ctx, instance.DeployID, scopes[instance.DeployID]); err != nil {
			failure, ok := backup.ScopeValidation(err)
			if !ok {
				return domain.BackupBatch{}, err
			}
			now := time.Now().UTC()
			reason := domain.PlanPauseReason{Code: "BACKUP_SCOPE_PATH_MISSING", DeployID: instance.DeployID, Path: failure.Path, Expected: failure.Expected, DetectedAt: now, ScopeRevision: scopes[instance.DeployID].Revision}
			if err := s.pauseForScope(ctx, plan.ID, reason); err != nil {
				return domain.BackupBatch{}, err
			}
			for _, affected := range instances {
				code := "PLAN_PAUSED_SCOPE_INVALID"
				if affected.DeployID == instance.DeployID {
					code = reason.Code
				}
				if err := s.recordSkipped(ctx, batch, affected, code, scopes[affected.DeployID], &reason); err != nil {
					return domain.BackupBatch{}, err
				}
			}
			result, err := s.store.Batch(ctx, s.tenantUID, batch.ID)
			if err == nil {
				s.emitBatch(ctx, result.ID)
			}
			return result, err
		}
	}
	for _, instance := range instances {
		if _, _, err := s.enqueueInstance(ctx, batch, instance, accepted[instance.DeployID], plan.CreatedBySubject, domain.RoleNormal, plan.Retry.MaxRetries, plan.Retry.BackoffSeconds, 10, scopes[instance.DeployID]); err != nil {
			if errors.Is(err, domain.ErrConflict) {
				if recordErr := s.recordSkipped(ctx, batch, instance, "INSTANCE_ALREADY_QUEUED", scopes[instance.DeployID], nil); recordErr != nil {
					return domain.BackupBatch{}, recordErr
				}
				continue
			}
			return domain.BackupBatch{}, err
		}
	}
	result, err := s.store.Batch(ctx, s.tenantUID, batch.ID)
	if err == nil {
		s.emitBatch(ctx, result.ID)
	}
	return result, err
}

func (s *Service) existingBatch(ctx context.Context, planID string, scheduledAt time.Time) (domain.BackupBatch, error) {
	batches, err := s.store.Batches(ctx, s.tenantUID, 100)
	if err != nil {
		return domain.BackupBatch{}, err
	}
	for _, batch := range batches {
		if batch.PlanID == planID && batch.ScheduledAt.Equal(scheduledAt.UTC()) {
			return batch, nil
		}
	}
	return domain.BackupBatch{}, domain.ErrConflict
}

func (s *Service) planInstances(ctx context.Context, plan domain.BackupPlan) ([]domain.ApplicationInstance, map[string]bool, map[string]domain.BackupScope, error) {
	accepted := map[string]bool{}
	scopes := map[string]domain.BackupScope{}
	if plan.TargetKind != "EXPLICIT" {
		return nil, nil, nil, errors.New("unsupported plan target kind")
	}
	items := make([]domain.ApplicationInstance, 0, len(plan.Targets))
	for _, target := range plan.Targets {
		item, err := s.store.Instance(ctx, s.tenantUID, target.DeployID)
		if errors.Is(err, domain.ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, nil, nil, err
		}
		items = append(items, item)
		accepted[item.DeployID] = target.SharedRiskAccepted || plan.SharedRiskAccepted
		scope := target.Scope
		if scope.Mode == "" {
			scope = domain.BackupScope{Mode: "FULL", Revision: 1}
		}
		scopes[item.DeployID] = scope
	}
	return items, accepted, scopes, nil
}

func (s *Service) enqueueInstance(ctx context.Context, batch domain.BackupBatch, instance domain.ApplicationInstance, sharedRiskAccepted bool, subject string, role domain.Role, maxRetries, retryBackoffSeconds, priority int, scope domain.BackupScope) (domain.BackupJob, domain.BackupTask, error) {
	taskID, err := randomID("task")
	if err != nil {
		return domain.BackupJob{}, domain.BackupTask{}, err
	}
	job, err := s.backups.CreateJob(ctx, instance.DeployID, sharedRiskAccepted, subject, role, batch.PlanID, batch.ID, taskID, batch.TriggerType, batch.ScheduledAt, scope)
	if err != nil {
		return domain.BackupJob{}, domain.BackupTask{}, err
	}
	now := time.Now().UTC()
	task := domain.BackupTask{ID: taskID, TenantUID: s.tenantUID, BatchID: batch.ID, PlanID: batch.PlanID, BackupJobID: job.ID, AppID: instance.AppID, ApplicationName: instance.Name, DeployID: instance.DeployID, MultiInstance: instance.MultiInstance, SharedRiskAccepted: sharedRiskAccepted, TriggerType: batch.TriggerType, Status: "QUEUED", Priority: priority, MaxRetries: maxRetries, RetryBackoffSeconds: retryBackoffSeconds, AvailableAt: now, ScheduledAt: batch.ScheduledAt, CreatedAt: now, Scope: scope}
	if err := s.store.AddTask(ctx, task); err != nil {
		_ = s.store.FailBackupJob(context.Background(), s.tenantUID, job.ID, "QUEUE_PERSIST_FAILED", time.Now().UTC())
		return domain.BackupJob{}, domain.BackupTask{}, err
	}
	return job, task, nil
}

func (s *Service) recordSkipped(ctx context.Context, batch domain.BackupBatch, instance domain.ApplicationInstance, code string, scope domain.BackupScope, validation *domain.PlanPauseReason) error {
	id, err := randomID("task")
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	return s.store.AddTask(ctx, domain.BackupTask{ID: id, TenantUID: s.tenantUID, BatchID: batch.ID, PlanID: batch.PlanID, BackupJobID: "skipped-" + id, AppID: instance.AppID, ApplicationName: instance.Name, DeployID: instance.DeployID, MultiInstance: instance.MultiInstance, TriggerType: batch.TriggerType, Status: "SKIPPED", ErrorCode: code, AvailableAt: now, ScheduledAt: batch.ScheduledAt, CreatedAt: now, FinishedAt: &now, Scope: scope, ScopeValidation: validation})
}

func (s *Service) pauseForScope(ctx context.Context, planID string, reason domain.PlanPauseReason) error {
	if err := s.store.PausePlanForScope(ctx, s.tenantUID, planID, reason); err != nil {
		return err
	}
	if s.onScopeInvalid != nil {
		s.onScopeInvalid(ctx, reason)
	}
	return nil
}

func (s *Service) Cancel(ctx context.Context, id string) (domain.BackupTask, error) {
	task, err := s.store.CancelTask(ctx, s.tenantUID, id, time.Now().UTC())
	if err != nil {
		return domain.BackupTask{}, err
	}
	s.mu.Lock()
	cancel := s.cancelByID[id]
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	s.emitTask(ctx, task.ID)
	s.emitBatch(ctx, task.BatchID)
	return task, nil
}

func (s *Service) Batches(ctx context.Context, limit int) ([]domain.BackupBatch, error) {
	return s.store.Batches(ctx, s.tenantUID, limit)
}

func (s *Service) Batch(ctx context.Context, id string) (domain.BackupBatch, error) {
	return s.store.Batch(ctx, s.tenantUID, id)
}

func (s *Service) Tasks(ctx context.Context, filter domain.TaskFilter) ([]domain.BackupTask, error) {
	return s.store.Tasks(ctx, s.tenantUID, filter)
}

func (s *Service) Task(ctx context.Context, id string) (domain.BackupTask, []domain.TaskAttempt, error) {
	task, err := s.store.Task(ctx, s.tenantUID, id)
	if err != nil {
		return domain.BackupTask{}, nil, err
	}
	attempts, err := s.store.TaskAttempts(ctx, s.tenantUID, id)
	return task, attempts, err
}

func (s *Service) Retry(ctx context.Context, id string) (domain.BackupTask, error) {
	task, err := s.store.Task(ctx, s.tenantUID, id)
	if err != nil {
		return domain.BackupTask{}, err
	}
	if task.Status != "FAILED" && task.Status != "TIMED_OUT" && task.Status != "INTERRUPTED" && task.Status != "CANCELLED" {
		return domain.BackupTask{}, domain.ErrConflict
	}
	now := time.Now().UTC()
	if err := s.store.ResetTaskForManualRetry(ctx, s.tenantUID, id, now); err != nil {
		return domain.BackupTask{}, err
	}
	result, err := s.store.Task(ctx, s.tenantUID, id)
	if err == nil {
		s.emitTask(ctx, result.ID)
		s.emitBatch(ctx, result.BatchID)
	}
	return result, err
}

func (s *Service) worker(index int) {
	workerID := fmt.Sprintf("%s-%d", s.workerID, index+1)
	for {
		now := time.Now().UTC()
		token, err := randomID("lease")
		if err != nil {
			time.Sleep(s.poll)
			continue
		}
		task, err := s.store.ClaimNextTask(context.Background(), s.tenantUID, workerID, token, now, now.Add(s.lease))
		if errors.Is(err, domain.ErrNotFound) {
			time.Sleep(s.poll)
			continue
		}
		if err != nil {
			time.Sleep(s.poll)
			continue
		}
		s.emitTask(context.Background(), task.ID)
		s.emitBatch(context.Background(), task.BatchID)
		s.execute(workerID, token, task)
	}
}

func (s *Service) execute(workerID, token string, task domain.BackupTask) {
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.cancelByID[task.ID] = cancel
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.cancelByID, task.ID)
		s.mu.Unlock()
		cancel()
	}()
	_ = s.store.SetTaskStatus(ctx, s.tenantUID, task.ID, token, "PRECHECKING")
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(s.lease / 3)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				now := time.Now().UTC()
				_ = s.store.HeartbeatTask(context.Background(), s.tenantUID, task.ID, token, now, now.Add(s.lease))
			}
		}
	}()
	err := s.backups.ExecuteJob(ctx, task.BackupJobID)
	close(done)
	now := time.Now().UTC()
	if errors.Is(err, context.Canceled) {
		_ = s.store.FinishTaskFailure(context.Background(), s.tenantUID, task.ID, token, "CANCELLED", "BACKUP_CANCELLED", now)
		s.emitTask(context.Background(), task.ID)
		s.emitBatch(context.Background(), task.BatchID)
		return
	}
	if err == nil {
		job, lookupErr := s.backups.Job(context.Background(), task.BackupJobID)
		if lookupErr == nil {
			_ = s.store.CompleteTask(context.Background(), s.tenantUID, task.ID, token, job.SnapshotID, now)
			if s.afterSucceeded != nil {
				_ = s.afterSucceeded(context.Background(), task)
			}
			s.emitTask(context.Background(), task.ID)
			s.emitBatch(context.Background(), task.BatchID)
		}
		return
	}
	code := backup.Code(err)
	if code == "BACKUP_SCOPE_PATH_MISSING" && task.PlanID != "" && !strings.HasPrefix(task.PlanID, "manual-") {
		path, expected := "", "selected path"
		if failure, ok := backup.ScopeValidation(err); ok {
			path, expected = failure.Path, failure.Expected
		}
		reason := domain.PlanPauseReason{Code: code, DeployID: task.DeployID, Path: path, Expected: expected, DetectedAt: now, ScopeRevision: task.Scope.Revision}
		_ = s.store.SetTaskScopeValidation(context.Background(), s.tenantUID, task.ID, token, reason)
		_ = s.pauseForScope(context.Background(), task.PlanID, reason)
	}
	if retryable(code) && task.AttemptCount <= task.MaxRetries {
		base := task.RetryBackoffSeconds
		if base <= 0 {
			base = 60
		}
		delay := time.Duration(base) * time.Second * time.Duration(1<<min(task.AttemptCount-1, 6))
		_ = s.store.RetryTask(context.Background(), s.tenantUID, task.ID, token, code, now.Add(delay), now)
		s.emitTask(context.Background(), task.ID)
		s.emitBatch(context.Background(), task.BatchID)
		return
	}
	status := "FAILED"
	if code == "BACKUP_TIMED_OUT" {
		status = "TIMED_OUT"
	}
	_ = s.store.FinishTaskFailure(context.Background(), s.tenantUID, task.ID, token, status, code, now)
	s.emitTask(context.Background(), task.ID)
	s.emitBatch(context.Background(), task.BatchID)
}

func (s *Service) emitTask(ctx context.Context, id string) {
	if s.onTaskUpdated == nil {
		return
	}
	task, err := s.store.Task(ctx, s.tenantUID, id)
	if err == nil {
		s.onTaskUpdated(ctx, task)
	}
}

func (s *Service) emitBatch(ctx context.Context, id string) {
	if s.onBatchUpdated == nil {
		return
	}
	batch, err := s.store.Batch(ctx, s.tenantUID, id)
	if err == nil {
		s.onBatchUpdated(ctx, batch)
	}
}

func retryable(code string) bool {
	switch code {
	case "BACKUP_CANCELLED", "NO_APPLICATION_DATA", "UNSUPPORTED_DATABASE", "INSTANCE_NOT_BACKUPABLE", "SHARED_INSTANCE_CONFIRMATION_REQUIRED", "SOURCE_OWNER_MISMATCH", "SOURCE_INSTANCE_NOT_FOUND", "BACKUP_SCOPE_PATH_MISSING":
		return false
	default:
		return true
	}
}

func min(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func randomID(prefix string) (string, error) {
	bytes := make([]byte, 12)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return prefix + "-" + hex.EncodeToString(bytes), nil
}
