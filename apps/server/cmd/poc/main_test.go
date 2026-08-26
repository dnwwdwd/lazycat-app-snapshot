package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"google.golang.org/grpc/metadata"
)

func TestRelativeFileRejectsAbsoluteAndTraversalPaths(t *testing.T) {
	root := t.TempDir()
	if _, err := relativeFile(root, "/etc/passwd"); err == nil {
		t.Fatal("absolute path was accepted")
	}
	if _, err := relativeFile(root, "../outside"); err == nil {
		t.Fatal("parent traversal was accepted")
	}
}

func TestRelativeFileRejectsSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	if _, err := relativeFile(root, "escape/secret.txt"); err == nil {
		t.Fatal("symlink escape was accepted")
	}
}

func TestValidateSourceRequiresTenantButAllowsSingleInstanceForPOC(t *testing.T) {
	root := t.TempDir()
	base := pocConfig{
		tenantUID:      "tenant-a",
		sourceRoot:     root,
		sourceOwnerUID: "tenant-b",
		sourceDeployID: "source-a",
		multiInstance:  true,
	}
	if _, err := base.validateSource(); err == nil {
		t.Fatal("owner mismatch was accepted")
	}

	base.sourceOwnerUID = "tenant-a"
	base.multiInstance = false
	if resolved, err := base.validateSource(); err != nil || resolved != root {
		t.Fatalf("single-instance POC source was rejected: root=%q err=%v", resolved, err)
	}
}

func TestPlatformResolverDoesNotInventAPath(t *testing.T) {
	config := pocConfig{tenantUID: "tenant-a"}
	app := pocApplication{AppID: "cloud.lazycat.demo", DeployID: "deploy-a", OwnerUID: "tenant-a", MultiInstance: true}
	if _, err := resolveApplicationSource(context.Background(), config, app); err == nil || !strings.Contains(err.Error(), "platform source resolver is not configured") {
		t.Fatalf("platform resolver result = %v, want SOURCE_NOT_READY", err)
	}
}

func TestFixtureResolverReturnsDeployBoundSourceMetadata(t *testing.T) {
	root := t.TempDir()
	config := pocConfig{tenantUID: "tenant-a"}
	app := pocApplication{AppID: "cloud.lazycat.demo", DeployID: "deploy-a", OwnerUID: "tenant-a", SourceRoot: root}
	resolved, err := resolveApplicationSource(context.Background(), config, app)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Root != root || resolved.DeployID != app.DeployID || resolved.Projection != "fixture-directory" || resolved.AdapterVersion == "" || resolved.VerifiedAt.IsZero() {
		t.Fatalf("resolved source metadata = %+v", resolved)
	}
}

func TestSingleInstanceReportIsBackupableWithWarning(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "fixture.txt"), []byte("single instance"), 0o600); err != nil {
		t.Fatal(err)
	}
	config := pocConfig{tenantUID: "tenant-a"}
	report := reportForApplication(config, pocApplication{
		AppID: "cloud.lazycat.single", Name: "Single", DeployID: "deploy-single", OwnerUID: "tenant-a", SourceRoot: root,
	})
	if report.Status != "BACKUPABLE" {
		t.Fatalf("single-instance report status = %q, want BACKUPABLE", report.Status)
	}
	if report.SourceWarning == "" || report.MultiInstance {
		t.Fatalf("single-instance warning/report fields = %+v", report)
	}
}

func TestSingleInstanceSnapshotIsAllowedForPOC(t *testing.T) {
	sourceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(sourceRoot, "single.txt"), []byte("single instance snapshot"), 0o600); err != nil {
		t.Fatal(err)
	}
	config := pocConfig{
		tenantUID:      "tenant-a",
		sourceRoot:     sourceRoot,
		sourceOwnerUID: "tenant-a",
		sourceDeployID: "deploy-single",
		multiInstance:  false,
		documentRoot:   t.TempDir(),
		webRoot:        sourceRoot,
	}
	handler := newHandler(config)
	request := httptest.NewRequest(http.MethodPost, "/api/poc/snapshots", strings.NewReader(`{"deploy_id":"deploy-single"}`))
	request.Header.Set("X-HC-User-ID", "tenant-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("single-instance snapshot response: %d %s", response.Code, response.Body.String())
	}
}

