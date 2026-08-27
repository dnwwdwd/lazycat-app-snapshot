package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
)

func (s *Store) CreatePlan(ctx context.Context, plan domain.BackupPlan) error {
	if plan.ID == "" || plan.TenantUID == "" || strings.TrimSpace(plan.Name) == "" {
		return errors.New("invalid backup plan")
	}
	retention, err := json.Marshal(plan.Retention)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO backup_plans(id, tenant_uid, name, target_kind, shared_risk_accepted, schedule_type, cron_expression, timezone, enabled, catch_up, max_catch_up_seconds, max_retries, retry_backoff_seconds, retention_json, created_by_subject, created_at, updated_at, last_scheduled_at, next_run_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		plan.ID, plan.TenantUID, plan.Name, plan.TargetKind, boolInt(plan.SharedRiskAccepted), plan.ScheduleType, plan.CronExpression, plan.Timezone, boolInt(plan.Enabled), boolInt(plan.CatchUp), plan.MaxCatchUpSeconds, plan.Retry.MaxRetries, plan.Retry.BackoffSeconds, string(retention), plan.CreatedBySubject, unix(plan.CreatedAt), unix(plan.UpdatedAt), nullableUnix(plan.LastScheduledAt), nullableUnix(plan.NextRunAt))
	if err != nil {
		return err
	}
	if err := replacePlanTargets(ctx, tx, plan); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) UpdatePlan(ctx context.Context, tenant string, plan domain.BackupPlan) error {
	if tenant == "" || plan.ID == "" || plan.TenantUID != tenant {
		return errors.New("invalid backup plan update")
	}
	retention, err := json.Marshal(plan.Retention)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE backup_plans SET name=?, target_kind=?, shared_risk_accepted=?, schedule_type=?, cron_expression=?, timezone=?, enabled=?, catch_up=?, max_catch_up_seconds=?, max_retries=?, retry_backoff_seconds=?, retention_json=?, updated_at=?, next_run_at=? WHERE tenant_uid=? AND id=?`,
		plan.Name, plan.TargetKind, boolInt(plan.SharedRiskAccepted), plan.ScheduleType, plan.CronExpression, plan.Timezone, boolInt(plan.Enabled), boolInt(plan.CatchUp), plan.MaxCatchUpSeconds, plan.Retry.MaxRetries, plan.Retry.BackoffSeconds, string(retention), unix(plan.UpdatedAt), nullableUnix(plan.NextRunAt), tenant, plan.ID)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return domain.ErrNotFound
	}
	if err := replacePlanTargets(ctx, tx, plan); err != nil {
		return err
	}
	return tx.Commit()
}

func replacePlanTargets(ctx context.Context, tx *sql.Tx, plan domain.BackupPlan) error {
	if _, err := tx.ExecContext(ctx, "DELETE FROM plan_targets WHERE plan_id=? AND tenant_uid=?", plan.ID, plan.TenantUID); err != nil {
		return err
	}
	for _, target := range plan.Targets {
		if target.DeployID == "" {
			return errors.New("plan target is required")
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO plan_targets(plan_id, tenant_uid, deploy_id, shared_risk_accepted) VALUES(?, ?, ?, ?)", plan.ID, plan.TenantUID, target.DeployID, boolInt(target.SharedRiskAccepted)); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Plans(ctx context.Context, tenant string) ([]domain.BackupPlan, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_uid, name, target_kind, shared_risk_accepted, schedule_type, cron_expression, timezone, enabled, catch_up, max_catch_up_seconds, max_retries, retry_backoff_seconds, retention_json, created_by_subject, created_at, updated_at, last_scheduled_at, next_run_at FROM backup_plans WHERE tenant_uid=? ORDER BY created_at DESC, id DESC`, tenant)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	plans := []domain.BackupPlan{}
	for rows.Next() {
		plan, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	for index := range plans {
		targets, err := s.PlanTargets(ctx, tenant, plans[index].ID)
		if err != nil {
			return nil, err
		}
		plans[index].Targets = targets
	}
	return plans, nil
}

