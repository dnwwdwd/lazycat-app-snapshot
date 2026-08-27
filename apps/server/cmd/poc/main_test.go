package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
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
	if _, err := resolveApplicationSource(context.Background(), config, app); err == nil || !errors.Is(err, errPlatformResolverNoProjection) {
		t.Fatalf("platform resolver result = %v, want %s", err, platformResolverNoProjectionStatus)
	}
}

func TestSourceErrorCodeDistinguishesPlatformProjectionGap(t *testing.T) {
	if code := sourceErrorCode(errPlatformResolverNoProjection); code != platformResolverNoProjectionStatus {
		t.Fatalf("platform source error code = %q, want %q", code, platformResolverNoProjectionStatus)
	}
	if code := sourceErrorCode(errSourceContractUnsupported); code != "SOURCE_CONTRACT_UNSUPPORTED" {
		t.Fatalf("unsupported source error code = %q", code)
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

func TestDocumentedMountResolverMapsDeployAndRequiresReadOnlyProjection(t *testing.T) {
	projection := t.TempDir()
	target := filepath.Join(projection, "cloud.lazycat.demo", "deploy-a")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "marker.txt"), []byte("marker"), 0o444); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(target, 0o555); err != nil {
		t.Fatal(err)
	}
	resolver := documentedMountResolver{root: projection, layout: "appid/deploy-id", version: "mount-v7"}
	resolved, err := resolver.Resolve(context.Background(), sourceRequest{TenantUID: "tenant-a", AppID: "cloud.lazycat.demo", DeployID: "deploy-a", OwnerUID: "tenant-a"})
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Projection != "documented-mount" || resolved.AdapterVersion != "mount-v7" || !resolved.ReadOnly || !resolved.EnforceReadOnly || resolved.DeployID != "deploy-a" {
		t.Fatalf("mount metadata = %+v", resolved)
	}

	writable := filepath.Join(projection, "cloud.lazycat.demo", "deploy-writable")
	if err := os.MkdirAll(writable, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := resolver.Resolve(context.Background(), sourceRequest{TenantUID: "tenant-a", AppID: "cloud.lazycat.demo", DeployID: "deploy-writable", OwnerUID: "tenant-a"}); err == nil || !strings.Contains(err.Error(), "writable") {
		t.Fatalf("writable mount result = %v", err)
	}
	_ = os.Chmod(target, 0o755)
}

func TestDocumentedMountResolverRejectsOwnerAndTraversal(t *testing.T) {
	projection := t.TempDir()
	resolver := documentedMountResolver{root: projection, layout: "deploy-id"}
	for _, request := range []sourceRequest{
		{TenantUID: "tenant-a", AppID: "demo", DeployID: "deploy-a", OwnerUID: "tenant-b"},
		{TenantUID: "tenant-a", AppID: "demo", DeployID: "../outside", OwnerUID: "tenant-a"},
	} {
		if _, err := resolver.Resolve(context.Background(), request); err == nil {
			t.Fatalf("unsafe request was accepted: %+v", request)
		}
	}
}

func TestRuntimeAppvarResolverMapsAppIDAndMarksServiceReadOnly(t *testing.T) {
	projection := t.TempDir()
	target := filepath.Join(projection, "cloud.lazycat.demo")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "marker.txt"), []byte("runtime marker"), 0o600); err != nil {
		t.Fatal(err)
	}
	resolver := runtimeAppvarResolver{root: projection, layout: "appid", version: "lzcos-test-v1", allowNonstandard: true}
	resolved, err := resolver.Resolve(context.Background(), sourceRequest{TenantUID: "tenant-a", AppID: "cloud.lazycat.demo", DeployID: "deploy-a", OwnerUID: "tenant-a"})
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Root != target || resolved.Projection != "runtime-appvar" || resolved.AdapterVersion != "lzcos-test-v1" || !resolved.ReadOnly || resolved.ReadOnlyMode != "service-enforced" || resolved.EnforceReadOnly {
		t.Fatalf("runtime source metadata = %+v", resolved)
	}
	if _, err := resolver.Resolve(context.Background(), sourceRequest{TenantUID: "tenant-a", AppID: "cloud.lazycat.demo", DeployID: "deploy-a", OwnerUID: "tenant-b"}); err == nil {
		t.Fatal("runtime resolver accepted an owner mismatch")
	}
}

