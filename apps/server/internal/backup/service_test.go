package backup

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/source"
)

func TestManualBackupCreatesVerifiableZipAndManifest(t *testing.T) {
	appvar := t.TempDir()
	appRoot := filepath.Join(appvar, "cloud.demo")
	if err := os.MkdirAll(appRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(appRoot, "note.txt"), []byte("cat backup"), 0o644); err != nil {
		t.Fatal(err)
	}
	database := filepath.Join(appRoot, "state.sqlite")
	if err := createSQLite(database); err != nil {
		t.Fatal(err)
	}
	store := openStoreWithInstance(t, "tenant-a", "cloud.demo", "deploy-demo", true)
	defer store.Close()
	documents := t.TempDir()
	service, err := New(store, source.Resolver{Root: appvar, AllowNonstandardRoot: true}, Config{TenantUID: "tenant-a", DocumentRoot: documents, CacheRoot: t.TempDir(), JobTimeout: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	job, err := service.StartManual(context.Background(), "deploy-demo", false, "subject-a", domain.RoleNormal)
	if err != nil {
		t.Fatal(err)
	}
	completed := waitForJob(t, service, job.ID)
	if completed.Status != "SUCCEEDED" || completed.SnapshotID == "" {
		t.Fatalf("job=%+v", completed)
	}
	snapshot, err := service.Snapshot(context.Background(), completed.SnapshotID)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.VerificationStatus != "VERIFIED" || snapshot.ArchiveSHA256 == "" || strings.Contains(snapshot.StoragePath, appvar) {
		t.Fatalf("snapshot=%+v", snapshot)
	}
	archivePath := filepath.Join(documents, "LazycatAppBackup", filepath.FromSlash(snapshot.StoragePath), snapshot.ArchiveName)
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	entries := map[string]bool{}
	for _, entry := range reader.File {
		entries[entry.Name] = true
	}
	for _, expected := range []string{"appvar/note.txt", "appvar/state.sqlite", "_snapshot/manifest.json", "_snapshot/file-index.jsonl", "_snapshot/warnings.json"} {
		if !entries[expected] {
			t.Fatalf("missing %s in %v", expected, entries)
		}
	}
	manifestPath := filepath.Join(documents, "LazycatAppBackup", filepath.FromSlash(snapshot.StoragePath), "manifest.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), appvar) {
		t.Fatalf("manifest leaked source root: %s", data)
	}
	var manifest map[string]any
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest["status"] != "completed" || manifest["archive_sha256"] != snapshot.ArchiveSHA256 {
		t.Fatalf("manifest=%v snapshot=%+v", manifest, snapshot)
	}
	verified, err := service.Verify(context.Background(), snapshot.ID)
	if err != nil || verified.VerificationStatus != "VERIFIED" {
		t.Fatalf("verify snapshot=%+v err=%v", verified, err)
	}
}

func TestManualBackupRejectsSharedWithoutConfirmationAndBlockedDatabase(t *testing.T) {
	appvar := t.TempDir()
	sharedRoot := filepath.Join(appvar, "cloud.shared")
	blockedRoot := filepath.Join(appvar, "cloud.blocked")
	for _, root := range []string{sharedRoot, blockedRoot} {
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(sharedRoot, "data.txt"), []byte("shared"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(blockedRoot, "PG_VERSION"), []byte("16"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	instances := []domain.ApplicationInstance{
		{TenantUID: "tenant-a", AppID: "cloud.shared", Name: "Shared", DeployID: "deploy-shared", MultiInstance: false, CapabilityStatus: "BACKUPABLE_SHARED_WARNING", LastSyncedAt: now},
		{TenantUID: "tenant-a", AppID: "cloud.blocked", Name: "Blocked", DeployID: "deploy-blocked", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now},
	}
	if err := store.ReplaceInstances(context.Background(), "tenant-a", instances, now); err != nil {
		t.Fatal(err)
	}
	service, err := New(store, source.Resolver{Root: appvar, AllowNonstandardRoot: true}, Config{TenantUID: "tenant-a", DocumentRoot: t.TempDir(), CacheRoot: t.TempDir(), JobTimeout: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.StartManual(context.Background(), "deploy-shared", false, "subject-a", domain.RoleNormal); Code(err) != "SHARED_INSTANCE_CONFIRMATION_REQUIRED" {
		t.Fatalf("shared confirmation error=%v", err)
	}
	job, err := service.StartManual(context.Background(), "deploy-blocked", false, "subject-a", domain.RoleNormal)
	if err != nil {
		t.Fatal(err)
	}
	failed := waitForJob(t, service, job.ID)
	if failed.Status != "FAILED" || failed.ErrorCode != "UNSUPPORTED_DATABASE" {
		t.Fatalf("job=%+v", failed)
	}
	snapshots, err := service.Snapshots(context.Background(), 10)
	if err != nil || len(snapshots) != 0 {
		t.Fatalf("snapshots=%+v err=%v", snapshots, err)
	}
}

func openStoreWithInstance(t *testing.T, tenant, appID, deployID string, multi bool) *persistence.Store {
	t.Helper()
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := store.ReplaceInstances(context.Background(), tenant, []domain.ApplicationInstance{{TenantUID: tenant, AppID: appID, Name: "Demo", Version: "1", DeployID: deployID, MultiInstance: multi, CapabilityStatus: "BACKUPABLE", ReadOnlyMode: "service-enforced", FileCount: 2, LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	return store
}

func createSQLite(filename string) error {
	db, err := sql.Open("sqlite", filename)
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.Exec("CREATE TABLE records(value TEXT)"); err != nil {
		return err
	}
	_, err = db.Exec("INSERT INTO records(value) VALUES('consistent')")
	return err
}

func waitForJob(t *testing.T, service *Service, id string) domain.BackupJob {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		job, err := service.Job(context.Background(), id)
		if err != nil {
			t.Fatal(err)
		}
		if job.Status == "SUCCEEDED" || job.Status == "FAILED" {
			return job
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("backup job %s did not finish", id)
	return domain.BackupJob{}
}
