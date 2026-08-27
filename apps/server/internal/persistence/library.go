package persistence

import (
	"context"
	"database/sql"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
)

const snapshotColumns = `id, tenant_uid, job_id, appid, application_name, application_version, deploy_id, multi_instance, shared_instance_warning, status, storage_path, archive_name, archive_size, archive_sha256, original_bytes, file_count, directory_count, sqlite_count, skipped_count, warning_count, captured_at, finished_at, verification_status, verified_at, plan_id, batch_id, task_id, trigger_type, retention_status, trashed_at`

func (s *Store) AllSnapshots(ctx context.Context, tenant string) ([]domain.Snapshot, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+snapshotColumns+" FROM snapshots WHERE tenant_uid=? ORDER BY captured_at DESC, id DESC", tenant)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.Snapshot{}
	for rows.Next() {
		item, err := scanSnapshot(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) SnapshotsForPlan(ctx context.Context, tenant, planID string) ([]domain.Snapshot, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+snapshotColumns+" FROM snapshots WHERE tenant_uid=? AND plan_id=? AND retention_status='ACTIVE' ORDER BY captured_at DESC, id DESC", tenant, planID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.Snapshot{}
	for rows.Next() {
		item, err := scanSnapshot(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) MarkSnapshotTrashed(ctx context.Context, tenant, id, storagePath string, now time.Time) error {
	result, err := s.db.ExecContext(ctx, "UPDATE snapshots SET status='TRASHED', retention_status='TRASHED', storage_path=?, trashed_at=? WHERE tenant_uid=? AND id=? AND retention_status='ACTIVE'", storagePath, unix(now), tenant, id)
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

func (s *Store) DeleteTrashedBefore(ctx context.Context, tenant string, before time.Time) ([]domain.Snapshot, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+snapshotColumns+" FROM snapshots WHERE tenant_uid=? AND retention_status='TRASHED' AND trashed_at IS NOT NULL AND trashed_at<=?", tenant, unix(before))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.Snapshot{}
	for rows.Next() {
		item, err := scanSnapshot(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, item := range items {
		if _, err := s.db.ExecContext(ctx, "DELETE FROM snapshots WHERE tenant_uid=? AND id=? AND retention_status='TRASHED'", tenant, item.ID); err != nil {
			return nil, err
		}
	}
	return items, nil
}

func (s *Store) SnapshotSummary(ctx context.Context, tenant string) (count int, bytes int64, missing int, verifiedAt *time.Time, err error) {
	var last sql.NullInt64
	err = s.db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(archive_size), 0),
		SUM(CASE WHEN verification_status='FAILED' THEN 1 ELSE 0 END), MAX(verified_at)
		FROM snapshots WHERE tenant_uid=? AND retention_status='ACTIVE'`, tenant).Scan(&count, &bytes, &missing, &last)
	if err != nil {
		return 0, 0, 0, nil, err
	}
	return count, bytes, missing, fromUnix(last), nil
}

func (s *Store) SetSnapshotRetention(ctx context.Context, tenant, id, status string) error {
	_, err := s.db.ExecContext(ctx, "UPDATE snapshots SET retention_status=? WHERE tenant_uid=? AND id=?", status, tenant, id)
	return err
}