func TestRuntimeAppvarResolverPinsProductionRootAndRejectsTraversal(t *testing.T) {
	projection := t.TempDir()
	resolver := runtimeAppvarResolver{root: projection, layout: "appid"}
	if _, err := resolver.Resolve(context.Background(), sourceRequest{TenantUID: "tenant-a", AppID: "demo", DeployID: "deploy-a", OwnerUID: "tenant-a"}); err == nil || !strings.Contains(err.Error(), "runtime path") {
		t.Fatalf("non-runtime root result = %v", err)
	}
	resolver.allowNonstandard = true
	if _, err := resolver.Resolve(context.Background(), sourceRequest{TenantUID: "tenant-a", AppID: "../outside", DeployID: "deploy-a", OwnerUID: "tenant-a"}); err == nil {
		t.Fatal("runtime resolver accepted appid traversal")
	}
}

func TestRuntimeProjectionMissingUsesStableErrorCode(t *testing.T) {
	resolver := runtimeAppvarResolver{root: filepath.Join(t.TempDir(), "missing"), layout: "appid", allowNonstandard: true}
	_, err := resolver.Resolve(context.Background(), sourceRequest{TenantUID: "tenant-a", AppID: "demo", DeployID: "deploy-a", OwnerUID: "tenant-a"})
	if err == nil || !errors.Is(err, errRuntimeProjectionNotVisible) || sourceErrorCode(err) != "RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE" {
		t.Fatalf("missing runtime projection error = %v", err)
	}
}

