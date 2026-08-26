package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func fixtureConfig(t *testing.T) (pocConfig, string) {
	t.Helper()
	root := t.TempDir()
	contents := []byte("owned fixture content\n")
	if err := os.WriteFile(filepath.Join(root, "known.txt"), contents, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "nested"), 0o700); err != nil {
		t.Fatal(err)
	}
	return pocConfig{
		tenantUID:         "user-a",
		backupDeployUID:   "user-a",
		backupDeployID:    "backup-a",
		sourceRoot:        root,
		sourceOwnerUID:    "user-a",
		sourceDeployID:    "fixture-a",
		sourceMultiInstance: true,
	}, root
}

func ingressRequest(t *testing.T, handler http.Handler, path string, user string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.Header.Set("X-Forwarded-By", "lzc-ingress")
	request.Header.Set("X-HC-User-ID", user)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func errorCode(t *testing.T, response *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body["code"]
}

func TestIdentityAllowsOnlyMatchingIngressTenant(t *testing.T) {
	config, _ := fixtureConfig(t)
	handler := newServer(config, t.TempDir())

	request := httptest.NewRequest(http.MethodGet, "/api/poc/identity", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || errorCode(t, response) != "INGRESS_IDENTITY_REQUIRED" {
		t.Fatalf("missing ingress: status=%d body=%s", response.Code, response.Body.String())
	}

	response = ingressRequest(t, handler, "/api/poc/identity", "user-b")
	if response.Code != http.StatusForbidden || errorCode(t, response) != "TENANT_IDENTITY_MISMATCH" {
		t.Fatalf("mismatched identity: status=%d body=%s", response.Code, response.Body.String())
	}

	response = ingressRequest(t, handler, "/api/poc/identity", "user-a")
	if response.Code != http.StatusOK {
		t.Fatalf("matching identity: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestIdentityMisconfigurationProvidesOnlySafeDiagnostics(t *testing.T) {
	config := pocConfig{tenantUID: "user-a", backupDeployUID: "user-b", backupDeployID: "backup-a"}
	response := ingressRequest(t, newServer(config, t.TempDir()), "/api/poc/identity", "user-a")
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["identityConfigured"] != false {
		t.Fatalf("expected identityConfigured=false, got %#v", body)
	}
	if _, present := body["tenantUID"]; present {
		t.Fatalf("diagnostic unexpectedly exposes tenant: %#v", body)
	}

	response = ingressRequest(t, newServer(config, t.TempDir()), "/api/poc/source?deploy_id=fixture-a", "user-a")
	if response.Code != http.StatusServiceUnavailable || errorCode(t, response) != "IDENTITY_NOT_READY" {
		t.Fatalf("misconfigured identity must block source access: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestOwnedFixtureCanBeListedAndHashed(t *testing.T) {
	config, _ := fixtureConfig(t)
	handler := newServer(config, t.TempDir())

	response := ingressRequest(t, handler, "/api/poc/source?deploy_id=fixture-a", "user-a")
	if response.Code != http.StatusOK {
		t.Fatalf("list: status=%d body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("source response is cacheable")
	}

	response = ingressRequest(t, handler, "/api/poc/read?deploy_id=fixture-a&path=known.txt", "user-a")
	if response.Code != http.StatusOK {
		t.Fatalf("read: status=%d body=%s", response.Code, response.Body.String())
	}
	var body struct {
		SHA256    string `json:"sha256"`
		HashScope string `json:"hashScope"`
		Complete  bool   `json:"complete"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	expected := sha256.Sum256([]byte("owned fixture content\n"))
	if body.SHA256 != hex.EncodeToString(expected[:]) || body.HashScope != "complete" || !body.Complete {
		t.Fatalf("unexpected hash response: %#v", body)
	}
}

func TestUnknownDeployIDIsNotDisclosed(t *testing.T) {
	config, _ := fixtureConfig(t)
	response := ingressRequest(t, newServer(config, t.TempDir()), "/api/poc/source?deploy_id=fixture-b", "user-a")
	if response.Code != http.StatusNotFound || errorCode(t, response) != "SOURCE_NOT_FOUND" {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestSourcePathsCannotEscapeFixture(t *testing.T) {
	config, root := fixtureConfig(t)
	outside := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "outside-link")); err != nil {
		t.Fatal(err)
	}
	handler := newServer(config, t.TempDir())

	paths := []string{"../outside.txt", outside, "outside-link"}
	for _, path := range paths {
		response := ingressRequest(t, handler, "/api/poc/read?deploy_id=fixture-a&path="+url.QueryEscape(path), "user-a")
		if response.Code != http.StatusBadRequest || errorCode(t, response) != "INVALID_SOURCE_PATH" {
			t.Fatalf("path %q: status=%d body=%s", path, response.Code, response.Body.String())
		}
	}

	response := ingressRequest(t, handler, "/api/poc/read?deploy_id=fixture-a&path=nested", "user-a")
	if response.Code != http.StatusNotFound || errorCode(t, response) != "SOURCE_FILE_NOT_FOUND" {
		t.Fatalf("directory read: status=%d body=%s", response.Code, response.Body.String())
	}

	if err := syscall.Mkfifo(filepath.Join(root, "fixture-pipe"), 0o600); err != nil {
		t.Fatal(err)
	}
	response = ingressRequest(t, handler, "/api/poc/read?deploy_id=fixture-a&path=fixture-pipe", "user-a")
	if response.Code != http.StatusNotFound || errorCode(t, response) != "SOURCE_FILE_NOT_FOUND" {
		t.Fatalf("special file read: status=%d body=%s", response.Code, response.Body.String())
	}
}
