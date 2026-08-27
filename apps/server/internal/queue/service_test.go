package queue

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/backup"
	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/source"
)

func TestManualBackupUsesPersistentTaskQueue(t *testing.T) {
	root := t.TempDir()
	appRoot := filepath.Join(root, "cloud.demo")
	if err := os.MkdirAll(appRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(appRoot, "note.txt"), []byte("queue snapshot"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	if err := store.ReplaceInstances(context.Background(), "tenant-a", []domain.ApplicationInstance{{TenantUID: "tenant-a", AppID: "cloud.demo", Name: "Demo", DeployID: "deploy-a", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	engine, err := backup.New(store, source.Resolver{Root: root, AllowNonstandardRoot: true}, backup.Config{TenantUID: "tenant-a", DocumentRoot: t.TempDir(), CacheRoot: t.TempDir(), ManagedByQueue: true, JobTimeout: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	service, err := New(store, engine, Config{TenantUID: "tenant-a", Workers: 1, PollInterval: 5 * time.Millisecond, LeaseDuration: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	job, err := service.StartManual(context.Background(), "deploy-a", false, "subject-a", domain.RoleNormal)
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		current, err := engine.Job(context.Background(), job.ID)
		if err != nil {
			t.Fatal(err)
		}
		if current.Status == "SUCCEEDED" {
			tasks, err := service.Tasks(context.Background(), domain.TaskFilter{Limit: 10})
			if err != nil { t.Fatal(err) }
			if len(tasks) == 1 && tasks[0].Status == "SUCCEEDED" && tasks[0].SnapshotID != "" {
				batches, err := service.Batches(context.Background(), 10)
				if err != nil || len(batches) != 1 || batches[0].Status != "SUCCEEDED" { t.Fatalf("batches=%+v err=%v", batches, err) }
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("backup job did not complete")
}

func TestExpiredLeaseReturnsTaskToQueue(t *testing.T) {
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	if err := store.ReplaceInstances(context.Background(), "tenant-a", []domain.ApplicationInstance{{TenantUID: "tenant-a", AppID: "cloud.demo", Name: "Demo", DeployID: "deploy-a", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	engine, err := backup.New(store, source.Resolver{Root: t.TempDir(), AllowNonstandardRoot: true}, backup.Config{TenantUID: "tenant-a", DocumentRoot: t.TempDir(), CacheRoot: t.TempDir(), ManagedByQueue: true})
	if err != nil {
		t.Fatal(err)
	}
	batch := domain.BackupBatch{ID: "batch-a", TenantUID: "tenant-a", PlanID: "plan-a", PlanName: "Plan", TriggerType: "scheduled", Status: "QUEUED", ScheduledAt: now, CreatedAt: now}
	if err := store.CreateBatch(context.Background(), batch); err != nil {
		t.Fatal(err)
	}
	job, err := engine.CreateJob(context.Background(), "deploy-a", false, "subject-a", domain.RoleNormal, "plan-a", "batch-a", "task-a", "scheduled", now)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AddTask(context.Background(), domain.BackupTask{ID: "task-a", TenantUID: "tenant-a", BatchID: "batch-a", PlanID: "plan-a", BackupJobID: job.ID, AppID: "cloud.demo", ApplicationName: "Demo", DeployID: "deploy-a", MultiInstance: true, TriggerType: "scheduled", Status: "QUEUED", MaxRetries: 1, RetryBackoffSeconds: 60, AvailableAt: now, ScheduledAt: now, CreatedAt: now}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ClaimNextTask(context.Background(), "tenant-a", "worker-a", "lease-a", now, now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := store.RequeueExpiredTasks(context.Background(), "tenant-a", now.Add(2*time.Second)); err != nil {
		t.Fatal(err)
	}
	task, err := store.Task(context.Background(), "tenant-a", "task-a")
	if err != nil || task.Status != "QUEUED" || task.ErrorCode != "WORKER_INTERRUPTED" {
		t.Fatalf("task=%+v err=%v", task, err)
	}
	updated, err := engine.Job(context.Background(), job.ID)
	if err != nil || updated.Status != "QUEUED" {
		t.Fatalf("job=%+v err=%v", updated, err)
	}
}
