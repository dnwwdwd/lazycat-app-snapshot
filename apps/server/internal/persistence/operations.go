package persistence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
)

func defaultSettings(now time.Time) domain.Settings {
	return domain.Settings{
		Locale: "zh-CN", Timezone: "Asia/Shanghai", CatchUp: true,
		MaxCatchUpSeconds:  int((24 * time.Hour).Seconds()),
		Retry:              domain.RetryPolicy{MaxRetries: 2, BackoffSeconds: 60},
		Retention:          domain.RetentionPolicy{KeepLast: 7, KeepDaily: 7, KeepWeekly: 4, KeepMonthly: 3, TrashGraceHours: 7 * 24},
		NotifyFirstFailure: true, UpdatedAt: now.UTC(),
	}
}

func (s *Store) Settings(ctx context.Context, tenant string) (domain.Settings, error) {
	var result domain.Settings
	var catchUp, firstFailure, success int
	var retention string
	var updated int64
	err := s.db.QueryRowContext(ctx, `SELECT locale, timezone, catch_up, max_catch_up_seconds, max_retries, retry_backoff_seconds,
		retention_json, notify_first_failure, notify_success, updated_at FROM settings WHERE tenant_uid=?`, tenant).Scan(
		&result.Locale, &result.Timezone, &catchUp, &result.MaxCatchUpSeconds, &result.Retry.MaxRetries,
		&result.Retry.BackoffSeconds, &retention, &firstFailure, &success, &updated,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return defaultSettings(time.Now().UTC()), nil
	}
	if err != nil {
		return domain.Settings{}, err
	}
	if err := json.Unmarshal([]byte(retention), &result.Retention); err != nil {
		return domain.Settings{}, err
	}
	result.CatchUp, result.NotifyFirstFailure, result.NotifySuccess = catchUp != 0, firstFailure != 0, success != 0
	result.UpdatedAt = time.Unix(updated, 0).UTC()
	return result, nil
}