func TestTenantMiddlewareRejectsMissingAndMismatchedIdentity(t *testing.T) {
	config := pocConfig{tenantUID: "tenant-a"}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	handler := tenantMiddleware(config, next)

	for _, identity := range []string{"", "tenant-b"} {
		req := httptest.NewRequest(http.MethodGet, "/api/poc/identity", nil)
		req.Header.Set("X-HC-User-ID", identity)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusForbidden {
			t.Fatalf("identity %q returned %d", identity, res.Code)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/poc/identity", nil)
	req.Header.Set("X-HC-User-ID", "tenant-a")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("matching identity returned %d", res.Code)
	}
}

func TestUnconfiguredIdentityAndHealthRemainDiagnostic(t *testing.T) {
	handler := newHandler(pocConfig{webRoot: t.TempDir()})

	for _, path := range []string{"/api/health", "/api/poc/identity"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("%s returned %d", path, res.Code)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/poc/source", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("unconfigured source returned %d", res.Code)
	}
}

func TestConfigUsesPlatformUIDWithoutDeployID(t *testing.T) {
	t.Setenv("BACKUP_APP_DEPLOY_UID", "")
	t.Setenv("LAZYCAT_APP_DEPLOY_UID", "tenant-from-platform")
	t.Setenv("LAZYCAT_APP_DEPLOY_ID", "")
	config := configFromEnv()
	if config.tenantUID != "tenant-from-platform" {
		t.Fatalf("tenant uid fallback = %q", config.tenantUID)
	}
}

func TestPlatformRequestContextCarriesFrozenTenantUID(t *testing.T) {
	ctx := platformRequestContext(context.Background(), "tenant-a")
	values, ok := metadata.FromOutgoingContext(ctx)
	if !ok || len(values.Get("x-hc-user-id")) != 1 || values.Get("x-hc-user-id")[0] != "tenant-a" {
		t.Fatalf("platform request context metadata = %#v", values)
	}
}

func TestStaticHandlerServesAssetsAndSPAIndex(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<html>poc</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "asset.js"), []byte("console.log('poc')"), 0o644); err != nil {
		t.Fatal(err)
	}

	handler := staticHandler(root)
	for _, path := range []string{"/", "/asset.js", "/applications"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("%s returned %d", path, res.Code)
		}
		body, err := io.ReadAll(res.Result().Body)
		if err != nil {
			t.Fatal(err)
		}
		if path == "/asset.js" && !strings.Contains(string(body), "console.log") {
			t.Fatalf("asset body was not served: %q", body)
		}
		if path != "/asset.js" && !strings.Contains(string(body), "poc") {
			t.Fatalf("index body was not served for %s: %q", path, body)
		}
	}
}

func TestSourceProbeReturnsMetadataAndHashWithoutFileBody(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "fixture.txt"), []byte("secret fixture body"), 0o600); err != nil {
		t.Fatal(err)
	}
	config := pocConfig{
		tenantUID:      "tenant-a",
		sourceRoot:     root,
		sourceOwnerUID: "tenant-a",
		sourceDeployID: "source-a",
		multiInstance:  true,
		webRoot:        root,
	}
	handler := newHandler(config)

	sourceRequest := httptest.NewRequest(http.MethodGet, "/api/poc/source", nil)
	sourceRequest.Header.Set("X-HC-User-ID", "tenant-a")
	sourceResponse := httptest.NewRecorder()
	handler.ServeHTTP(sourceResponse, sourceRequest)
	if sourceResponse.Code != http.StatusOK || !strings.Contains(sourceResponse.Body.String(), "fixture.txt") {
		t.Fatalf("source metadata response: %d %s", sourceResponse.Code, sourceResponse.Body.String())
	}

	readRequest := httptest.NewRequest(http.MethodGet, "/api/poc/read?path=fixture.txt", nil)
	readRequest.Header.Set("X-HC-User-ID", "tenant-a")
	readResponse := httptest.NewRecorder()
	handler.ServeHTTP(readResponse, readRequest)
	if readResponse.Code != http.StatusOK {
		t.Fatalf("read response: %d %s", readResponse.Code, readResponse.Body.String())
	}
	if strings.Contains(readResponse.Body.String(), "secret fixture body") {
		t.Fatal("read endpoint returned the file body")
	}
	if !strings.Contains(readResponse.Body.String(), "sha256") {
		t.Fatal("read endpoint did not return a hash")
	}
}

