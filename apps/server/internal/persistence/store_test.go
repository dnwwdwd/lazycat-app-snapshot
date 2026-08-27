package persistence

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
)

func TestStoreMigratesSessionsAndConsumesLoginStateOnce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "control.sqlite")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := store.CreateLoginTransaction(context.Background(), "state-a", domain.LoginTransaction{TenantUID: "tenant-a", Nonce: "nonce", Verifier: "verifier", ReturnTo: "/applications", RedirectURI: "https://backup.test/auth/oidc/callback", ExpiresAt: now.Add(time.Minute)}); err != nil {
		t.Fatal(err)
	}
	transaction, err := store.ConsumeLoginTransaction(context.Background(), "state-a", "tenant-a", now)
	if err != nil {
		t.Fatal(err)
	}
	if transaction.Verifier != "verifier" || transaction.RedirectURI != "https://backup.test/auth/oidc/callback" {
		t.Fatalf("unexpected transaction: %+v", transaction)
	}
	if _, err := store.ConsumeLoginTransaction(context.Background(), "state-a", "tenant-a", now); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("state reused: %v", err)
	}
	if err := store.CreateSession(context.Background(), "raw-session", domain.Session{Subject: "subject-a", UID: "tenant-a", Name: "A", Role: domain.RoleNormal, TenantUID: "tenant-a", CreatedAt: now, ExpiresAt: now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	session, err := store.Session(context.Background(), "raw-session", now)
	if err != nil {
		t.Fatal(err)
	}
	if session.UID != "tenant-a" || session.TenantUID != "tenant-a" {
		t.Fatalf("session=%+v", session)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	if reopened, err := Open(path); err != nil {
		t.Fatal(err)
	} else {
		_ = reopened.Close()
	}
}

func TestStoreUpgradesLegacyLoginTransactionsWithTenant(t *testing.T) {
	path := filepath.Join(t.TempDir(), "control.sqlite")
	legacy, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`,
		`INSERT INTO schema_migrations(version, applied_at) VALUES(1, 0)`,
		`CREATE TABLE oidc_transactions (state_hash TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL, return_to TEXT NOT NULL, redirect_uri TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
	} {
		if _, err := legacy.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	if err := store.CreateLoginTransaction(context.Background(), "state-upgraded", domain.LoginTransaction{TenantUID: "tenant-a", Nonce: "nonce", Verifier: "verifier", ReturnTo: "/", RedirectURI: "https://backup.test/auth/oidc/callback", ExpiresAt: now.Add(time.Minute)}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ConsumeLoginTransaction(context.Background(), "state-upgraded", "tenant-a", now); err != nil {
		t.Fatal(err)
	}
}

func TestStoreCursorFiltersAndTenantIsolation(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	items := []domain.ApplicationInstance{
		{TenantUID: "tenant-a", AppID: "cloud.a", Name: "Alpha", Version: "1", DeployID: "deploy-a", MultiInstance: true, CapabilityStatus: "BACKUPABLE", ReadOnlyMode: "service-enforced", FileCount: 1, LastSyncedAt: now},
		{TenantUID: "tenant-a", AppID: "cloud.b", Name: "Beta", Version: "1", DeployID: "deploy-b", MultiInstance: false, CapabilityStatus: "NO_DATA", LastSyncedAt: now},
	}
	if err := store.ReplaceInstances(context.Background(), "tenant-a", items, now); err != nil {
		t.Fatal(err)
	}
	if err := store.ReplaceInstances(context.Background(), "tenant-b", []domain.ApplicationInstance{{TenantUID: "tenant-b", AppID: "cloud.secret", Name: "Secret", DeployID: "deploy-secret", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	page, err := store.ListInstances(context.Background(), "tenant-a", domain.ApplicationFilter{Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].DeployID != "deploy-a" || page.NextCursor == "" {
		t.Fatalf("first page=%+v", page)
	}
	next, err := store.ListInstances(context.Background(), "tenant-a", domain.ApplicationFilter{Limit: 1, Cursor: page.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if len(next.Items) != 1 || next.Items[0].DeployID != "deploy-b" {
		t.Fatalf("next page=%+v", next)
	}
	filtered, err := store.ListInstances(context.Background(), "tenant-a", domain.ApplicationFilter{Limit: 10, Mode: "multi", CapabilityStatus: "BACKUPABLE"})
	if err != nil {
		t.Fatal(err)
	}
	if len(filtered.Items) != 1 || filtered.Items[0].DeployID != "deploy-a" {
		t.Fatalf("filtered=%+v", filtered)
	}
	if err := store.ReplaceInstances(context.Background(), "tenant-a", append(items, domain.ApplicationInstance{TenantUID: "tenant-a", AppID: "cloud.shared", Name: "Shared", Version: "1", DeployID: "deploy-shared", MultiInstance: false, CapabilityStatus: "BACKUPABLE_SHARED_WARNING", LastSyncedAt: now}), now); err != nil {
		t.Fatal(err)
	}
	backupable, err := store.ListInstances(context.Background(), "tenant-a", domain.ApplicationFilter{Limit: 10, CapabilityStatus: "BACKUPABLE"})
	if err != nil || len(backupable.Items) != 2 {
		t.Fatalf("backupable=%+v err=%v", backupable, err)
	}
	if _, err := store.Instance(context.Background(), "tenant-a", "deploy-secret"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("cross-tenant instance was visible: %v", err)
	}
}

func TestStorePreventsConcurrentManualJobsAndFiltersSnapshotsByTenant(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	first := domain.BackupJob{ID: "job-a", TenantUID: "tenant-a", OIDCSubject: "subject-a", UserRole: domain.RoleNormal, AppID: "cloud.demo", ApplicationName: "Demo", DeployID: "deploy-a", MultiInstance: true, Status: "QUEUED", CreatedAt: now}
	if err := store.CreateBackupJob(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	second := first
	second.ID = "job-b"
	if err := store.CreateBackupJob(context.Background(), second); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("second job error=%v", err)
	}
	if err := store.InterruptOpenBackupJobs(context.Background(), "tenant-a", now); err != nil {
		t.Fatal(err)
	}
	if err := store.CreateBackupJob(context.Background(), second); err != nil {
		t.Fatalf("interrupted job kept instance lock: %v", err)
	}
	if err := store.InterruptOpenBackupJobs(context.Background(), "tenant-a", now); err != nil {
		t.Fatal(err)
	}
	third := first
	third.ID = "job-c"
	if err := store.CreateBackupJob(context.Background(), third); err != nil {
		t.Fatalf("interrupted job kept instance lock: %v", err)
	}
	if err := store.StartBackupJob(context.Background(), "tenant-a", third.ID, now); err != nil {
		t.Fatal(err)
	}
	verified := now.Add(time.Second)
	snapshot := domain.Snapshot{ID: "snapshot-a", TenantUID: "tenant-a", JobID: third.ID, AppID: "cloud.demo", ApplicationName: "Demo", DeployID: "deploy-a", MultiInstance: true, Status: "COMPLETED", StoragePath: "20260827T000000.000Z/deploy-a", ArchiveName: "snapshot.zip", ArchiveSize: 10, ArchiveSHA256: "abc", OriginalBytes: 10, FileCount: 1, CapturedAt: now, FinishedAt: verified, VerificationStatus: "VERIFIED", VerifiedAt: &verified}
	if err := store.CommitSnapshot(context.Background(), snapshot); err != nil {
		t.Fatal(err)
	}
	items, err := store.ListSnapshots(context.Background(), "tenant-a", 10)
	if err != nil || len(items) != 1 || items[0].ID != snapshot.ID {
		t.Fatalf("tenant a snapshots=%+v err=%v", items, err)
	}
	items, err = store.ListSnapshots(context.Background(), "tenant-b", 10)
	if err != nil || len(items) != 0 {
		t.Fatalf("tenant b snapshots=%+v err=%v", items, err)
	}
}
