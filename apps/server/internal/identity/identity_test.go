package identity

import (
	"errors"
	"testing"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
)

func TestVerifyRequiresAllIdentitySourcesToMatch(t *testing.T) {
	if err := Verify("tenant-a", "tenant-a", "tenant-a"); err != nil {
		t.Fatalf("matching identities: %v", err)
	}
	if err := Verify("tenant-a", "tenant-b", "tenant-a"); !errors.Is(err, ErrMismatch) {
		t.Fatalf("mismatch error=%v", err)
	}
	if err := Verify("tenant-a", "", "tenant-a"); !errors.Is(err, ErrMismatch) {
		t.Fatalf("missing identity error=%v", err)
	}
}

func TestResolveRoleNeverExpandsAnAdminHeader(t *testing.T) {
	if role, err := ResolveRole([]string{"ADMIN"}, "ADMIN"); err != nil || role != domain.RoleAdmin {
		t.Fatalf("admin role=%q err=%v", role, err)
	}
	if _, err := ResolveRole(nil, "ADMIN"); !errors.Is(err, ErrMismatch) {
		t.Fatalf("unverified admin role error=%v", err)
	}
}