func (s *Store) Plan(ctx context.Context, tenant, id string) (domain.BackupPlan, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, tenant_uid, name, target_kind, shared_risk_accepted, schedule_type, cron_expression, timezone, enabled, catch_up, max_catch_up_seconds, max_retries, retry_backoff_seconds, retention_json, created_by_subject, created_at, updated_at, last_scheduled_at, next_run_at FROM backup_plans WHERE tenant_uid=? AND id=?`, tenant, id)
	plan, err := scanPlan(row)
	if err != nil {
		return domain.BackupPlan{}, err
	}
	plan.Targets, err = s.PlanTargets(ctx, tenant, id)
	return plan, err
}

func (s *Store) PlanTargets(ctx context.Context, tenant, id string) ([]domain.PlanTarget, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT deploy_id, shared_risk_accepted FROM plan_targets WHERE tenant_uid=? AND plan_id=? ORDER BY deploy_id", tenant, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	targets := []domain.PlanTarget{}
	for rows.Next() {
		var target domain.PlanTarget
		var accepted int
		if err := rows.Scan(&target.DeployID, &accepted); err != nil {
			return nil, err
		}
		target.SharedRiskAccepted = accepted != 0
		targets = append(targets, target)
	}
	return targets, rows.Err()
}

func (s *Store) DeletePlan(ctx context.Context, tenant, id string) error {
	result, err := s.db.ExecContext(ctx, "DELETE FROM backup_plans WHERE tenant_uid=? AND id=?", tenant, id)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return domain.ErrNotFound
	}
	return nil
}

func (s *Store) SetPlanEnabled(ctx context.Context, tenant, id string, enabled bool, nextRun *time.Time, updated time.Time) error {
	result, err := s.db.ExecContext(ctx, "UPDATE backup_plans SET enabled=?, next_run_at=?, updated_at=? WHERE tenant_uid=? AND id=?", boolInt(enabled), nullableUnix(nextRun), unix(updated), tenant, id)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return domain.ErrNotFound
	}
	return nil
}

func (s *Store) AdvancePlan(ctx context.Context, tenant, id string, scheduledAt time.Time, nextRun *time.Time, updated time.Time) error {
	_, err := s.db.ExecContext(ctx, "UPDATE backup_plans SET last_scheduled_at=?, next_run_at=?, updated_at=? WHERE tenant_uid=? AND id=?", unix(scheduledAt), nullableUnix(nextRun), unix(updated), tenant, id)
	return err
}

func (s *Store) DuePlans(ctx context.Context, tenant string, now time.Time) ([]domain.BackupPlan, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_uid, name, target_kind, shared_risk_accepted, schedule_type, cron_expression, timezone, enabled, catch_up, max_catch_up_seconds, max_retries, retry_backoff_seconds, retention_json, created_by_subject, created_at, updated_at, last_scheduled_at, next_run_at FROM backup_plans WHERE tenant_uid=? AND enabled=1 AND next_run_at IS NOT NULL AND next_run_at<=? ORDER BY next_run_at, id`, tenant, unix(now))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	plans := []domain.BackupPlan{}
	for rows.Next() {
		plan, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	for index := range plans {
		targets, err := s.PlanTargets(ctx, tenant, plans[index].ID)
		if err != nil {
			return nil, err
		}
		plans[index].Targets = targets
	}
	return plans, nil
}

func (s *Store) CreateBatch(ctx context.Context, batch domain.BackupBatch) error {
	if batch.ID == "" || batch.TenantUID == "" || batch.TriggerType == "" {
		return errors.New("invalid backup batch")
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO backup_batches(id, tenant_uid, plan_id, plan_name, trigger_type, status, scheduled_at, created_at, started_at, finished_at, total_tasks, succeeded_count, failed_count, skipped_count, running_count, queued_count)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, batch.ID, batch.TenantUID, batch.PlanID, batch.PlanName, batch.TriggerType, batch.Status, unix(batch.ScheduledAt), unix(batch.CreatedAt), nullableUnix(batch.StartedAt), nullableUnix(batch.FinishedAt), batch.TotalTasks, batch.Succeeded, batch.Failed, batch.Skipped, batch.Running, batch.Queued)
	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		return domain.ErrConflict
	}
	return err
}