func TestApplicationProbeFiltersOtherOwnersAndDetectsDatabases(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "config.json"), []byte(`{"ok":true}`), 0o600); err != nil {
		t.Fatal(err)
	}
	sqliteHeader := append([]byte("SQLite format 3\x00"), make([]byte, 32)...)
	if err := os.WriteFile(filepath.Join(root, "data.sqlite"), sqliteHeader, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "postgres"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "postgres", "PG_VERSION"), []byte("16"), 0o600); err != nil {
		t.Fatal(err)
	}
	catalogPath := filepath.Join(t.TempDir(), "applications.json")
	catalog := []pocApplication{
		{AppID: "cloud.lazycat.demo", Name: "Demo", DeployID: "deploy-a", OwnerUID: "tenant-a", MultiInstance: true, SourceRoot: root},
		{AppID: "cloud.lazycat.other", Name: "Other", DeployID: "deploy-b", OwnerUID: "tenant-b", MultiInstance: true, SourceRoot: root},
	}
	catalogData, err := json.Marshal(catalog)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(catalogPath, catalogData, 0o600); err != nil {
		t.Fatal(err)
	}
	config := pocConfig{tenantUID: "tenant-a", applicationsFile: catalogPath, webRoot: root}
	reports, err := allApplicationReports(config)
	if err != nil {
		t.Fatal(err)
	}
	if len(reports) != 1 || reports[0].DeployID != "deploy-a" {
		t.Fatalf("owner filtering returned %+v", reports)
	}
	if reports[0].Status != "UNSUPPORTED_DATABASE" || reports[0].SQLiteCount != 1 {
		t.Fatalf("database classification was %+v", reports[0])
	}
	if reports[0].DatabaseFindings == nil || reports[0].Entries == nil {
		t.Fatal("probe metadata arrays must be JSON arrays, not null")
	}
	if _, err := findApplication(config, "deploy-b"); err == nil {
		t.Fatal("other-owner deploy id was accepted")
	}
}

func TestManualSnapshotWritesPrivateDocumentAndReturnsNoBody(t *testing.T) {
	sourceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(sourceRoot, "fixture.txt"), []byte("private fixture body"), 0o600); err != nil {
		t.Fatal(err)
	}
	documentRoot := t.TempDir()
	config := pocConfig{
		tenantUID:      "tenant-a",
		sourceRoot:     sourceRoot,
		sourceOwnerUID: "tenant-a",
		sourceDeployID: "deploy-a",
		multiInstance:  true,
		documentRoot:   documentRoot,
		webRoot:        sourceRoot,
	}
	handler := newHandler(config)
	request := httptest.NewRequest(http.MethodPost, "/api/poc/snapshots", strings.NewReader(`{"deploy_id":"deploy-a"}`))
	request.Header.Set("X-HC-User-ID", "tenant-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("snapshot response: %d %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "private fixture body") {
		t.Fatal("snapshot response leaked source file body")
	}
	var result snapshotResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	archivePath := filepath.Join(documentRoot, filepath.FromSlash(result.ArchivePath))
	archiveFile, err := os.Open(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	defer archiveFile.Close()
	gzipReader, err := gzip.NewReader(archiveFile)
	if err != nil {
		t.Fatal(err)
	}
	tarReader := tar.NewReader(gzipReader)
	foundBody := false
	for {
		header, readErr := tarReader.Next()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			t.Fatal(readErr)
		}
		body, readErr := io.ReadAll(tarReader)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if header.Name == "appvar/fixture.txt" && string(body) == "private fixture body" {
			foundBody = true
		}
	}
	if !foundBody {
		t.Fatal("snapshot archive did not contain the source file")
	}
	if _, err := os.Stat(filepath.Join(documentRoot, filepath.FromSlash(result.ManifestPath))); err != nil {
		t.Fatalf("snapshot manifest missing: %v", err)
	}
}

func TestSnapshotRejectsUnknownFieldsAndOtherOwners(t *testing.T) {
	root := t.TempDir()
	config := pocConfig{tenantUID: "tenant-a", sourceRoot: root, sourceOwnerUID: "tenant-a", sourceDeployID: "deploy-a", multiInstance: true, documentRoot: t.TempDir(), webRoot: root}
	handler := newHandler(config)
	request := httptest.NewRequest(http.MethodPost, "/api/poc/snapshots", strings.NewReader(`{"deploy_id":"deploy-a","owner_uid":"tenant-b"}`))
	request.Header.Set("X-HC-User-ID", "tenant-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unknown snapshot field returned %d", response.Code)
	}

	request = httptest.NewRequest(http.MethodPost, "/api/poc/snapshots", strings.NewReader(`{"deploy_id":"deploy-b"}`))
	request.Header.Set("X-HC-User-ID", "tenant-a")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("other deploy id returned %d", response.Code)
	}
}
