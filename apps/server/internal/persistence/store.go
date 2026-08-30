package persistence

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	if path == "" {
		return nil, errors.New("control database path is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create control database directory: %w", err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open control database: %w", err)
	}
	db.SetMaxOpenConns(1)
	store := &Store{db: db}
	if err := store.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate(ctx context.Context) error {
	statements := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
		`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("configure control database: %w", err)
		}
	}
	type migration struct {
		version    int
		statements []string
	}
	migrations := []migration{{version: 1, statements: []string{
		`CREATE TABLE oidc_transactions (
			state_hash TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL,
			return_to TEXT NOT NULL, redirect_uri TEXT NOT NULL, expires_at INTEGER NOT NULL
		)`,
		`CREATE TABLE sessions (
			session_hash TEXT PRIMARY KEY, subject TEXT NOT NULL, uid TEXT NOT NULL,
			name TEXT NOT NULL, email TEXT NOT NULL, groups_csv TEXT NOT NULL, role TEXT NOT NULL,
			tenant_uid TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
			last_seen_at INTEGER NOT NULL
		)`,
		`CREATE TABLE applications (
			tenant_uid TEXT NOT NULL, appid TEXT NOT NULL, name TEXT NOT NULL, version TEXT NOT NULL,
			name_sort TEXT NOT NULL, last_synced_at INTEGER NOT NULL,
			PRIMARY KEY (tenant_uid, appid)
		)`,
		`CREATE TABLE application_instances (
			tenant_uid TEXT NOT NULL, appid TEXT NOT NULL, deploy_id TEXT NOT NULL,
			multi_instance INTEGER NOT NULL, capability_status TEXT NOT NULL,
			read_only_mode TEXT NOT NULL, total_bytes INTEGER NOT NULL, file_count INTEGER NOT NULL,
			sqlite_count INTEGER NOT NULL, skipped_count INTEGER NOT NULL, probe_error_code TEXT NOT NULL,
			last_probed_at INTEGER, last_synced_at INTEGER NOT NULL, active INTEGER NOT NULL,
			PRIMARY KEY (tenant_uid, appid, deploy_id),
			FOREIGN KEY (tenant_uid, appid) REFERENCES applications (tenant_uid, appid)
		)`,
		`CREATE TABLE database_findings (
			tenant_uid TEXT NOT NULL, appid TEXT NOT NULL, deploy_id TEXT NOT NULL, path TEXT NOT NULL,
			type TEXT NOT NULL, supported INTEGER NOT NULL, reason TEXT NOT NULL,
			PRIMARY KEY (tenant_uid, appid, deploy_id, path),
			FOREIGN KEY (tenant_uid, appid, deploy_id)
				REFERENCES application_instances (tenant_uid, appid, deploy_id) ON DELETE CASCADE
		)`,
		`CREATE TABLE catalog_syncs (
			tenant_uid TEXT PRIMARY KEY, state TEXT NOT NULL, started_at INTEGER,
			finished_at INTEGER, error_code TEXT NOT NULL
		)`,
		`CREATE INDEX instances_tenant_sort_idx ON application_instances (tenant_uid, active, appid, deploy_id)`,
		`CREATE INDEX instances_tenant_status_idx ON application_instances (tenant_uid, capability_status, active)`,
		`CREATE INDEX sessions_expiry_idx ON sessions (expires_at)`,
	}}, {version: 2, statements: []string{
		`ALTER TABLE oidc_transactions ADD COLUMN tenant_uid TEXT NOT NULL DEFAULT ''`,
		`CREATE INDEX oidc_transactions_tenant_expiry_idx ON oidc_transactions (tenant_uid, expires_at)`,
	}}, {version: 3, statements: []string{
		`CREATE TABLE backup_jobs (
			id TEXT PRIMARY KEY, tenant_uid TEXT NOT NULL, appid TEXT NOT NULL, application_name TEXT NOT NULL,
			application_version TEXT NOT NULL, deploy_id TEXT NOT NULL, multi_instance INTEGER NOT NULL,
			shared_risk_accepted INTEGER NOT NULL, status TEXT NOT NULL, error_code TEXT NOT NULL,
			snapshot_id TEXT NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER
		)`,
		`CREATE UNIQUE INDEX backup_jobs_active_instance_idx ON backup_jobs (tenant_uid, deploy_id)
			WHERE status IN ('QUEUED', 'RUNNING')`,
		`CREATE INDEX backup_jobs_tenant_created_idx ON backup_jobs (tenant_uid, created_at DESC)`,
		`CREATE TABLE snapshots (
			id TEXT PRIMARY KEY, tenant_uid TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE, appid TEXT NOT NULL,
			application_name TEXT NOT NULL, application_version TEXT NOT NULL, deploy_id TEXT NOT NULL,
			multi_instance INTEGER NOT NULL, shared_instance_warning INTEGER NOT NULL, status TEXT NOT NULL,
			storage_path TEXT NOT NULL, archive_name TEXT NOT NULL, archive_size INTEGER NOT NULL,
			archive_sha256 TEXT NOT NULL, original_bytes INTEGER NOT NULL, file_count INTEGER NOT NULL,
			directory_count INTEGER NOT NULL, sqlite_count INTEGER NOT NULL, skipped_count INTEGER NOT NULL,
			warning_count INTEGER NOT NULL, captured_at INTEGER NOT NULL, finished_at INTEGER NOT NULL,
			verification_status TEXT NOT NULL, verified_at INTEGER,
			FOREIGN KEY(job_id) REFERENCES backup_jobs(id)
		)`,
		`CREATE INDEX snapshots_tenant_captured_idx ON snapshots (tenant_uid, captured_at DESC)`,
		`CREATE INDEX snapshots_tenant_deploy_idx ON snapshots (tenant_uid, deploy_id, captured_at DESC)`,
	}}, {version: 4, statements: []string{
		`ALTER TABLE backup_jobs ADD COLUMN oidc_subject TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE backup_jobs ADD COLUMN user_role TEXT NOT NULL DEFAULT 'NORMAL'`,
	}}, {version: 5, statements: []string{
		`CREATE TABLE backup_plans (
			id TEXT PRIMARY KEY, tenant_uid TEXT NOT NULL, name TEXT NOT NULL,
			target_kind TEXT NOT NULL, shared_risk_accepted INTEGER NOT NULL,
			schedule_type TEXT NOT NULL, cron_expression TEXT NOT NULL, timezone TEXT NOT NULL,
			enabled INTEGER NOT NULL, catch_up INTEGER NOT NULL, max_catch_up_seconds INTEGER NOT NULL,
			max_retries INTEGER NOT NULL, retry_backoff_seconds INTEGER NOT NULL,
			retention_json TEXT NOT NULL, created_by_subject TEXT NOT NULL,
			created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_scheduled_at INTEGER, next_run_at INTEGER
		)`,
		`CREATE TABLE plan_targets (
			plan_id TEXT NOT NULL, tenant_uid TEXT NOT NULL, deploy_id TEXT NOT NULL,
			shared_risk_accepted INTEGER NOT NULL,
			PRIMARY KEY(plan_id, deploy_id),
			FOREIGN KEY(plan_id) REFERENCES backup_plans(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE backup_batches (
			id TEXT PRIMARY KEY, tenant_uid TEXT NOT NULL, plan_id TEXT NOT NULL, plan_name TEXT NOT NULL,
			trigger_type TEXT NOT NULL, status TEXT NOT NULL, scheduled_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
			started_at INTEGER, finished_at INTEGER, total_tasks INTEGER NOT NULL DEFAULT 0,
			succeeded_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
			skipped_count INTEGER NOT NULL DEFAULT 0, running_count INTEGER NOT NULL DEFAULT 0,
			queued_count INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE UNIQUE INDEX batches_tenant_plan_schedule_idx ON backup_batches(tenant_uid, plan_id, scheduled_at) WHERE plan_id <> ''`,
		`CREATE INDEX batches_tenant_scheduled_idx ON backup_batches(tenant_uid, scheduled_at DESC)`,
		`CREATE TABLE backup_tasks (
			id TEXT PRIMARY KEY, tenant_uid TEXT NOT NULL, batch_id TEXT NOT NULL, plan_id TEXT NOT NULL,
			backup_job_id TEXT NOT NULL UNIQUE, appid TEXT NOT NULL, application_name TEXT NOT NULL,
			deploy_id TEXT NOT NULL, multi_instance INTEGER NOT NULL, shared_risk_accepted INTEGER NOT NULL,
			trigger_type TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL,
			attempt_count INTEGER NOT NULL, max_retries INTEGER NOT NULL, error_code TEXT NOT NULL,
			available_at INTEGER NOT NULL, scheduled_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
			started_at INTEGER, finished_at INTEGER, lease_token TEXT NOT NULL, worker_id TEXT NOT NULL,
			lease_expires_at INTEGER, heartbeat_at INTEGER, snapshot_id TEXT NOT NULL,
			FOREIGN KEY(batch_id) REFERENCES backup_batches(id) ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX tasks_batch_deploy_idx ON backup_tasks(batch_id, deploy_id)`,
		`CREATE INDEX tasks_tenant_available_idx ON backup_tasks(tenant_uid, status, available_at, priority DESC, created_at)`,
		`CREATE INDEX tasks_tenant_deploy_idx ON backup_tasks(tenant_uid, deploy_id, status)`,
		`CREATE TABLE task_attempts (
			id TEXT PRIMARY KEY, tenant_uid TEXT NOT NULL, task_id TEXT NOT NULL, attempt INTEGER NOT NULL,
			status TEXT NOT NULL, error_code TEXT NOT NULL, worker_id TEXT NOT NULL,
			started_at INTEGER NOT NULL, finished_at INTEGER,
			UNIQUE(task_id, attempt), FOREIGN KEY(task_id) REFERENCES backup_tasks(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX task_attempts_task_idx ON task_attempts(tenant_uid, task_id, attempt DESC)`,
	}}, {version: 6, statements: []string{
		`ALTER TABLE backup_jobs ADD COLUMN plan_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE backup_jobs ADD COLUMN batch_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE backup_jobs ADD COLUMN task_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE backup_jobs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual'`,
		`ALTER TABLE backup_jobs ADD COLUMN scheduled_at INTEGER`,
		`ALTER TABLE snapshots ADD COLUMN plan_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE snapshots ADD COLUMN batch_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE snapshots ADD COLUMN task_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE snapshots ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual'`,
		`ALTER TABLE snapshots ADD COLUMN retention_status TEXT NOT NULL DEFAULT 'ACTIVE'`,
		`ALTER TABLE snapshots ADD COLUMN trashed_at INTEGER`,
		`CREATE INDEX snapshots_tenant_plan_idx ON snapshots(tenant_uid, plan_id, captured_at DESC)`,
	}}, {version: 7, statements: []string{
		`ALTER TABLE backup_tasks ADD COLUMN retry_backoff_seconds INTEGER NOT NULL DEFAULT 60`,
	}}, {version: 8, statements: []string{
		`CREATE TABLE settings (
			tenant_uid TEXT PRIMARY KEY, locale TEXT NOT NULL, timezone TEXT NOT NULL,
			catch_up INTEGER NOT NULL, max_catch_up_seconds INTEGER NOT NULL,
			max_retries INTEGER NOT NULL, retry_backoff_seconds INTEGER NOT NULL,
			retention_json TEXT NOT NULL, notify_first_failure INTEGER NOT NULL,
			notify_success INTEGER NOT NULL, updated_at INTEGER NOT NULL
		)`,
		`CREATE TABLE alerts (
			id TEXT PRIMARY KEY, tenant_uid TEXT NOT NULL, level TEXT NOT NULL, type TEXT NOT NULL,
			code TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
			reference_type TEXT NOT NULL, reference_id TEXT NOT NULL, status TEXT NOT NULL,
			read_at INTEGER, resolved_at INTEGER, muted_until INTEGER,
			created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
		)`,
		`CREATE INDEX alerts_tenant_status_created_idx ON alerts(tenant_uid, status, created_at DESC)`,
		`CREATE TABLE audit_entries (
			id TEXT PRIMARY KEY, tenant_uid TEXT NOT NULL, action TEXT NOT NULL, subject TEXT NOT NULL,
			entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metadata TEXT NOT NULL, created_at INTEGER NOT NULL
		)`,
		`CREATE INDEX audit_entries_tenant_created_idx ON audit_entries(tenant_uid, created_at DESC)`,
		`CREATE TABLE event_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_uid TEXT NOT NULL, type TEXT NOT NULL,
			data TEXT NOT NULL, created_at INTEGER NOT NULL
		)`,
		`CREATE INDEX event_log_tenant_id_idx ON event_log(tenant_uid, id)`,
	}}, {version: 9, statements: []string{
		`ALTER TABLE oidc_transactions ADD COLUMN entrance_uid TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE oidc_transactions ADD COLUMN entrance_role TEXT NOT NULL DEFAULT ''`,
	}}, {version: 10, statements: []string{
		`ALTER TABLE sessions ADD COLUMN gateway_uid TEXT NOT NULL DEFAULT ''`,
	}}, {version: 11, statements: []string{
		`ALTER TABLE applications ADD COLUMN icon TEXT NOT NULL DEFAULT ''`,
	}}, {version: 12, statements: []string{
		`UPDATE backup_plans SET target_kind='EXPLICIT', enabled=0, next_run_at=NULL, updated_at=strftime('%s','now') WHERE target_kind='ALL_BACKUPABLE'`,
	}}, {version: 13, statements: []string{
		`ALTER TABLE backup_plans ADD COLUMN execution_time TEXT NOT NULL DEFAULT '02:00'`,
	}}, {version: 14, statements: []string{
		`ALTER TABLE plan_targets ADD COLUMN scope_json TEXT NOT NULL DEFAULT '{"mode":"FULL","revision":1}'`,
		`ALTER TABLE backup_plans ADD COLUMN pause_reason_json TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE backup_jobs ADD COLUMN scope_json TEXT NOT NULL DEFAULT '{"mode":"FULL","revision":1}'`,
		`ALTER TABLE backup_tasks ADD COLUMN scope_json TEXT NOT NULL DEFAULT '{"mode":"FULL","revision":1}'`,
		`ALTER TABLE snapshots ADD COLUMN scope_json TEXT NOT NULL DEFAULT '{"mode":"FULL","revision":1}'`,
	}}, {version: 15, statements: []string{
		`ALTER TABLE backup_tasks ADD COLUMN scope_validation_json TEXT NOT NULL DEFAULT ''`,
	}}}
	for _, migration := range migrations {
		var applied int
		if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations WHERE version = ?", migration.version).Scan(&applied); err != nil {
			return err
		}
		if applied > 0 {
			continue
		}
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		for _, statement := range migration.statements {
			if _, err := tx.ExecContext(ctx, statement); err != nil {
				_ = tx.Rollback()
				return fmt.Errorf("apply control schema migration %d: %w", migration.version, err)
			}
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)", migration.version, unix(time.Now())); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func hash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func unix(value time.Time) int64 { return value.UTC().Unix() }
func fromUnix(value sql.NullInt64) *time.Time {
	if !value.Valid || value.Int64 == 0 {
		return nil
	}
	result := time.Unix(value.Int64, 0).UTC()
	return &result
}

func (s *Store) CreateLoginTransaction(ctx context.Context, state string, value domain.LoginTransaction) error {
	if value.TenantUID == "" {
		return errors.New("login transaction tenant is required")
	}
	// Preserve the persistence contract for callers created before migration 9.
	// The production OIDC manager always supplies both values after validating
	// the ingress headers; this compatibility default is never used by it.
	if value.EntranceUID == "" {
		value.EntranceUID = value.TenantUID
	}
	if value.EntranceRole == "" {
		value.EntranceRole = domain.RoleNormal
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO oidc_transactions(state_hash, nonce, verifier, return_to, redirect_uri, expires_at, tenant_uid, entrance_uid, entrance_role)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, hash(state), value.Nonce, value.Verifier, value.ReturnTo, value.RedirectURI, unix(value.ExpiresAt), value.TenantUID, value.EntranceUID, value.EntranceRole)
	return err
}

func (s *Store) ConsumeLoginTransaction(ctx context.Context, state, tenant string, now time.Time) (domain.LoginTransaction, error) {
	var result domain.LoginTransaction
	var expires int64
	if tenant == "" {
		return result, errors.New("login transaction tenant is required")
	}
	err := s.db.QueryRowContext(ctx, `DELETE FROM oidc_transactions
		WHERE state_hash = ? AND tenant_uid = ? AND expires_at > ?
		RETURNING tenant_uid, entrance_uid, entrance_role, nonce, verifier, return_to, redirect_uri, expires_at`, hash(state), tenant, unix(now)).Scan(&result.TenantUID, &result.EntranceUID, &result.EntranceRole, &result.Nonce, &result.Verifier, &result.ReturnTo, &result.RedirectURI, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		return result, domain.ErrNotFound
	}
	if err != nil {
		return result, err
	}
	result.ExpiresAt = time.Unix(expires, 0).UTC()
	return result, nil
}

func (s *Store) PurgeExpiredLoginTransactions(ctx context.Context, now time.Time) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM oidc_transactions WHERE expires_at <= ?", unix(now))
	return err
}

func (s *Store) CreateSession(ctx context.Context, rawID string, session domain.Session) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions(session_hash, subject, uid, gateway_uid, name, email, groups_csv, role, tenant_uid, created_at, expires_at, last_seen_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, hash(rawID), session.Subject, session.UID, session.GatewayUID, session.Name, session.Email,
		strings.Join(session.Groups, ","), session.Role, session.TenantUID, unix(session.CreatedAt), unix(session.ExpiresAt), unix(session.CreatedAt))
	return err
}

func (s *Store) Session(ctx context.Context, rawID string, now time.Time) (domain.Session, error) {
	var result domain.Session
	var created, expires int64
	var groups string
	err := s.db.QueryRowContext(ctx, `SELECT subject, uid, gateway_uid, name, email, groups_csv, role, tenant_uid, created_at, expires_at
		FROM sessions WHERE session_hash = ? AND expires_at > ?`, hash(rawID), unix(now)).Scan(
		&result.Subject, &result.UID, &result.GatewayUID, &result.Name, &result.Email, &groups, &result.Role, &result.TenantUID, &created, &expires,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return result, domain.ErrNotFound
	}
	if err != nil {
		return result, err
	}
	if groups != "" {
		result.Groups = strings.Split(groups, ",")
	}
	result.CreatedAt, result.ExpiresAt = time.Unix(created, 0).UTC(), time.Unix(expires, 0).UTC()
	_, _ = s.db.ExecContext(ctx, "UPDATE sessions SET last_seen_at = ? WHERE session_hash = ?", unix(now), hash(rawID))
	return result, nil
}

func (s *Store) DeleteSession(ctx context.Context, rawID string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE session_hash = ?", hash(rawID))
	return err
}

func (s *Store) StartSync(ctx context.Context, tenant string, started time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO catalog_syncs(tenant_uid, state, started_at, finished_at, error_code)
		VALUES(?, 'RUNNING', ?, NULL, '')
		ON CONFLICT(tenant_uid) DO UPDATE SET state='RUNNING', started_at=excluded.started_at, finished_at=NULL, error_code=''`, tenant, unix(started))
	return err
}

func (s *Store) FinishSync(ctx context.Context, tenant, state, errorCode string, finished time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE catalog_syncs SET state=?, finished_at=?, error_code=? WHERE tenant_uid=?`, state, unix(finished), errorCode, tenant)
	return err
}

func (s *Store) SyncStatus(ctx context.Context, tenant string) (domain.SyncStatus, error) {
	var result domain.SyncStatus
	var started, finished sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT state, started_at, finished_at, error_code FROM catalog_syncs WHERE tenant_uid=?`, tenant).Scan(&result.State, &started, &finished, &result.ErrorCode)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.SyncStatus{State: "IDLE"}, nil
	}
	if err != nil {
		return result, err
	}
	result.StartedAt, result.FinishedAt = fromUnix(started), fromUnix(finished)
	return result, nil
}

func (s *Store) ReplaceInstances(ctx context.Context, tenant string, instances []domain.ApplicationInstance, syncedAt time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "UPDATE application_instances SET active=0 WHERE tenant_uid=?", tenant); err != nil {
		return err
	}
	for _, instance := range instances {
		if instance.TenantUID != tenant {
			return errors.New("instance tenant mismatch")
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO applications(tenant_uid, appid, name, version, icon, name_sort, last_synced_at)
			VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_uid, appid) DO UPDATE SET
			name=excluded.name, version=excluded.version, icon=excluded.icon, name_sort=excluded.name, last_synced_at=excluded.last_synced_at`,
			tenant, instance.AppID, instance.Name, instance.Version, instance.Icon, strings.ToLower(instance.Name), unix(syncedAt)); err != nil {
			return err
		}
		var probed any
		if instance.LastProbedAt == nil {
			probed = nil
		} else {
			probed = unix(*instance.LastProbedAt)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO application_instances(tenant_uid, appid, deploy_id, multi_instance, capability_status, read_only_mode, total_bytes, file_count, sqlite_count, skipped_count, probe_error_code, last_probed_at, last_synced_at, active)
			VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
			ON CONFLICT(tenant_uid, appid, deploy_id) DO UPDATE SET multi_instance=excluded.multi_instance,
			capability_status=excluded.capability_status, read_only_mode=excluded.read_only_mode,
			total_bytes=excluded.total_bytes, file_count=excluded.file_count, sqlite_count=excluded.sqlite_count,
			skipped_count=excluded.skipped_count, probe_error_code=excluded.probe_error_code,
			last_probed_at=excluded.last_probed_at, last_synced_at=excluded.last_synced_at, active=1`,
			tenant, instance.AppID, instance.DeployID, boolInt(instance.MultiInstance), instance.CapabilityStatus,
			instance.ReadOnlyMode, instance.TotalBytes, instance.FileCount, instance.SQLiteCount, instance.SkippedCount,
			instance.ProbeErrorCode, probed, unix(syncedAt)); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM database_findings WHERE tenant_uid=? AND appid=? AND deploy_id=?", tenant, instance.AppID, instance.DeployID); err != nil {
			return err
		}
		for _, finding := range instance.DatabaseFindings {
			if _, err := tx.ExecContext(ctx, `INSERT INTO database_findings(tenant_uid, appid, deploy_id, path, type, supported, reason) VALUES(?, ?, ?, ?, ?, ?, ?)`,
				tenant, instance.AppID, instance.DeployID, finding.Path, finding.Type, boolInt(finding.Supported), finding.Reason); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func (s *Store) ListInstances(ctx context.Context, tenant string, filter domain.ApplicationFilter) (domain.ApplicationPage, error) {
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 200 {
		filter.Limit = 200
	}
	query := `SELECT a.appid, a.name, a.version, a.icon, i.deploy_id, i.multi_instance, i.capability_status, i.read_only_mode, i.total_bytes, i.file_count, i.sqlite_count, i.skipped_count, i.probe_error_code, i.last_probed_at, i.last_synced_at,
		(SELECT MAX(s.captured_at) FROM snapshots s WHERE s.tenant_uid=i.tenant_uid AND s.deploy_id=i.deploy_id AND s.status='COMPLETED')
		FROM application_instances i JOIN applications a ON a.tenant_uid=i.tenant_uid AND a.appid=i.appid WHERE i.tenant_uid=? AND i.active=1`
	args := []any{tenant}
	if q := strings.TrimSpace(strings.ToLower(filter.Query)); q != "" {
		query += " AND (a.name_sort LIKE ? OR lower(a.appid) LIKE ? OR lower(i.deploy_id) LIKE ?)"
		pattern := "%" + q + "%"
		args = append(args, pattern, pattern, pattern)
	}
	if filter.Mode == "single" {
		query += " AND i.multi_instance=0"
	}
	if filter.Mode == "multi" {
		query += " AND i.multi_instance=1"
	}
	if filter.CapabilityStatus != "" {
		if filter.CapabilityStatus == "BACKUPABLE" {
			query += " AND i.capability_status IN ('BACKUPABLE', 'BACKUPABLE_SHARED_WARNING')"
		} else {
			query += " AND i.capability_status=?"
			args = append(args, filter.CapabilityStatus)
		}
	}
	if filter.ProtectionStatus == "PROTECTED" {
		query += " AND EXISTS (SELECT 1 FROM snapshots s WHERE s.tenant_uid=i.tenant_uid AND s.deploy_id=i.deploy_id AND s.status='COMPLETED')"
	}
	if filter.ProtectionStatus == "UNPROTECTED" {
		query += " AND NOT EXISTS (SELECT 1 FROM snapshots s WHERE s.tenant_uid=i.tenant_uid AND s.deploy_id=i.deploy_id AND s.status='COMPLETED')"
	}
	name, appid, deploy, err := decodeCursor(filter.Cursor)
	if err != nil {
		return domain.ApplicationPage{}, fmt.Errorf("invalid cursor: %w", err)
	}
	if filter.Cursor != "" {
		query += " AND (a.name_sort > ? OR (a.name_sort = ? AND (a.appid > ? OR (a.appid = ? AND i.deploy_id > ?))))"
		args = append(args, name, name, appid, appid, deploy)
	}
	query += " ORDER BY a.name_sort, a.appid, i.deploy_id LIMIT ?"
	args = append(args, filter.Limit+1)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return domain.ApplicationPage{}, err
	}
	defer rows.Close()
	result := domain.ApplicationPage{Items: make([]domain.ApplicationInstance, 0, filter.Limit)}
	for rows.Next() {
		instance, err := scanInstance(rows)
		if err != nil {
			return result, err
		}
		instance.TenantUID, instance.ProtectionStatus = tenant, "UNPROTECTED"
		if instance.LastBackupAt != nil {
			instance.ProtectionStatus = "PROTECTED"
		}
		result.Items = append(result.Items, instance)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	if len(result.Items) > filter.Limit {
		last := result.Items[filter.Limit-1]
		result.NextCursor = encodeCursor(strings.ToLower(last.Name), last.AppID, last.DeployID)
		result.Items = result.Items[:filter.Limit]
	}
	return result, nil
}

func (s *Store) Instance(ctx context.Context, tenant, deployID string) (domain.ApplicationInstance, error) {
	row := s.db.QueryRowContext(ctx, `SELECT a.appid, a.name, a.version, a.icon, i.deploy_id, i.multi_instance, i.capability_status, i.read_only_mode, i.total_bytes, i.file_count, i.sqlite_count, i.skipped_count, i.probe_error_code, i.last_probed_at, i.last_synced_at,
		(SELECT MAX(s.captured_at) FROM snapshots s WHERE s.tenant_uid=i.tenant_uid AND s.deploy_id=i.deploy_id AND s.status='COMPLETED')
		FROM application_instances i JOIN applications a ON a.tenant_uid=i.tenant_uid AND a.appid=i.appid
		WHERE i.tenant_uid=? AND i.deploy_id=? AND i.active=1`, tenant, deployID)
	instance, err := scanInstance(row)
	if errors.Is(err, sql.ErrNoRows) {
		return instance, domain.ErrNotFound
	}
	if err != nil {
		return instance, err
	}
	instance.TenantUID, instance.ProtectionStatus = tenant, "UNPROTECTED"
	if instance.LastBackupAt != nil {
		instance.ProtectionStatus = "PROTECTED"
	}
	findings, err := s.findings(ctx, tenant, instance.AppID, deployID)
	if err != nil {
		return instance, err
	}
	instance.DatabaseFindings = findings
	return instance, nil
}

func (s *Store) InstancesForApp(ctx context.Context, tenant, appID string) ([]domain.ApplicationInstance, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT a.appid, a.name, a.version, a.icon, i.deploy_id, i.multi_instance, i.capability_status, i.read_only_mode, i.total_bytes, i.file_count, i.sqlite_count, i.skipped_count, i.probe_error_code, i.last_probed_at, i.last_synced_at,
		(SELECT MAX(s.captured_at) FROM snapshots s WHERE s.tenant_uid=i.tenant_uid AND s.deploy_id=i.deploy_id AND s.status='COMPLETED')
		FROM application_instances i JOIN applications a ON a.tenant_uid=i.tenant_uid AND a.appid=i.appid
		WHERE i.tenant_uid=? AND i.appid=? AND i.active=1 ORDER BY i.deploy_id`, tenant, appID)
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
		item.TenantUID, item.ProtectionStatus = tenant, "UNPROTECTED"
		if item.LastBackupAt != nil {
			item.ProtectionStatus = "PROTECTED"
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, domain.ErrNotFound
	}
	for index := range items {
		findings, err := s.findings(ctx, tenant, appID, items[index].DeployID)
		if err != nil {
			return nil, err
		}
		items[index].DatabaseFindings = findings
	}
	return items, nil
}

func (s *Store) findings(ctx context.Context, tenant, appID, deployID string) ([]domain.DatabaseFinding, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT type, path, supported, reason FROM database_findings WHERE tenant_uid=? AND appid=? AND deploy_id=? ORDER BY path`, tenant, appID, deployID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []domain.DatabaseFinding{}
	for rows.Next() {
		var finding domain.DatabaseFinding
		var supported int
		if err := rows.Scan(&finding.Type, &finding.Path, &supported, &finding.Reason); err != nil {
			return nil, err
		}
		finding.Supported = supported != 0
		result = append(result, finding)
	}
	return result, rows.Err()
}

func (s *Store) CreateBackupJob(ctx context.Context, job domain.BackupJob) error {
	if job.ID == "" || job.TenantUID == "" || job.AppID == "" || job.DeployID == "" || job.Status != "QUEUED" {
		return errors.New("invalid backup job")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var existing string
	err = tx.QueryRowContext(ctx, `SELECT id FROM backup_jobs WHERE tenant_uid=? AND deploy_id=? AND status IN ('QUEUED', 'RUNNING') LIMIT 1`, job.TenantUID, job.DeployID).Scan(&existing)
	if err == nil {
		return domain.ErrConflict
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	scope, err := json.Marshal(job.Scope)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO backup_jobs(id, tenant_uid, oidc_subject, user_role, appid, application_name, application_version, deploy_id, multi_instance, shared_risk_accepted, status, error_code, snapshot_id, created_at, started_at, finished_at, plan_id, batch_id, task_id, trigger_type, scheduled_at, scope_json)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', '', '', ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
		job.ID, job.TenantUID, job.OIDCSubject, job.UserRole, job.AppID, job.ApplicationName, job.ApplicationVersion, job.DeployID, boolInt(job.MultiInstance), boolInt(job.SharedRiskAccepted), unix(job.CreatedAt), job.PlanID, job.BatchID, job.TaskID, job.TriggerType, nullableUnix(job.ScheduledAt), string(scope))
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) StartBackupJob(ctx context.Context, tenant, id string, started time.Time) error {
	result, err := s.db.ExecContext(ctx, `UPDATE backup_jobs SET status='RUNNING', started_at=? WHERE id=? AND tenant_uid=? AND status='QUEUED'`, unix(started), id, tenant)
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

func (s *Store) FailBackupJob(ctx context.Context, tenant, id, code string, finished time.Time) error {
	result, err := s.db.ExecContext(ctx, `UPDATE backup_jobs SET status='FAILED', error_code=?, finished_at=? WHERE id=? AND tenant_uid=? AND status IN ('QUEUED', 'RUNNING')`, code, unix(finished), id, tenant)
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

// InterruptOpenBackupJobs prevents a service restart from leaving a manual
// phase-3 job permanently holding its instance lock. Resumable recovery is a
// later queue-stage responsibility, so interrupted archives are never treated
// as completed snapshots.
func (s *Store) InterruptOpenBackupJobs(ctx context.Context, tenant string, finished time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE backup_jobs SET status='FAILED', error_code='BACKUP_INTERRUPTED', finished_at=? WHERE tenant_uid=? AND status IN ('QUEUED', 'RUNNING')`, unix(finished), tenant)
	return err
}