func TestRuntimeAppvarProviderCompletesReadAndSnapshotFlow(t *testing.T) {
	projection := t.TempDir()
	target := filepath.Join(projection, "cloud.lazycat.demo")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "marker.txt"), []byte("runtime marker"), 0o600); err != nil {
		t.Fatal(err)
	}
	catalogPath := filepath.Join(t.TempDir(), "applications.json")
	catalogData, err := json.Marshal([]pocApplication{{AppID: "cloud.lazycat.demo", Name: "Runtime", DeployID: "deploy-runtime", OwnerUID: "tenant-a", MultiInstance: true}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(catalogPath, catalogData, 0o600); err != nil {
		t.Fatal(err)
	}
	config := pocConfig{tenantUID: "tenant-a", applicationsFile: catalogPath, sourceProjectionRoot: projection, sourceProjectionMode: "runtime-appvar", sourceProjectionLayout: "appid", sourceProjectionVersion: "lzcos-test-v1", allowNonstandardSourceRoot: true, documentRoot: t.TempDir(), webRoot: t.TempDir()}
	reports, err := allApplicationReports(config)
	if err != nil {
		t.Fatal(err)
	}
	if len(reports) != 1 || reports[0].Status != "BACKUPABLE" || reports[0].SourceProjection != "runtime-appvar" || reports[0].ReadOnlyMode != "service-enforced" {
		t.Fatalf("runtime report = %+v", reports)
	}
	handler := newHandler(config)
	request := httptest.NewRequest(http.MethodPost, "/api/poc/snapshots", strings.NewReader(`{"deploy_id":"deploy-runtime"}`))
	request.Header.Set("X-HC-User-ID", "tenant-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || !strings.Contains(response.Body.String(), "archiveSha256") {
		t.Fatalf("runtime snapshot response: %d %s", response.Code, response.Body.String())
	}
}

func TestDocumentedMountDiscoverRejectsAmbiguousDeployMapping(t *testing.T) {
	projection := t.TempDir()
	for _, parent := range []string{"one", "two"} {
		path := filepath.Join(projection, parent, "deploy-a")
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Chmod(path, 0o555); err != nil {
			t.Fatal(err)
		}
	}
	resolver := documentedMountResolver{root: projection, layout: "discover"}
	if _, err := resolver.Resolve(context.Background(), sourceRequest{TenantUID: "tenant-a", AppID: "demo", DeployID: "deploy-a", OwnerUID: "tenant-a"}); err == nil || !strings.Contains(err.Error(), "not unique") {
		t.Fatalf("ambiguous discover result = %v", err)
	}
}

func TestSDKSourceResolverReturnsStableUnsupportedContractError(t *testing.T) {
	_, err := (sdkSourceResolver{method: "FileHandler.TarDir", version: "sdk-v1"}).Resolve(context.Background(), sourceRequest{TenantUID: "tenant-a", AppID: "demo", DeployID: "deploy-a", OwnerUID: "tenant-a"})
	if err == nil || !errors.Is(err, errSourceContractUnsupported) || !strings.Contains(err.Error(), "FileHandler.TarDir") {
		t.Fatalf("sdk resolver error = %v", err)
	}
}

func TestDocumentedMountProviderCompletesReadAndSnapshotFlow(t *testing.T) {
	projection := t.TempDir()
	target := filepath.Join(projection, "cloud.lazycat.demo", "deploy-mounted")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "poc", "marker.txt"), []byte("mounted marker"), 0o444); err == nil {
		t.Fatal("expected missing parent directory to fail")
	}
	if err := os.MkdirAll(filepath.Join(target, "poc"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "poc", "marker.txt"), []byte("mounted marker"), 0o444); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Join(target, "poc"), 0o555); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(target, 0o555); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = os.Chmod(filepath.Join(target, "poc"), 0o755)
		_ = os.Chmod(target, 0o755)
	}()

	catalogPath := filepath.Join(t.TempDir(), "applications.json")
	catalogData, err := json.Marshal([]pocApplication{{AppID: "cloud.lazycat.demo", Name: "Mounted", DeployID: "deploy-mounted", OwnerUID: "tenant-a", MultiInstance: true}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(catalogPath, catalogData, 0o600); err != nil {
		t.Fatal(err)
	}
	config := pocConfig{tenantUID: "tenant-a", applicationsFile: catalogPath, sourceProjectionRoot: projection, sourceProjectionLayout: "appid/deploy-id", documentRoot: t.TempDir(), webRoot: t.TempDir()}
	handler := newHandler(config)
	request := httptest.NewRequest(http.MethodGet, "/api/poc/applications", nil)
	request.Header.Set("X-HC-User-ID", "tenant-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "BACKUPABLE") {
		t.Fatalf("mounted application response: %d %s", response.Code, response.Body.String())
	}

	request = httptest.NewRequest(http.MethodPost, "/api/poc/snapshots", strings.NewReader(`{"deploy_id":"deploy-mounted"}`))
	request.Header.Set("X-HC-User-ID", "tenant-a")
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || !strings.Contains(response.Body.String(), "archiveSha256") {
		t.Fatalf("mounted snapshot response: %d %s", response.Code, response.Body.String())
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

func TestIdentityReportsPublicLazycatDrivePermission(t *testing.T) {
	handler := newHandler(pocConfig{tenantUID: "tenant-a"})
	request := httptest.NewRequest(http.MethodGet, "/api/poc/identity", nil)
	request.Header.Set("X-HC-User-ID", "tenant-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("identity response: %d %s", response.Code, response.Body.String())
	}
	var payload struct {
		RequiredPermissions []string `json:"requiredPermissions"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.RequiredPermissions) != 2 || payload.RequiredPermissions[0] != "appvar.other.read" || payload.RequiredPermissions[1] != "document.write" {
		t.Fatalf("identity permissions = %#v", payload.RequiredPermissions)
	}
}

func TestUnconfiguredIdentityAndHealthRemainDiagnostic(t *testing.T) {
	handler := newHandler(pocConfig{webRoot: t.TempDir()})

	for _, path := range []string{"/api/health", "/api/poc/identity", "/api/poc/source-capability"} {
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

func TestSourceCapabilityDoesNotExposeConfiguredPaths(t *testing.T) {
	config := pocConfig{tenantUID: "tenant-a", sourceProjectionRoot: "/secret/runtime/appvar", sourceProjectionLayout: "deploy-id", sourceProjectionVersion: "contract-v1"}
	handler := newHandler(config)
	req := httptest.NewRequest(http.MethodGet, "/api/poc/source-capability", nil)
	req.Header.Set("X-HC-User-ID", "tenant-a")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("source capability returned %d: %s", res.Code, res.Body.String())
	}
	body := res.Body.String()
	if strings.Contains(body, "/secret/runtime/appvar") || !strings.Contains(body, "documented-mount") || !strings.Contains(body, "mountConfigured") {
		t.Fatalf("source capability leaked or omitted fields: %s", body)
	}
}

func TestSourceCapabilityReportsFixtureProviderWithoutPath(t *testing.T) {
	root := t.TempDir()
	catalogPath := filepath.Join(t.TempDir(), "applications.json")
	data, err := json.Marshal([]pocApplication{{AppID: "demo", DeployID: "deploy-a", OwnerUID: "tenant-a", SourceRoot: root}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(catalogPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	capability := (pocConfig{tenantUID: "tenant-a", applicationsFile: catalogPath}).sourceCapability()
	if capability.ProviderKind != "fixture" || capability.ProviderStatus != "FIXTURE_READY" || capability.BlockingReason != "FIXTURE_ONLY" {
		t.Fatalf("fixture capability = %+v", capability)
	}
}

func TestSourceCapabilityReportsRuntimeProviderWithoutPath(t *testing.T) {
	root := t.TempDir()
	capability := (pocConfig{tenantUID: "tenant-a", sourceProjectionRoot: root, sourceProjectionMode: "runtime-appvar", sourceProjectionLayout: "appid", allowNonstandardSourceRoot: true}).sourceCapability()
	if capability.ProviderKind != "runtime-appvar" || capability.ProviderStatus != "READY" || capability.ReadOnlyMode != "service-enforced" || !capability.MountConfigured {
		t.Fatalf("runtime capability = %+v", capability)
	}
	if strings.Contains(capability.BlockingReason, root) {
		t.Fatalf("runtime capability leaked configured path: %+v", capability)
	}
}

func TestSourceCapabilityReportsPlatformProjectionGapWhenCatalogIsReady(t *testing.T) {
	catalogPath := filepath.Join(t.TempDir(), "applications.json")
	data, err := json.Marshal([]pocApplication{{AppID: "demo", DeployID: "deploy-a", OwnerUID: "tenant-a"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(catalogPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	capability := (pocConfig{tenantUID: "tenant-a", applicationsFile: catalogPath}).sourceCapability()
	if !capability.CatalogReady || capability.ProviderKind != "platform" || capability.ProviderStatus != platformResolverNoProjectionStatus || capability.BlockingReason != platformResolverNoProjectionStatus {
		t.Fatalf("platform capability = %+v", capability)
	}
	if capability.MountConfigured || capability.IsolationVerified {
		t.Fatalf("platform capability exposed unverified source state = %+v", capability)
	}
}

func TestApplicationDetailAndSourceUsePlatformProjectionErrorCode(t *testing.T) {
	catalogPath := filepath.Join(t.TempDir(), "applications.json")
	data, err := json.Marshal([]pocApplication{{AppID: "demo", Name: "Demo", DeployID: "deploy-a", OwnerUID: "tenant-a"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(catalogPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	handler := newHandler(pocConfig{tenantUID: "tenant-a", applicationsFile: catalogPath, webRoot: t.TempDir()})

	detailRequest := httptest.NewRequest(http.MethodGet, "/api/poc/applications/deploy-a", nil)
	detailRequest.Header.Set("X-HC-User-ID", "tenant-a")
	detailResponse := httptest.NewRecorder()
	handler.ServeHTTP(detailResponse, detailRequest)
	if detailResponse.Code != http.StatusOK || !strings.Contains(detailResponse.Body.String(), platformResolverNoProjectionStatus) {
		t.Fatalf("application detail response: %d %s", detailResponse.Code, detailResponse.Body.String())
	}

	sourceRequest := httptest.NewRequest(http.MethodGet, "/api/poc/source?deploy_id=deploy-a", nil)
	sourceRequest.Header.Set("X-HC-User-ID", "tenant-a")
	sourceResponse := httptest.NewRecorder()
	handler.ServeHTTP(sourceResponse, sourceRequest)
	if sourceResponse.Code != http.StatusPreconditionFailed || !strings.Contains(sourceResponse.Body.String(), `"code":"`+platformResolverNoProjectionStatus+`"`) {
		t.Fatalf("source response: %d %s", sourceResponse.Code, sourceResponse.Body.String())
	}
}

func TestConfigUsesPlatformUIDWithoutDeployID(t *testing.T) {
	t.Setenv("BACKUP_APP_DEPLOY_UID", "")
	t.Setenv("LAZYCAT_APP_DEPLOY_UID", "tenant-from-platform")
	t.Setenv("LAZYCAT_APP_DEPLOY_ID", "")
	t.Setenv("BACKUP_DOCUMENT_ROOT", "")
	t.Setenv("BACKUP_POC_APPVAR_MODE", "runtime-appvar")
	t.Setenv("BACKUP_POC_APPVAR_ROOT", "")
	config := configFromEnv()
	if config.tenantUID != "tenant-from-platform" {
		t.Fatalf("tenant uid fallback = %q", config.tenantUID)
	}
	if config.documentRoot != defaultDocumentRoot {
		t.Fatalf("document root default = %q, want %q", config.documentRoot, defaultDocumentRoot)
	}
	if config.sourceProjectionRoot != defaultRuntimeAppvarRoot || config.sourceProjectionMode != "runtime-appvar" {
		t.Fatalf("runtime projection defaults = root %q mode %q", config.sourceProjectionRoot, config.sourceProjectionMode)
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
	if !strings.Contains(readResponse.Body.String(), "hashScope") || !strings.Contains(readResponse.Body.String(), "complete") {
		t.Fatalf("read endpoint omitted hash metadata: %s", readResponse.Body.String())
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

func TestManualSnapshotWritesLazycatDriveDocumentAndReturnsNoBody(t *testing.T) {
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
	if !strings.HasPrefix(result.ArchivePath, defaultDocFolder+"/poc/") {
		t.Fatalf("snapshot archive escaped LazycatAppBackup root: %q", result.ArchivePath)
	}
}

func TestValidateDocumentRootRejectsMissingLazycatDriveMount(t *testing.T) {
	root := filepath.Join(t.TempDir(), "missing-drive")
	if err := validateDocumentRoot(root); err == nil {
		t.Fatal("missing Lazycat Drive root was accepted")
	} else if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing Lazycat Drive error = %v", err)
	}
	if _, err := os.Stat(root); !os.IsNotExist(err) {
		t.Fatalf("validation created missing root: stat error = %v", err)
	}
}

func TestSnapshotDoesNotCreateMissingDocumentRoot(t *testing.T) {
	sourceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(sourceRoot, "fixture.txt"), []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	documentRoot := filepath.Join(t.TempDir(), "missing-drive")
	config := pocConfig{
		tenantUID:      "tenant-a",
		sourceRoot:     sourceRoot,
		sourceOwnerUID: "tenant-a",
		sourceDeployID: "deploy-a",
		multiInstance:  true,
		documentRoot:   documentRoot,
		webRoot:        sourceRoot,
	}
	app, ok := fallbackApplication(config)
	if !ok {
		t.Fatal("fixture application was not configured")
	}
	report := reportForApplication(config, app)
	if report.Status != "BACKUPABLE" {
		t.Fatalf("fixture report status = %q, want BACKUPABLE", report.Status)
	}
	if _, err := writeSnapshot(config, app, report); err == nil {
		t.Fatal("snapshot accepted a missing Lazycat Drive root")
	} else if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing document root error = %v", err)
	}
	if _, err := os.Stat(documentRoot); !os.IsNotExist(err) {
		t.Fatalf("snapshot created missing document root: stat error = %v", err)
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
