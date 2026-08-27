package catalog

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/platform"
	"cloud.lazycat.app.backup/apps/server/internal/source"
)

type fakeCatalog []platform.Application

func (f fakeCatalog) List(context.Context, string, string) ([]platform.Application, error) {
	return f, nil
}

func TestSyncPersistsProbeResultAndMarksAmbiguousProjection(t *testing.T) {
	root := t.TempDir()
	for _, appID := range []string{"cloud.alpha", "cloud.shared"} {
		if err := os.MkdirAll(filepath.Join(root, appID), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "cloud.alpha", "note.txt"), []byte("backup"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := New(store, fakeCatalog{
		{AppID: "cloud.alpha", Name: "Alpha", DeployID: "alpha", OwnerUID: "tenant-a", MultiInstance: true},
		{AppID: "cloud.shared", Name: "Shared", DeployID: "shared-1", OwnerUID: "tenant-a", MultiInstance: true},
		{AppID: "cloud.shared", Name: "Shared", DeployID: "shared-2", OwnerUID: "tenant-a", MultiInstance: true},
		{AppID: "cloud.other", Name: "Other", DeployID: "other", OwnerUID: "tenant-b", MultiInstance: true},
	}, source.Resolver{Root: root, AllowNonstandardRoot: true}, "tenant-a", "cloud.lazycat.app.backup", 99)
	if service.workers != 8 {
		t.Fatalf("workers=%d", service.workers)
	}
	service.run(context.Background())
	page, err := service.List(context.Background(), domain.ApplicationFilter{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 3 {
		t.Fatalf("items=%+v", page.Items)
	}
	for _, item := range page.Items {
		if item.DeployID == "alpha" && item.CapabilityStatus != "BACKUPABLE" {
			t.Fatalf("alpha=%+v", item)
		}
		if item.DeployID != "alpha" && item.CapabilityStatus != "SOURCE_MAPPING_AMBIGUOUS" {
			t.Fatalf("ambiguous=%+v", item)
		}
	}
	status, err := service.SyncStatus(context.Background())
	if err != nil || status.State != "SUCCEEDED" {
		t.Fatalf("status=%+v err=%v", status, err)
	}
}