func (s *Store) BackupJob(ctx context.Context, tenant, id string) (domain.BackupJob, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, tenant_uid, oidc_subject, user_role, appid, application_name, application_version, deploy_id, multi_instance, shared_risk_accepted, status, error_code, snapshot_id, created_at, started_at, finished_at, plan_id, batch_id, task_id, trigger_type, scheduled_at, scope_json
		FROM backup_jobs WHERE tenant_uid=? AND id=?`, tenant, id)
	return scanBackupJob(row)
}

func (s *Store) CommitSnapshot(ctx context.Context, snapshot domain.Snapshot) error {
	if snapshot.ID == "" || snapshot.TenantUID == "" || snapshot.JobID == "" || snapshot.StoragePath == "" || snapshot.ArchiveSHA256 == "" {
		return errors.New("invalid snapshot")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	scope, err := json.Marshal(snapshot.Scope)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO snapshots(id, tenant_uid, job_id, appid, application_name, application_version, deploy_id, multi_instance, shared_instance_warning, status, storage_path, archive_name, archive_size, archive_sha256, original_bytes, file_count, directory_count, sqlite_count, skipped_count, warning_count, captured_at, finished_at, verification_status, verified_at, plan_id, batch_id, task_id, trigger_type, retention_status, trashed_at, scope_json)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		snapshot.ID, snapshot.TenantUID, snapshot.JobID, snapshot.AppID, snapshot.ApplicationName, snapshot.ApplicationVersion,
		snapshot.DeployID, boolInt(snapshot.MultiInstance), boolInt(snapshot.SharedInstanceWarning), snapshot.Status,
		snapshot.StoragePath, snapshot.ArchiveName, snapshot.ArchiveSize, snapshot.ArchiveSHA256, snapshot.OriginalBytes,
		snapshot.FileCount, snapshot.DirectoryCount, snapshot.SQLiteCount, snapshot.SkippedCount, snapshot.WarningCount,
		unix(snapshot.CapturedAt), unix(snapshot.FinishedAt), snapshot.VerificationStatus, nullableUnix(snapshot.VerifiedAt), snapshot.PlanID, snapshot.BatchID, snapshot.TaskID, snapshot.TriggerType, snapshot.RetentionStatus, nullableUnix(snapshot.TrashedAt), string(scope))
	if err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE backup_jobs SET status='SUCCEEDED', error_code='', snapshot_id=?, finished_at=? WHERE id=? AND tenant_uid=? AND status='RUNNING'`, snapshot.ID, unix(snapshot.FinishedAt), snapshot.JobID, snapshot.TenantUID)
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
	return tx.Commit()
}

