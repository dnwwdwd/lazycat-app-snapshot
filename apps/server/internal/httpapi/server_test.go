package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/auth"
	"cloud.lazycat.app.backup/apps/server/internal/backup"
	"cloud.lazycat.app.backup/apps/server/internal/catalog"
	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/plans"
	"cloud.lazycat.app.backup/apps/server/internal/platform"
	"cloud.lazycat.app.backup/apps/server/internal/queue"
	"cloud.lazycat.app.backup/apps/server/internal/snapshots"
	"cloud.lazycat.app.backup/apps/server/internal/source"
)

func TestSessionAPIRejectsMismatchedEntranceIdentity(t *testing.T) {
	issuer := ""
	oidcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/openid-configuration" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer": issuer, "authorization_endpoint": issuer + "/auth", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "userinfo_endpoint": issuer + "/userinfo",
		})
	}))
	defer oidcServer.Close()
	issuer = oidcServer.URL
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	manager, err := auth.New(context.Background(), store, auth.Config{TenantUID: "tenant-a", ClientID: "client", ClientSecret: "secret", IssuerURL: issuer})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := store.CreateSession(context.Background(), "raw-session", domain.Session{Subject: "subject-a", UID: "tenant-a", TenantUID: "tenant-a", Role: domain.RoleNormal, CreatedAt: now, ExpiresAt: now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	service := catalog.New(store, platform.FixtureCatalog{Path: "unused"}, source.Resolver{}, "tenant-a", "backup", 1)
	handler := New(manager, service, t.TempDir()).Handler()

	request := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	request.Header.Set("X-HC-User-ID", "tenant-a")
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: "raw-session"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("session response=%d %s", response.Code, response.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["uid"] != "tenant-a" || body["tenantUid"] != "tenant-a" {
		t.Fatalf("session body=%v", body)
	}

	request = httptest.NewRequest(http.MethodGet, "/api/session", nil)
	request.Header.Set("X-HC-User-ID", "tenant-b")
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: "raw-session"})
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("mismatch response=%d %s", response.Code, response.Body.String())
	}
	if !contains(response.Body.String(), "IDENTITY_MISMATCH") {
		t.Fatalf("mismatch body=%s", response.Body.String())
	}
}

func TestBrowserRejectsMismatchedIdentityInsteadOfStartingAnotherLogin(t *testing.T) {
	issuer := ""
	oidcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/openid-configuration" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer": issuer, "authorization_endpoint": issuer + "/auth", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "userinfo_endpoint": issuer + "/userinfo",
		})
	}))
	defer oidcServer.Close()
	issuer = oidcServer.URL
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	if err := store.CreateSession(context.Background(), "raw-session", domain.Session{Subject: "subject-a", UID: "tenant-a", TenantUID: "tenant-a", Role: domain.RoleNormal, CreatedAt: now, ExpiresAt: now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	manager, err := auth.New(context.Background(), store, auth.Config{TenantUID: "tenant-a", ClientID: "client", ClientSecret: "secret", IssuerURL: issuer})
	if err != nil {
		t.Fatal(err)
	}
	service := catalog.New(store, platform.FixtureCatalog{Path: "unused"}, source.Resolver{}, "tenant-a", "backup", 1)
	handler := New(manager, service, t.TempDir()).Handler()

	request := httptest.NewRequest(http.MethodGet, "/applications", nil)
	request.Header.Set("X-HC-User-ID", "tenant-b")
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: "raw-session"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || !contains(response.Body.String(), "IDENTITY_MISMATCH") {
		t.Fatalf("browser mismatch response=%d body=%s", response.Code, response.Body.String())
	}
}

func TestExternalURLPreservesTrustedForwardedScheme(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "http://internal/auth/login", nil)
	request.Host = "backup.example"
	request.Header.Set("X-Forwarded-Proto", "https")
	if got := externalURL(request, "/auth/oidc/callback"); got != "https://backup.example/auth/oidc/callback" {
		t.Fatalf("url=%q", got)
	}
}