func (s *Store) AddTask(ctx context.Context, task domain.BackupTask) error {
	if task.ID == "" || task.TenantUID == "" || task.BatchID == "" || task.BackupJobID == "" || task.DeployID == "" {
		return errors.New("invalid backup task")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO backup_tasks(id, tenant_uid, batch_id, plan_id, backup_job_id, appid, application_name, deploy_id, multi_instance, shared_risk_accepted, trigger_type, status, priority, attempt_count, max_retries, retry_backoff_seconds, error_code, available_at, scheduled_at, created_at, started_at, finished_at, lease_token, worker_id, lease_expires_at, heartbeat_at, snapshot_id)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '', '', NULL, NULL, '')`, task.ID, task.TenantUID, task.BatchID, task.PlanID, task.BackupJobID, task.AppID, task.ApplicationName, task.DeployID, boolInt(task.MultiInstance), boolInt(task.SharedRiskAccepted), task.TriggerType, task.Status, task.Priority, task.AttemptCount, task.MaxRetries, task.RetryBackoffSeconds, task.ErrorCode, unix(task.AvailableAt), unix(task.ScheduledAt), unix(task.CreatedAt))
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return domain.ErrConflict
		}
		return err
	}
	if err := refreshBatch(ctx, tx, task.TenantUID, task.BatchID, time.Now().UTC()); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) Batches(ctx context.Context, tenant string, limit int) ([]domain.BackupBatch, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_uid, plan_id, plan_name, trigger_type, status, scheduled_at, created_at, started_at, finished_at, total_tasks, succeeded_count, failed_count, skipped_count, running_count, queued_count FROM backup_batches WHERE tenant_uid=? ORDER BY scheduled_at DESC, id DESC LIMIT ?`, tenant, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.BackupBatch{}
	for rows.Next() {
		item, err := scanBatch(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) Batch(ctx context.Context, tenant, id string) (domain.BackupBatch, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, tenant_uid, plan_id, plan_name, trigger_type, status, scheduled_at, created_at, started_at, finished_at, total_tasks, succeeded_count, failed_count, skipped_count, running_count, queued_count FROM backup_batches WHERE tenant_uid=? AND id=?`, tenant, id)
	return scanBatch(row)
}

func (s *Store) Tasks(ctx context.Context, tenant string, filter domain.TaskFilter) ([]domain.BackupTask, error) {
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	conditions, args := []string{"tenant_uid=?"}, []any{tenant}
	if filter.Status != "" {
		conditions, args = append(conditions, "status=?"), append(args, filter.Status)
	}
	if filter.BatchID != "" {
		conditions, args = append(conditions, "batch_id=?"), append(args, filter.BatchID)
	}
	args = append(args, filter.Limit)
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_uid, batch_id, plan_id, backup_job_id, appid, application_name, deploy_id, multi_instance, shared_risk_accepted, trigger_type, status, priority, attempt_count, max_retries, retry_backoff_seconds, error_code, available_at, scheduled_at, created_at, started_at, finished_at, lease_expires_at, heartbeat_at, snapshot_id FROM backup_tasks WHERE `+strings.Join(conditions, " AND ")+` ORDER BY created_at DESC, id DESC LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.BackupTask{}
	for rows.Next() {
		item, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) Task(ctx context.Context, tenant, id string) (domain.BackupTask, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, tenant_uid, batch_id, plan_id, backup_job_id, appid, application_name, deploy_id, multi_instance, shared_risk_accepted, trigger_type, status, priority, attempt_count, max_retries, retry_backoff_seconds, error_code, available_at, scheduled_at, created_at, started_at, finished_at, lease_expires_at, heartbeat_at, snapshot_id FROM backup_tasks WHERE tenant_uid=? AND id=?`, tenant, id)
	return scanTask(row)
}

func (s *Store) TaskAttempts(ctx context.Context, tenant, taskID string) ([]domain.TaskAttempt, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, task_id, attempt, status, error_code, started_at, finished_at FROM task_attempts WHERE tenant_uid=? AND task_id=? ORDER BY attempt DESC", tenant, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.TaskAttempt{}
	for rows.Next() {
		var item domain.TaskAttempt
		var started int64
		var finished sql.NullInt64
		if err := rows.Scan(&item.ID, &item.TaskID, &item.Attempt, &item.Status, &item.ErrorCode, &started, &finished); err != nil {
			return nil, err
		}
		item.StartedAt, item.FinishedAt = time.Unix(started, 0).UTC(), fromUnix(finished)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) ClaimNextTask(ctx context.Context, tenant, workerID, leaseToken string, now, expires time.Time) (domain.BackupTask, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.BackupTask{}, err
	}
	defer tx.Rollback()
	row := tx.QueryRowContext(ctx, `SELECT id, tenant_uid, batch_id, plan_id, backup_job_id, appid, application_name, deploy_id, multi_instance, shared_risk_accepted, trigger_type, status, priority, attempt_count, max_retries, retry_backoff_seconds, error_code, available_at, scheduled_at, created_at, started_at, finished_at, lease_expires_at, heartbeat_at, snapshot_id FROM backup_tasks WHERE tenant_uid=? AND status='QUEUED' AND available_at<=? ORDER BY priority DESC, available_at, created_at, id LIMIT 1`, tenant, unix(now))
	task, err := scanTask(row)
	if errors.Is(err, domain.ErrNotFound) {
		return domain.BackupTask{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.BackupTask{}, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE backup_tasks SET status='LEASED', attempt_count=attempt_count+1, worker_id=?, lease_token=?, lease_expires_at=?, heartbeat_at=?, started_at=COALESCE(started_at, ?) WHERE id=? AND tenant_uid=? AND status='QUEUED'`, workerID, leaseToken, unix(expires), unix(now), unix(now), task.ID, tenant)
	if err != nil {
		return domain.BackupTask{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return domain.BackupTask{}, err
	}
	if changed != 1 {
		return domain.BackupTask{}, domain.ErrNotFound
	}
	attempt := task.AttemptCount + 1
	if _, err := tx.ExecContext(ctx, "INSERT INTO task_attempts(id, tenant_uid, task_id, attempt, status, error_code, worker_id, started_at, finished_at) VALUES(?, ?, ?, ?, 'RUNNING', '', ?, ?, NULL)", fmt.Sprintf("%s-%d", task.ID, attempt), tenant, task.ID, attempt, workerID, unix(now)); err != nil {
		return domain.BackupTask{}, err
	}
	if err := refreshBatch(ctx, tx, tenant, task.BatchID, now); err != nil {
		return domain.BackupTask{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.BackupTask{}, err
	}
	task.Status, task.AttemptCount, task.StartedAt, task.LeaseExpiresAt, task.HeartbeatAt = "LEASED", attempt, &now, &expires, &now
	return task, nil
}

func (s *Store) SetTaskStatus(ctx context.Context, tenant, id, token, status string) error {
	result, err := s.db.ExecContext(ctx, "UPDATE backup_tasks SET status=? WHERE tenant_uid=? AND id=? AND lease_token=? AND status IN ('LEASED','PRECHECKING','SCANNING','SQLITE_SNAPSHOT','ZIP_WRITING','VERIFYING','COMMITTING')", status, tenant, id, token)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return domain.ErrNotFound
	}
	return nil
}

func (s *Store) HeartbeatTask(ctx context.Context, tenant, id, token string, now, expires time.Time) error {
	_, err := s.db.ExecContext(ctx, "UPDATE backup_tasks SET heartbeat_at=?, lease_expires_at=? WHERE tenant_uid=? AND id=? AND lease_token=? AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED','TIMED_OUT','SKIPPED','INTERRUPTED')", unix(now), unix(expires), tenant, id, token)
	return err
}

func (s *Store) CompleteTask(ctx context.Context, tenant, id, token, snapshotID string, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, "UPDATE backup_tasks SET status='SUCCEEDED', snapshot_id=?, finished_at=?, lease_token='', worker_id='', lease_expires_at=NULL, heartbeat_at=NULL WHERE tenant_uid=? AND id=? AND lease_token=?", snapshotID, unix(now), tenant, id, token)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return domain.ErrNotFound
	}
	if _, err := tx.ExecContext(ctx, "UPDATE task_attempts SET status='SUCCEEDED', finished_at=? WHERE tenant_uid=? AND task_id=? AND status='RUNNING'", unix(now), tenant, id); err != nil {
		return err
	}
	var batchID string
	if err := tx.QueryRowContext(ctx, "SELECT batch_id FROM backup_tasks WHERE tenant_uid=? AND id=?", tenant, id).Scan(&batchID); err != nil {
		return err
	}
	if err := refreshBatch(ctx, tx, tenant, batchID, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) RetryTask(ctx context.Context, tenant, id, token, code string, availableAt, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, "UPDATE backup_tasks SET status='QUEUED', error_code=?, available_at=?, lease_token='', worker_id='', lease_expires_at=NULL, heartbeat_at=NULL WHERE tenant_uid=? AND id=? AND lease_token=?", code, unix(availableAt), tenant, id, token)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return domain.ErrNotFound
	}
	if _, err := tx.ExecContext(ctx, "UPDATE task_attempts SET status='FAILED', error_code=?, finished_at=? WHERE tenant_uid=? AND task_id=? AND status='RUNNING'", code, unix(now), tenant, id); err != nil {
		return err
	}
	var batchID, jobID string
	if err := tx.QueryRowContext(ctx, "SELECT batch_id, backup_job_id FROM backup_tasks WHERE tenant_uid=? AND id=?", tenant, id).Scan(&batchID, &jobID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE backup_jobs SET status='QUEUED', error_code='', finished_at=NULL WHERE tenant_uid=? AND id=? AND status='FAILED'", tenant, jobID); err != nil {
		return err
	}
	if err := refreshBatch(ctx, tx, tenant, batchID, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) FinishTaskFailure(ctx context.Context, tenant, id, token, status, code string, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, "UPDATE backup_tasks SET status=?, error_code=?, finished_at=?, lease_token='', worker_id='', lease_expires_at=NULL, heartbeat_at=NULL WHERE tenant_uid=? AND id=? AND lease_token=?", status, code, unix(now), tenant, id, token)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return domain.ErrNotFound
	}
	if _, err := tx.ExecContext(ctx, "UPDATE task_attempts SET status=?, error_code=?, finished_at=? WHERE tenant_uid=? AND task_id=? AND status='RUNNING'", status, code, unix(now), tenant, id); err != nil {
		return err
	}
	var batchID string
	if err := tx.QueryRowContext(ctx, "SELECT batch_id FROM backup_tasks WHERE tenant_uid=? AND id=?", tenant, id).Scan(&batchID); err != nil {
		return err
	}
	if err := refreshBatch(ctx, tx, tenant, batchID, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) CancelTask(ctx context.Context, tenant, id string, now time.Time) (domain.BackupTask, error) {
	task, err := s.Task(ctx, tenant, id)
	if err != nil {
		return domain.BackupTask{}, err
	}
	if task.Status == "QUEUED" {
		if _, err := s.db.ExecContext(ctx, "UPDATE backup_tasks SET status='CANCELLED', finished_at=?, error_code='TASK_CANCELLED' WHERE tenant_uid=? AND id=? AND status='QUEUED'", unix(now), tenant, id); err != nil {
			return domain.BackupTask{}, err
		}
		_, _ = s.db.ExecContext(ctx, "UPDATE backup_jobs SET status='FAILED', error_code='BACKUP_CANCELLED', finished_at=? WHERE tenant_uid=? AND id=? AND status='QUEUED'", unix(now), tenant, task.BackupJobID)
		return s.Task(ctx, tenant, id)
	}
	if task.Status == "LEASED" || task.Status == "PRECHECKING" || task.Status == "SCANNING" || task.Status == "SQLITE_SNAPSHOT" || task.Status == "ZIP_WRITING" || task.Status == "VERIFYING" || task.Status == "COMMITTING" {
		return task, nil
	}
	return domain.BackupTask{}, domain.ErrConflict
}

func (s *Store) RequeueExpiredTasks(ctx context.Context, tenant string, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, "SELECT id, backup_job_id, batch_id FROM backup_tasks WHERE tenant_uid=? AND status NOT IN ('QUEUED','SUCCEEDED','FAILED','CANCELLED','TIMED_OUT','SKIPPED','INTERRUPTED') AND lease_expires_at IS NOT NULL AND lease_expires_at<=?", tenant, unix(now))
	if err != nil {
		return err
	}
	type expired struct{ id, jobID, batchID string }
	items := []expired{}
	for rows.Next() {
		var item expired
		if err := rows.Scan(&item.id, &item.jobID, &item.batchID); err != nil {
			_ = rows.Close()
			return err
		}
		items = append(items, item)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, item := range items {
		if _, err := tx.ExecContext(ctx, "UPDATE backup_tasks SET status='QUEUED', error_code='WORKER_INTERRUPTED', available_at=?, lease_token='', worker_id='', lease_expires_at=NULL, heartbeat_at=NULL WHERE tenant_uid=? AND id=?", unix(now), tenant, item.id); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "UPDATE backup_jobs SET status='QUEUED', error_code='', started_at=NULL, finished_at=NULL WHERE tenant_uid=? AND id=? AND status='RUNNING'", tenant, item.jobID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "UPDATE task_attempts SET status='INTERRUPTED', error_code='WORKER_INTERRUPTED', finished_at=? WHERE tenant_uid=? AND task_id=? AND status='RUNNING'", unix(now), tenant, item.id); err != nil {
			return err
		}
		if err := refreshBatch(ctx, tx, tenant, item.batchID, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ResetTaskForManualRetry(ctx context.Context, tenant, id string, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var batchID, jobID string
	result, err := tx.ExecContext(ctx, `UPDATE backup_tasks SET status='QUEUED', error_code='MANUAL_RETRY', available_at=?, finished_at=NULL, lease_token='', worker_id='', lease_expires_at=NULL, heartbeat_at=NULL
		WHERE tenant_uid=? AND id=? AND status IN ('FAILED','TIMED_OUT','INTERRUPTED','CANCELLED')`, unix(now), tenant, id)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return domain.ErrConflict
	}
	if err := tx.QueryRowContext(ctx, "SELECT batch_id, backup_job_id FROM backup_tasks WHERE tenant_uid=? AND id=?", tenant, id).Scan(&batchID, &jobID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE backup_jobs SET status='QUEUED', error_code='', started_at=NULL, finished_at=NULL WHERE tenant_uid=? AND id=? AND status='FAILED'", tenant, jobID); err != nil {
		return err
	}
	if err := refreshBatch(ctx, tx, tenant, batchID, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) BackupableInstances(ctx context.Context, tenant string) ([]domain.ApplicationInstance, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT a.appid, a.name, a.version, a.icon, i.deploy_id, i.multi_instance, i.capability_status, i.read_only_mode, i.total_bytes, i.file_count, i.sqlite_count, i.skipped_count, i.probe_error_code, i.last_probed_at, i.last_synced_at,
		(SELECT MAX(captured_at) FROM snapshots WHERE snapshots.tenant_uid=i.tenant_uid AND snapshots.deploy_id=i.deploy_id AND snapshots.status='COMPLETED' AND snapshots.retention_status <> 'TRASHED')
		FROM application_instances i JOIN applications a ON a.tenant_uid=i.tenant_uid AND a.appid=i.appid WHERE i.tenant_uid=? AND i.active=1 AND i.capability_status IN ('BACKUPABLE','BACKUPABLE_SHARED_WARNING') ORDER BY i.appid, i.deploy_id`, tenant)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.ApplicationInstance{}
	for rows.Next() {
		item, err := scanInstance(rows)
		if err != nil {
			return nil, err
		}
		item.TenantUID = tenant
		items = append(items, item)
	}
	return items, rows.Err()
}

func refreshBatch(ctx context.Context, tx *sql.Tx, tenant, batchID string, now time.Time) error {
	var total, succeeded, failed, skipped, running, queued int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*),
		SUM(CASE WHEN status IN ('SUCCEEDED','SUCCEEDED_WITH_WARNINGS') THEN 1 ELSE 0 END),
		SUM(CASE WHEN status IN ('FAILED','TIMED_OUT','INTERRUPTED','CANCELLED') THEN 1 ELSE 0 END),
		SUM(CASE WHEN status='SKIPPED' THEN 1 ELSE 0 END),
		SUM(CASE WHEN status NOT IN ('QUEUED','SUCCEEDED','SUCCEEDED_WITH_WARNINGS','FAILED','TIMED_OUT','INTERRUPTED','CANCELLED','SKIPPED') THEN 1 ELSE 0 END),
		SUM(CASE WHEN status='QUEUED' THEN 1 ELSE 0 END) FROM backup_tasks WHERE tenant_uid=? AND batch_id=?`, tenant, batchID).Scan(&total, &succeeded, &failed, &skipped, &running, &queued); err != nil {
		return err
	}
	status := "QUEUED"
	var started, finished any
	if total == 0 || (queued == 0 && running == 0) {
		finished = unix(now)
		switch {
		case failed > 0:
			status = "FAILED"
		case succeeded > 0:
			status = "SUCCEEDED"
		default:
			status = "SKIPPED"
		}
	} else if running > 0 || succeeded > 0 || failed > 0 || skipped > 0 {
		status, started = "RUNNING", unix(now)
	}
	_, err := tx.ExecContext(ctx, "UPDATE backup_batches SET status=?, total_tasks=?, succeeded_count=?, failed_count=?, skipped_count=?, running_count=?, queued_count=?, started_at=COALESCE(started_at, ?), finished_at=? WHERE tenant_uid=? AND id=?", status, total, succeeded, failed, skipped, running, queued, started, finished, tenant, batchID)
	return err
}

func scanPlan(row scanner) (domain.BackupPlan, error) {
	var plan domain.BackupPlan
	var shared, enabled, catchUp int
	var retention string
	var created, updated int64
	var last, next sql.NullInt64
	err := row.Scan(&plan.ID, &plan.TenantUID, &plan.Name, &plan.TargetKind, &shared, &plan.ScheduleType, &plan.CronExpression, &plan.Timezone, &enabled, &catchUp, &plan.MaxCatchUpSeconds, &plan.Retry.MaxRetries, &plan.Retry.BackoffSeconds, &retention, &plan.CreatedBySubject, &created, &updated, &last, &next)
	if errors.Is(err, sql.ErrNoRows) {
		return plan, domain.ErrNotFound
	}
	if err != nil {
		return plan, err
	}
	if err := json.Unmarshal([]byte(retention), &plan.Retention); err != nil {
		return plan, err
	}
	plan.SharedRiskAccepted, plan.Enabled, plan.CatchUp = shared != 0, enabled != 0, catchUp != 0
	plan.CreatedAt, plan.UpdatedAt, plan.LastScheduledAt, plan.NextRunAt = time.Unix(created, 0).UTC(), time.Unix(updated, 0).UTC(), fromUnix(last), fromUnix(next)
	return plan, nil
}

func scanBatch(row scanner) (domain.BackupBatch, error) {
	var batch domain.BackupBatch
	var scheduled, created int64
	var started, finished sql.NullInt64
	err := row.Scan(&batch.ID, &batch.TenantUID, &batch.PlanID, &batch.PlanName, &batch.TriggerType, &batch.Status, &scheduled, &created, &started, &finished, &batch.TotalTasks, &batch.Succeeded, &batch.Failed, &batch.Skipped, &batch.Running, &batch.Queued)
	if errors.Is(err, sql.ErrNoRows) {
		return batch, domain.ErrNotFound
	}
	if err != nil {
		return batch, err
	}
	batch.ScheduledAt, batch.CreatedAt, batch.StartedAt, batch.FinishedAt = time.Unix(scheduled, 0).UTC(), time.Unix(created, 0).UTC(), fromUnix(started), fromUnix(finished)
	return batch, nil
}

func scanTask(row scanner) (domain.BackupTask, error) {
	var task domain.BackupTask
	var multi, shared int
	var available, scheduled, created int64
	var started, finished, lease, heartbeat sql.NullInt64
	err := row.Scan(&task.ID, &task.TenantUID, &task.BatchID, &task.PlanID, &task.BackupJobID, &task.AppID, &task.ApplicationName, &task.DeployID, &multi, &shared, &task.TriggerType, &task.Status, &task.Priority, &task.AttemptCount, &task.MaxRetries, &task.RetryBackoffSeconds, &task.ErrorCode, &available, &scheduled, &created, &started, &finished, &lease, &heartbeat, &task.SnapshotID)
	if errors.Is(err, sql.ErrNoRows) {
		return task, domain.ErrNotFound
	}
	if err != nil {
		return task, err
	}
	task.MultiInstance, task.SharedRiskAccepted = multi != 0, shared != 0
	task.AvailableAt, task.ScheduledAt, task.CreatedAt = time.Unix(available, 0).UTC(), time.Unix(scheduled, 0).UTC(), time.Unix(created, 0).UTC()
	task.StartedAt, task.FinishedAt, task.LeaseExpiresAt, task.HeartbeatAt = fromUnix(started), fromUnix(finished), fromUnix(lease), fromUnix(heartbeat)
	return task, nil
}