func (s *Store) ListSnapshots(ctx context.Context, tenant string, limit int) ([]domain.Snapshot, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_uid, job_id, appid, application_name, application_version, deploy_id, multi_instance, shared_instance_warning, status, storage_path, archive_name, archive_size, archive_sha256, original_bytes, file_count, directory_count, sqlite_count, skipped_count, warning_count, captured_at, finished_at, verification_status, verified_at, plan_id, batch_id, task_id, trigger_type, retention_status, trashed_at, scope_json
		FROM snapshots WHERE tenant_uid=? AND retention_status <> 'TRASHED' ORDER BY captured_at DESC, id DESC LIMIT ?`, tenant, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []domain.Snapshot{}
	for rows.Next() {
		item, err := scanSnapshot(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Store) Snapshot(ctx context.Context, tenant, id string) (domain.Snapshot, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, tenant_uid, job_id, appid, application_name, application_version, deploy_id, multi_instance, shared_instance_warning, status, storage_path, archive_name, archive_size, archive_sha256, original_bytes, file_count, directory_count, sqlite_count, skipped_count, warning_count, captured_at, finished_at, verification_status, verified_at, plan_id, batch_id, task_id, trigger_type, retention_status, trashed_at, scope_json
		FROM snapshots WHERE tenant_uid=? AND id=?`, tenant, id)
	return scanSnapshot(row)
}