func TestManualBackupAPIUsesVerifiedSessionAndDoesNotExposeSourcePath(t *testing.T) {
	issuer := ""
	oidcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/openid-configuration" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"issuer": issuer, "authorization_endpoint": issuer + "/auth", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "userinfo_endpoint": issuer + "/userinfo",
		})
	}))
	defer oidcServer.Close()
	issuer = oidcServer.URL
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	if err := store.CreateSession(context.Background(), "raw-session", domain.Session{Subject: "subject-a", UID: "tenant-a", TenantUID: "tenant-a", Role: domain.RoleNormal, CreatedAt: now, ExpiresAt: now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if err := store.ReplaceInstances(context.Background(), "tenant-a", []domain.ApplicationInstance{{TenantUID: "tenant-a", AppID: "cloud.demo", Name: "Demo", DeployID: "deploy-a", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	appvar := t.TempDir()
	if err := os.Mkdir(filepath.Join(appvar, "cloud.demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(appvar, "cloud.demo", "note.txt"), []byte("snapshot"), 0o644); err != nil {
		t.Fatal(err)
	}
	manager, err := auth.New(context.Background(), store, auth.Config{TenantUID: "tenant-a", ClientID: "client", ClientSecret: "secret", IssuerURL: issuer})
	if err != nil {
		t.Fatal(err)
	}
	catalogService := catalog.New(store, platform.FixtureCatalog{Path: "unused"}, source.Resolver{Root: appvar, AllowNonstandardRoot: true}, "tenant-a", "backup", 1)
	backupService, err := backup.New(store, source.Resolver{Root: appvar, AllowNonstandardRoot: true}, backup.Config{TenantUID: "tenant-a", DocumentRoot: t.TempDir(), CacheRoot: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	handler := New(manager, catalogService, t.TempDir(), backupService).Handler()
	request := httptest.NewRequest(http.MethodPost, "/api/instances/deploy-a/backup", strings.NewReader(`{"sharedRiskAccepted":false}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-HC-User-ID", "tenant-a")
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: "raw-session"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusAccepted {
		t.Fatalf("backup response=%d %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), appvar) || !strings.Contains(response.Body.String(), `"accepted":true`) {
		t.Fatalf("backup body=%s", response.Body.String())
	}
}

func TestPlanAPIUsesCurrentTenantTargetsOnly(t *testing.T) {
	issuer := ""
	oidcServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/openid-configuration" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"issuer": issuer, "authorization_endpoint": issuer + "/auth", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "userinfo_endpoint": issuer + "/userinfo"})
	}))
	defer oidcServer.Close()
	issuer = oidcServer.URL
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	if err := store.CreateSession(context.Background(), "raw-session", domain.Session{Subject: "subject-a", UID: "tenant-a", TenantUID: "tenant-a", Role: domain.RoleNormal, CreatedAt: now, ExpiresAt: now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if err := store.ReplaceInstances(context.Background(), "tenant-a", []domain.ApplicationInstance{{TenantUID: "tenant-a", AppID: "cloud.demo", Name: "Demo", DeployID: "deploy-a", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	if err := store.ReplaceInstances(context.Background(), "tenant-b", []domain.ApplicationInstance{{TenantUID: "tenant-b", AppID: "cloud.secret", Name: "Secret", DeployID: "deploy-b", MultiInstance: true, CapabilityStatus: "BACKUPABLE", LastSyncedAt: now}}, now); err != nil {
		t.Fatal(err)
	}
	manager, err := auth.New(context.Background(), store, auth.Config{TenantUID: "tenant-a", ClientID: "client", ClientSecret: "secret", IssuerURL: issuer})
	if err != nil {
		t.Fatal(err)
	}
	appvar := t.TempDir()
	if err := os.Mkdir(filepath.Join(appvar, "cloud.demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	engine, err := backup.New(store, source.Resolver{Root: appvar, AllowNonstandardRoot: true}, backup.Config{TenantUID: "tenant-a", DocumentRoot: t.TempDir(), CacheRoot: t.TempDir(), ManagedByQueue: true})
	if err != nil {
		t.Fatal(err)
	}
	library, err := snapshots.New(store, t.TempDir(), "tenant-a")
	if err != nil {
		t.Fatal(err)
	}
	queueService, err := queue.New(store, engine, queue.Config{TenantUID: "tenant-a", Workers: 1, PollInterval: time.Hour, AfterSucceeded: library.ApplyRetentionForTask})
	if err != nil {
		t.Fatal(err)
	}
	planService, err := plans.New(store, queueService, "tenant-a")
	if err != nil {
		t.Fatal(err)
	}
	catalogService := catalog.New(store, platform.FixtureCatalog{Path: "unused"}, source.Resolver{Root: appvar, AllowNonstandardRoot: true}, "tenant-a", "backup", 1)
	handler := New(manager, catalogService, t.TempDir(), engine).SetPhase4(planService, queueService, library).Handler()
	planBody := `{"name":"每日备份","targetKind":"EXPLICIT","targets":[{"deployId":"deploy-a","sharedRiskAccepted":false}],"sharedRiskAccepted":false,"scheduleType":"DAILY","timezone":"UTC","enabled":true,"catchUp":true,"maxCatchUpSeconds":3600,"retry":{"maxRetries":1,"backoffSeconds":60},"retention":{"keepLast":1,"keepDaily":0,"keepWeekly":0,"keepMonthly":0,"trashGraceHours":24}}`
	request := httptest.NewRequest(http.MethodPost, "/api/plans", strings.NewReader(planBody))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-HC-User-ID", "tenant-a")
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: "raw-session"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || strings.Contains(response.Body.String(), "tenant-b") {
		t.Fatalf("create=%d %s", response.Code, response.Body.String())
	}
	request = httptest.NewRequest(http.MethodPost, "/api/plans", strings.NewReader(strings.Replace(planBody, "deploy-a", "deploy-b", 1)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-HC-User-ID", "tenant-a")
	request.AddCookie(&http.Cookie{Name: auth.CookieName, Value: "raw-session"})
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound || !contains(response.Body.String(), "RESOURCE_NOT_FOUND") {
		t.Fatalf("cross-tenant=%d %s", response.Code, response.Body.String())
	}
}

func contains(value, needle string) bool { return strings.Contains(value, needle) }
