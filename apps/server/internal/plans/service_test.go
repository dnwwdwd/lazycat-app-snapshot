package plans

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/backup"
	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/queue"
	"cloud.lazycat.app.backup/apps/server/internal/source"
)

func TestPlanCreatesAndExpandsOneCatchUpBatch(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "cloud.demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "cloud.demo", "note.txt"), []byte("scheduled"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC().Truncate(time.Minute)
	if err := store.ReplaceInstances(context.Background(), "tenant-a", []domain.ApplicationInstance{{TenantUID: "tenant-a", AppID: "cloud.demo", Name: "Demo", DeployID: "deploy-a", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	engine, err := backup.New(store, source.Resolver{Root: root, AllowNonstandardRoot: true}, backup.Config{TenantUID: "tenant-a", DocumentRoot: t.TempDir(), CacheRoot: t.TempDir(), ManagedByQueue: true})
	if err != nil {
		t.Fatal(err)
	}
	queueService, err := queue.New(store, engine, queue.Config{TenantUID: "tenant-a", Workers: 1, PollInterval: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	service, err := New(store, queueService, "tenant-a")
	if err != nil {
		t.Fatal(err)
	}
	plan, err := service.Create(context.Background(), domain.PlanInput{Name: "每天备份", TargetKind: "EXPLICIT", Targets: []domain.PlanTarget{{DeployID: "deploy-a"}}, ScheduleType: "DAILY", Timezone: "UTC", Enabled: true, CatchUp: true, MaxCatchUpSeconds: 3600, Retry: domain.RetryPolicy{MaxRetries: 1, BackoffSeconds: 60}, Retention: domain.RetentionPolicy{KeepLast: 1, TrashGraceHours: 24}}, "subject-a")
	if err != nil {
		t.Fatal(err)
	}
	past := now.Add(-30 * time.Second)
	if err := store.AdvancePlan(context.Background(), "tenant-a", plan.ID, past.Add(-24*time.Hour), &past, now); err != nil {
		t.Fatal(err)
	}
	if err := service.RunDue(context.Background(), now); err != nil {
		t.Fatal(err)
	}
	batches, err := queueService.Batches(context.Background(), 10)
	if err != nil || len(batches) != 1 || batches[0].PlanID != plan.ID || batches[0].TotalTasks != 1 {
		t.Fatalf("batches=%+v err=%v", batches, err)
	}
	updated, err := service.Plan(context.Background(), plan.ID)
	if err != nil || updated.NextRunAt == nil || !updated.NextRunAt.After(now) {
		t.Fatalf("plan=%+v err=%v", updated, err)
	}
}

func TestPlanRejectsCrossTenantAndSharedTargetsWithoutConfirmation(t *testing.T) {
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	if err := store.ReplaceInstances(context.Background(), "tenant-a", []domain.ApplicationInstance{{TenantUID: "tenant-a", AppID: "cloud.shared", Name: "Shared", DeployID: "shared-a", MultiInstance: false, CapabilityStatus: "BACKUPABLE_SHARED_WARNING", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	if err := store.ReplaceInstances(context.Background(), "tenant-b", []domain.ApplicationInstance{{TenantUID: "tenant-b", AppID: "cloud.secret", Name: "Secret", DeployID: "secret-b", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	engine, err := backup.New(store, source.Resolver{Root: t.TempDir(), AllowNonstandardRoot: true}, backup.Config{TenantUID: "tenant-a", DocumentRoot: t.TempDir(), CacheRoot: t.TempDir(), ManagedByQueue: true})
	if err != nil {
		t.Fatal(err)
	}
	queueService, err := queue.New(store, engine, queue.Config{TenantUID: "tenant-a", Workers: 1, PollInterval: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	service, err := New(store, queueService, "tenant-a")
	if err != nil {
		t.Fatal(err)
	}
	base := domain.PlanInput{Name: "计划", TargetKind: "EXPLICIT", ScheduleType: "DAILY", Timezone: "UTC", Enabled: true, CatchUp: true, MaxCatchUpSeconds: 3600, Retry: domain.RetryPolicy{}, Retention: domain.RetentionPolicy{KeepLast: 1, TrashGraceHours: 24}}
	base.Targets = []domain.PlanTarget{{DeployID: "secret-b"}}
	if _, err := service.Create(context.Background(), base, "subject-a"); err == nil {
		t.Fatal("cross-tenant target was accepted")
	}
	base.Targets = []domain.PlanTarget{{DeployID: "shared-a"}}
	if _, err := service.Create(context.Background(), base, "subject-a"); err == nil {
		t.Fatal("shared target was accepted without confirmation")
	}
}