func (s *Store) SetSnapshotVerification(ctx context.Context, tenant, id, status string, verifiedAt time.Time) error {
	result, err := s.db.ExecContext(ctx, `UPDATE snapshots SET verification_status=?, verified_at=? WHERE tenant_uid=? AND id=?`, status, unix(verifiedAt), tenant, id)
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

func nullableUnix(value *time.Time) any {
	if value == nil {
		return nil
	}
	return unix(*value)
}

func scanBackupJob(row scanner) (domain.BackupJob, error) {
	var result domain.BackupJob
	var multi, shared int
	var created int64
	var started, finished, scheduled sql.NullInt64
	var scope string
	err := row.Scan(&result.ID, &result.TenantUID, &result.OIDCSubject, &result.UserRole, &result.AppID, &result.ApplicationName, &result.ApplicationVersion, &result.DeployID,
		&multi, &shared, &result.Status, &result.ErrorCode, &result.SnapshotID, &created, &started, &finished, &result.PlanID, &result.BatchID, &result.TaskID, &result.TriggerType, &scheduled, &scope)
	if errors.Is(err, sql.ErrNoRows) {
		return result, domain.ErrNotFound
	}
	if err != nil {
		return result, err
	}
	result.MultiInstance, result.SharedRiskAccepted = multi != 0, shared != 0
	result.CreatedAt = time.Unix(created, 0).UTC()
	result.StartedAt, result.FinishedAt, result.ScheduledAt = fromUnix(started), fromUnix(finished), fromUnix(scheduled)
	_ = json.Unmarshal([]byte(scope), &result.Scope)
	if result.Scope.Mode == "" {
		result.Scope = domain.BackupScope{Mode: "FULL", Revision: 1}
	}
	return result, nil
}

func scanSnapshot(row scanner) (domain.Snapshot, error) {
	var result domain.Snapshot
	var multi, shared int
	var captured, finished int64
	var verified, trashed sql.NullInt64
	var scope string
	err := row.Scan(&result.ID, &result.TenantUID, &result.JobID, &result.AppID, &result.ApplicationName, &result.ApplicationVersion,
		&result.DeployID, &multi, &shared, &result.Status, &result.StoragePath, &result.ArchiveName, &result.ArchiveSize,
		&result.ArchiveSHA256, &result.OriginalBytes, &result.FileCount, &result.DirectoryCount, &result.SQLiteCount,
		&result.SkippedCount, &result.WarningCount, &captured, &finished, &result.VerificationStatus, &verified, &result.PlanID, &result.BatchID, &result.TaskID, &result.TriggerType, &result.RetentionStatus, &trashed, &scope)
	if errors.Is(err, sql.ErrNoRows) {
		return result, domain.ErrNotFound
	}
	if err != nil {
		return result, err
	}
	result.MultiInstance, result.SharedInstanceWarning = multi != 0, shared != 0
	result.CapturedAt, result.FinishedAt, result.VerifiedAt, result.TrashedAt = time.Unix(captured, 0).UTC(), time.Unix(finished, 0).UTC(), fromUnix(verified), fromUnix(trashed)
	_ = json.Unmarshal([]byte(scope), &result.Scope)
	if result.Scope.Mode == "" {
		result.Scope = domain.BackupScope{Mode: "FULL", Revision: 1}
	}
	return result, nil
}

type scanner interface{ Scan(...any) error }

func scanInstance(row scanner) (domain.ApplicationInstance, error) {
	var instance domain.ApplicationInstance
	var multi int
	var probed sql.NullInt64
	var synced int64
	var backup sql.NullInt64
	err := row.Scan(&instance.AppID, &instance.Name, &instance.Version, &instance.Icon, &instance.DeployID, &multi, &instance.CapabilityStatus,
		&instance.ReadOnlyMode, &instance.TotalBytes, &instance.FileCount, &instance.SQLiteCount, &instance.SkippedCount,
		&instance.ProbeErrorCode, &probed, &synced, &backup)
	if err != nil {
		return instance, err
	}
	instance.MultiInstance = multi != 0
	instance.LastProbedAt = fromUnix(probed)
	instance.LastBackupAt = fromUnix(backup)
	instance.LastSyncedAt = time.Unix(synced, 0).UTC()
	return instance, nil
}

func encodeCursor(values ...string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strings.Join(values, "\x00")))
}
func decodeCursor(value string) (string, string, string, error) {
	if value == "" {
		return "", "", "", nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", "", "", err
	}
	parts := strings.Split(string(decoded), "\x00")
	if len(parts) != 3 {
		return "", "", "", errors.New("cursor shape")
	}
	return parts[0], parts[1], parts[2], nil
}
