package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"github.com/go-jose/go-jose/v4"
)

func TestSessionRequiresEntranceAndTenantIdentity(t *testing.T) {
	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Now().UTC()
	if err := store.CreateSession(context.Background(), "session-a", domain.Session{Subject: "sub", UID: "tenant-a", TenantUID: "tenant-a", Role: domain.RoleAdmin, CreatedAt: now, ExpiresAt: now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	manager := &Manager{store: store, config: Config{TenantUID: "tenant-a"}}
	request := httptest.NewRequest("GET", "/api/session", nil)
	request.Header.Set("X-HC-User-ID", "tenant-a")
	request.AddCookie(&http.Cookie{Name: CookieName, Value: "session-a"})
	session, err := manager.Session(context.Background(), request)
	if err != nil || session.Role != domain.RoleAdmin {
		t.Fatalf("session=%+v err=%v", session, err)
	}
	request.Header.Set("X-HC-User-ID", "tenant-b")
	if _, err := manager.Session(context.Background(), request); err != ErrIdentityMismatch {
		t.Fatalf("mismatch=%v", err)
	}
	if _, err := store.Session(context.Background(), "session-a", now); err == nil {
		t.Fatal("identity-mismatched session was retained")
	}
}

func TestSafeReturnToRejectsExternalRedirects(t *testing.T) {
	for _, input := range []string{"https://example.com", "//example.com", "relative"} {
		if got := safeReturnTo(input); got != "/" {
			t.Fatalf("safeReturnTo(%q)=%q", input, got)
		}
	}
	if got := safeReturnTo("/applications?tab=all"); got != "/applications?tab=all" {
		t.Fatalf("safe local redirect=%q", got)
	}
}

func TestRoleRequiresMatchingOIDCGroupsAndEntranceHeader(t *testing.T) {
	if role, err := roleFor([]string{"ADMIN"}, "ADMIN"); err != nil || role != domain.RoleAdmin {
		t.Fatalf("admin role=%q err=%v", role, err)
	}
	if role, err := roleFor([]string{}, "NORMAL"); err != nil || role != domain.RoleNormal {
		t.Fatalf("normal role=%q err=%v", role, err)
	}
	if _, err := roleFor([]string{"ADMIN"}, "NORMAL"); err != ErrIdentityMismatch {
		t.Fatalf("group/header conflict=%v", err)
	}
}

func TestAuthorizationCodePKCECompletesAgainstLocalOIDCProvider(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	var issuer, expectedNonce string
	fakeProvider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			_ = json.NewEncoder(w).Encode(map[string]string{
				"issuer": issuer, "authorization_endpoint": issuer + "/authorize", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "userinfo_endpoint": issuer + "/userinfo",
			})
		case "/keys":
			_ = json.NewEncoder(w).Encode(map[string]any{"keys": []jose.JSONWebKey{{Key: &privateKey.PublicKey, KeyID: "test-key", Algorithm: string(jose.RS256), Use: "sig"}}})
		case "/token":
			if err := r.ParseForm(); err != nil || r.Form.Get("code") != "authorization-code" || r.Form.Get("code_verifier") == "" {
				http.Error(w, "invalid authorization request", http.StatusBadRequest)
				return
			}
			signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: privateKey}, (&jose.SignerOptions{}).WithHeader("kid", "test-key").WithType("JWT"))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			payload, _ := json.Marshal(map[string]any{"iss": issuer, "sub": "subject-a", "aud": "client-a", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "nonce": expectedNonce})
			idToken, err := signer.Sign(payload)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			serialized, err := idToken.CompactSerialize()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "access-token", "token_type": "Bearer", "expires_in": 3600, "id_token": serialized})
		case "/userinfo":
			if r.Header.Get("Authorization") != "Bearer access-token" {
				http.Error(w, "missing token", http.StatusUnauthorized)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"sub": "subject-a", "preferred_username": "tenant-a", "name": "Tenant A", "email": "a@example.test", "groups": []string{}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer fakeProvider.Close()
	issuer = fakeProvider.URL

	store, err := persistence.Open(filepath.Join(t.TempDir(), "control.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	manager, err := New(context.Background(), store, Config{TenantUID: "tenant-a", ClientID: "client-a", ClientSecret: "secret", IssuerURL: issuer, SessionTTL: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	loginURL, err := manager.LoginURL(context.Background(), "tenant-a", "https://backup.example/auth/oidc/callback", "/applications?tab=all")
	if err != nil {
		t.Fatal(err)
	}
	authorize, err := url.Parse(loginURL)
	if err != nil {
		t.Fatal(err)
	}
	query := authorize.Query()
	expectedNonce = query.Get("nonce")
	if query.Get("state") == "" || expectedNonce == "" || query.Get("code_challenge") == "" || query.Get("code_challenge_method") != "S256" || !strings.Contains(query.Get("scope"), "groups") {
		t.Fatalf("unexpected authorization URL: %s", loginURL)
	}

	session, rawSessionID, returnTo, err := manager.CompleteLogin(context.Background(), "tenant-a", "NORMAL", query.Get("state"), "authorization-code")
	if err != nil {
		t.Fatal(err)
	}
	if rawSessionID == "" || session.UID != "tenant-a" || returnTo != "/applications?tab=all" {
		t.Fatalf("session=%+v raw=%q returnTo=%q", session, rawSessionID, returnTo)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	request.Header.Set("X-HC-User-ID", "tenant-a")
	request.AddCookie(&http.Cookie{Name: CookieName, Value: rawSessionID})
	if persisted, err := manager.Session(context.Background(), request); err != nil || persisted.Subject != "subject-a" {
		t.Fatalf("persisted=%+v err=%v", persisted, err)
	}
}