func (s *Store) SaveSettings(ctx context.Context, tenant string, value domain.Settings) error {
	retention, err := json.Marshal(value.Retention)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO settings(tenant_uid, locale, timezone, catch_up, max_catch_up_seconds,
		max_retries, retry_backoff_seconds, retention_json, notify_first_failure, notify_success, updated_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(tenant_uid) DO UPDATE SET locale=excluded.locale, timezone=excluded.timezone, catch_up=excluded.catch_up,
		max_catch_up_seconds=excluded.max_catch_up_seconds, max_retries=excluded.max_retries,
		retry_backoff_seconds=excluded.retry_backoff_seconds, retention_json=excluded.retention_json,
		notify_first_failure=excluded.notify_first_failure, notify_success=excluded.notify_success, updated_at=excluded.updated_at`,
		tenant, value.Locale, value.Timezone, boolInt(value.CatchUp), value.MaxCatchUpSeconds, value.Retry.MaxRetries,
		value.Retry.BackoffSeconds, string(retention), boolInt(value.NotifyFirstFailure), boolInt(value.NotifySuccess), unix(value.UpdatedAt))
	return err
}

func (s *Store) CreateAlert(ctx context.Context, value domain.Alert) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO alerts(id, tenant_uid, level, type, code, title, message, reference_type,
		reference_id, status, read_at, resolved_at, muted_until, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
		value.ID, value.TenantUID, value.Level, value.Type, value.Code, value.Title, value.Message, value.ReferenceType,
		value.ReferenceID, value.Status, unix(value.CreatedAt), unix(value.UpdatedAt))
	return err
}

func (s *Store) Alerts(ctx context.Context, tenant, status string, limit int) ([]domain.Alert, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `SELECT id, tenant_uid, level, type, code, title, message, reference_type, reference_id, status,
		read_at, resolved_at, muted_until, created_at, updated_at FROM alerts WHERE tenant_uid=?`
	args := []any{tenant}
	if status != "" && status != "ALL" {
		query += " AND status=?"
		args = append(args, status)
	}
	query += " ORDER BY created_at DESC, id DESC LIMIT ?"
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.Alert{}
	for rows.Next() {
		item, err := scanAlert(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) Alert(ctx context.Context, tenant, id string) (domain.Alert, error) {
	return scanAlert(s.db.QueryRowContext(ctx, `SELECT id, tenant_uid, level, type, code, title, message, reference_type,
		reference_id, status, read_at, resolved_at, muted_until, created_at, updated_at FROM alerts WHERE tenant_uid=? AND id=?`, tenant, id))
}

func (s *Store) MarkAlertRead(ctx context.Context, tenant, id string, now time.Time) (domain.Alert, error) {
	result, err := s.db.ExecContext(ctx, "UPDATE alerts SET read_at=COALESCE(read_at, ?), updated_at=? WHERE tenant_uid=? AND id=?", unix(now), unix(now), tenant, id)
	if err != nil {
		return domain.Alert{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return domain.Alert{}, err
	}
	if changed != 1 {
		return domain.Alert{}, domain.ErrNotFound
	}
	return s.Alert(ctx, tenant, id)
}

func (s *Store) ResolveAlert(ctx context.Context, tenant, id string, now time.Time) (domain.Alert, error) {
	result, err := s.db.ExecContext(ctx, "UPDATE alerts SET status='RESOLVED', resolved_at=?, updated_at=? WHERE tenant_uid=? AND id=? AND status <> 'RESOLVED'", unix(now), unix(now), tenant, id)
	if err != nil {
		return domain.Alert{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return domain.Alert{}, err
	}
	if changed != 1 {
		return domain.Alert{}, domain.ErrNotFound
	}
	return s.Alert(ctx, tenant, id)
}

func (s *Store) MuteAlert(ctx context.Context, tenant, id string, until time.Time) (domain.Alert, error) {
	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, "UPDATE alerts SET status='MUTED', muted_until=?, updated_at=? WHERE tenant_uid=? AND id=? AND status <> 'RESOLVED'", unix(until), unix(now), tenant, id)
	if err != nil {
		return domain.Alert{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return domain.Alert{}, err
	}
	if changed != 1 {
		return domain.Alert{}, domain.ErrNotFound
	}
	return s.Alert(ctx, tenant, id)
}

func (s *Store) AppendAudit(ctx context.Context, value domain.AuditEntry) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO audit_entries(id, tenant_uid, action, subject, entity_type, entity_id, metadata, created_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, value.ID, value.TenantUID, value.Action, value.Subject, value.EntityType, value.EntityID, value.Metadata, unix(value.CreatedAt))
	return err
}

func (s *Store) Audits(ctx context.Context, tenant string, limit int) ([]domain.AuditEntry, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_uid, action, subject, entity_type, entity_id, metadata, created_at
		FROM audit_entries WHERE tenant_uid=? ORDER BY created_at DESC, id DESC LIMIT ?`, tenant, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.AuditEntry{}
	for rows.Next() {
		var item domain.AuditEntry
		var created int64
		if err := rows.Scan(&item.ID, &item.TenantUID, &item.Action, &item.Subject, &item.EntityType, &item.EntityID, &item.Metadata, &created); err != nil {
			return nil, err
		}
		item.CreatedAt = time.Unix(created, 0).UTC()
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) AppendEvent(ctx context.Context, tenant, eventType, data string, now time.Time) (domain.Event, error) {
	result, err := s.db.ExecContext(ctx, "INSERT INTO event_log(tenant_uid, type, data, created_at) VALUES(?, ?, ?, ?)", tenant, eventType, data, unix(now))
	if err != nil {
		return domain.Event{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.Event{}, err
	}
	return domain.Event{ID: id, TenantUID: tenant, Type: eventType, Data: data, CreatedAt: now.UTC()}, nil
}

func (s *Store) EventsAfter(ctx context.Context, tenant string, after int64, limit int) ([]domain.Event, error) {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, "SELECT id, tenant_uid, type, data, created_at FROM event_log WHERE tenant_uid=? AND id>? ORDER BY id LIMIT ?", tenant, after, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.Event{}
	for rows.Next() {
		var item domain.Event
		var created int64
		if err := rows.Scan(&item.ID, &item.TenantUID, &item.Type, &item.Data, &created); err != nil {
			return nil, err
		}
		item.CreatedAt = time.Unix(created, 0).UTC()
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) Overview(ctx context.Context, tenant string, since time.Time) (domain.Overview, error) {
	var result domain.Overview
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*),
		COALESCE(SUM(CASE WHEN capability_status IN ('BACKUPABLE','BACKUPABLE_SHARED_WARNING') THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN capability_status='UNSUPPORTED_DATABASE' THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN capability_status='NO_DATA' THEN 1 ELSE 0 END), 0)
		FROM application_instances WHERE tenant_uid=? AND active=1`, tenant).Scan(&result.ApplicationCount, &result.BackupableCount, &result.UnsupportedCount, &result.NoDataCount); err != nil {
		return domain.Overview{}, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT
		COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM snapshots s WHERE s.tenant_uid=i.tenant_uid AND s.deploy_id=i.deploy_id AND s.status='COMPLETED' AND s.retention_status='ACTIVE') THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM snapshots s WHERE s.tenant_uid=i.tenant_uid AND s.deploy_id=i.deploy_id AND s.status='COMPLETED' AND s.retention_status='ACTIVE') THEN 1 ELSE 0 END), 0)
		FROM application_instances i WHERE tenant_uid=? AND active=1 AND capability_status IN ('BACKUPABLE','BACKUPABLE_SHARED_WARNING')`, tenant).Scan(&result.ProtectedCount, &result.UnprotectedCount); err != nil {
		return domain.Overview{}, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT
		COALESCE(SUM(CASE WHEN status='QUEUED' THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN status NOT IN ('QUEUED','SUCCEEDED','SUCCEEDED_WITH_WARNINGS','FAILED','CANCELLED','TIMED_OUT','SKIPPED','INTERRUPTED') THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN status IN ('SUCCEEDED','SUCCEEDED_WITH_WARNINGS') AND finished_at>=? THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN status IN ('FAILED','CANCELLED','TIMED_OUT','INTERRUPTED') AND finished_at>=? THEN 1 ELSE 0 END), 0)
		FROM backup_tasks WHERE tenant_uid=?`, unix(since), unix(since), tenant).Scan(&result.QueuedTasks, &result.RunningTasks, &result.Succeeded24h, &result.Failed24h); err != nil {
		return domain.Overview{}, err
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM alerts WHERE tenant_uid=? AND status='OPEN' AND read_at IS NULL", tenant).Scan(&result.UnreadAlerts); err != nil {
		return domain.Overview{}, err
	}
	count, bytes, missing, verifiedAt, err := s.SnapshotSummary(ctx, tenant)
	if err != nil {
		return domain.Overview{}, err
	}
	result.Storage = domain.StorageSummary{SnapshotCount: count, ArchiveBytes: bytes, MissingCount: missing, LastVerifiedAt: verifiedAt}
	return result, nil
}

type scanRow interface{ Scan(...any) error }

func scanAlert(row scanRow) (domain.Alert, error) {
	var item domain.Alert
	var read, resolved, muted sql.NullInt64
	var created, updated int64
	err := row.Scan(&item.ID, &item.TenantUID, &item.Level, &item.Type, &item.Code, &item.Title, &item.Message,
		&item.ReferenceType, &item.ReferenceID, &item.Status, &read, &resolved, &muted, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Alert{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Alert{}, err
	}
	item.ReadAt, item.ResolvedAt, item.MutedUntil = fromUnix(read), fromUnix(resolved), fromUnix(muted)
	item.CreatedAt, item.UpdatedAt = time.Unix(created, 0).UTC(), time.Unix(updated, 0).UTC()
	return item, nil
}
