package snapshots

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/backup"
	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/source"
	_ "modernc.org/sqlite"
)

func TestLibraryReadsExportsAndTrashesCurrentTenantSnapshot(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "cloud.demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "cloud.demo", "note.txt"), []byte("snapshot data"), 0o644); err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("sqlite", filepath.Join(root, "cloud.demo", "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec("CREATE TABLE records(value TEXT); INSERT INTO records(value) VALUES('consistent')"); err != nil {
		_ = database.Close()
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
	documents := t.TempDir()
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	if err := store.ReplaceInstances(context.Background(), "tenant-a", []domain.ApplicationInstance{{TenantUID: "tenant-a", AppID: "cloud.demo", Name: "Demo", DeployID: "deploy-a", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	engine, err := backup.New(store, source.Resolver{Root: root, AllowNonstandardRoot: true}, backup.Config{TenantUID: "tenant-a", DocumentRoot: documents, CacheRoot: t.TempDir(), JobTimeout: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	job, err := engine.StartManual(context.Background(), "deploy-a", false, "subject-a", domain.RoleNormal)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := waitSnapshot(t, engine, job.ID)
	service, err := New(store, documents, "tenant-a")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Verify(context.Background(), snapshot.ID, true); err != nil {
		t.Fatalf("full verification: %v", err)
	}
	files, err := service.Files(context.Background(), snapshot.ID)
	if err != nil || len(files) != 2 {
		t.Fatalf("files=%+v err=%v", files, err)
	}
	exportPath, err := service.Export(context.Background(), snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(documents, "LazycatAppBackup", filepath.FromSlash(exportPath), "note.txt")); err != nil {
		t.Fatalf("export is missing file: %v", err)
	}
	trashed, err := service.Delete(context.Background(), snapshot.ID)
	if err != nil || trashed.RetentionStatus != "TRASHED" {
		t.Fatalf("trashed=%+v err=%v", trashed, err)
	}
	if _, err := service.Files(context.Background(), snapshot.ID); err == nil {
		t.Fatal("trashed snapshot remained readable")
	}
}

func waitSnapshot(t *testing.T, engine *backup.Service, jobID string) domain.Snapshot {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		job, err := engine.Job(context.Background(), jobID)
		if err != nil {
			t.Fatal(err)
		}
		if job.Status == "SUCCEEDED" {
			snapshot, err := engine.Snapshot(context.Background(), job.SnapshotID)
			if err != nil {
				t.Fatal(err)
			}
			return snapshot
		}
		if job.Status == "FAILED" {
			t.Fatalf("backup failed: %+v", job)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("snapshot did not complete")
	return domain.Snapshot{}
}
