package source

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolverRejectsUnsafeAndCrossTenantRequests(t *testing.T) {
	root := t.TempDir()
	resolver := Resolver{Root: root, AllowNonstandardRoot: true}
	if _, err := resolver.Resolve(Request{TenantUID: "tenant-a", OwnerUID: "tenant-b", AppID: "demo", DeployID: "deploy"}); Code(err) != "SOURCE_OWNER_MISMATCH" {
		t.Fatalf("owner mismatch: %v", err)
	}
	if _, err := resolver.Resolve(Request{TenantUID: "tenant-a", OwnerUID: "tenant-a", AppID: "../outside", DeployID: "deploy"}); Code(err) != "SOURCE_INSTANCE_NOT_FOUND" {
		t.Fatalf("traversal: %v", err)
	}
}

func TestResolverPinsApplicationDirectoryAndRejectsSymlink(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "cloud.demo")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatal(err)
	}
	resolver := Resolver{Root: root, AllowNonstandardRoot: true}
	resolved, err := resolver.Resolve(Request{TenantUID: "tenant-a", OwnerUID: "tenant-a", AppID: "cloud.demo", DeployID: "deploy-a"})
	if err != nil || resolved.Root != target || resolved.ReadOnlyMode != "service-enforced" {
		t.Fatalf("resolved=%+v err=%v", resolved, err)
	}
	if err := os.Symlink(target, filepath.Join(root, "cloud.link")); err != nil {
		t.Fatal(err)
	}
	_, err = resolver.Resolve(Request{TenantUID: "tenant-a", OwnerUID: "tenant-a", AppID: "cloud.link", DeployID: "deploy-a"})
	if err == nil || Code(err) != "SOURCE_PERMISSION_DENIED" {
		t.Fatalf("symlink=%v", err)
	}
}
