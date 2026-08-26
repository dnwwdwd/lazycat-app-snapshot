// Package main is a deliberately small, tenant-isolated backup POC. It lets a
// user select an application, inspect its appvar metadata/database signatures,
// and create one read-only source snapshot in the user's private documents.
// It is not the V1 scheduler or recovery engine.
package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	gohelper "gitee.com/linakesi/lzc-sdk/lang/go"
	"gitee.com/linakesi/lzc-sdk/lang/go/sys"
)

const (
	maxProbeBytes    = 64 * 1024
	maxScanEntries   = 10000
	defaultWebRoot   = "/lzcapp/pkg/content/web"
	defaultDocFolder = "LazycatAppBackup"
	statfsReadOnly   = 1
)

type pocConfig struct {
	tenantUID      string
	backupAppID    string
	sourceRoot     string
	sourceOwnerUID string
	sourceDeployID string
	sourceAppID    string
	sourceAppName  string
	sourceVersion  string
	sourceMulti    bool
	// multiInstance is retained for the original unit-test/config contract.
	multiInstance    bool
	applicationsFile string
	documentRoot     string
	webRoot          string
	resolver         sourceResolver
}

// pocApplication is loaded by a trusted platform adapter or a test fixture.
// SourceRoot never crosses the HTTP boundary.
type pocApplication struct {
	AppID         string `json:"appid"`
	Name          string `json:"name"`
	Version       string `json:"version"`
	DeployID      string `json:"deploy_id"`
	OwnerUID      string `json:"owner_uid"`
	MultiInstance bool   `json:"multi_instance"`
	SourceRoot    string `json:"source_root"`
}

type sourceEntry struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Size int64  `json:"size"`
}

type databaseFinding struct {
	Type      string `json:"type"`
	Path      string `json:"path"`
	Supported bool   `json:"supported"`
	Reason    string `json:"reason,omitempty"`
}

type applicationReport struct {
	AppID            string            `json:"appid"`
	Name             string            `json:"name"`
	Version          string            `json:"version,omitempty"`
	DeployID         string            `json:"deployID"`
	OwnerUID         string            `json:"ownerUID"`
	MultiInstance    bool              `json:"multiInstance"`
	ReadOnly         bool              `json:"readOnly"`
	Status           string            `json:"status"`
	EntryCount       int               `json:"entryCount"`
	FileCount        int               `json:"fileCount"`
	TotalBytes       int64             `json:"totalBytes"`
	SkippedCount     int               `json:"skippedCount"`
	SQLiteCount      int               `json:"sqliteCount"`
	DatabaseFindings []databaseFinding `json:"databaseFindings"`
	Entries          []sourceEntry     `json:"entries"`
	SourceWarning    string            `json:"sourceWarning,omitempty"`
	SourceError      string            `json:"sourceError,omitempty"`
	SourceProjection string            `json:"sourceProjection,omitempty"`
	SourceAdapter    string            `json:"sourceAdapterVersion,omitempty"`
	SourceDevice     uint64            `json:"sourceDevice,omitempty"`
	SourceInode      uint64            `json:"sourceInode,omitempty"`
	SourceVerifiedAt string            `json:"sourceVerifiedAt,omitempty"`
}

type snapshotResult struct {
	SnapshotID    string `json:"snapshotID"`
	AppID         string `json:"appid"`
	Name          string `json:"name"`
	DeployID      string `json:"deployID"`
	CreatedAt     string `json:"createdAt"`
	ArchivePath   string `json:"archivePath"`
	ManifestPath  string `json:"manifestPath"`
	ArchiveBytes  int64  `json:"archiveBytes"`
	ArchiveSHA256 string `json:"archiveSha256"`
	FileCount     int    `json:"fileCount"`
	DatabaseCount int    `json:"databaseCount"`
	Consistency   string `json:"consistency"`
}

type applicationCatalog struct {
	Applications []pocApplication `json:"applications"`
}

type snapshotRequest struct {
	DeployID string `json:"deploy_id"`
}

func configFromEnv() pocConfig {
	webRoot := os.Getenv("BACKUP_WEB_ROOT")
	if webRoot == "" {
		webRoot = defaultWebRoot
	}
	tenantUID := os.Getenv("BACKUP_APP_DEPLOY_UID")
	if tenantUID == "" {
		// Keep the package usable when the manifest expansion is unavailable in
		// a local runner. The deploy ID is deliberately not used for identity.
		tenantUID = os.Getenv("LAZYCAT_APP_DEPLOY_UID")
	}
	documentRoot := os.Getenv("BACKUP_DOCUMENT_ROOT")
	if documentRoot == "" && tenantUID != "" {
		documentRoot = filepath.Join("/lzcapp/documents", tenantUID)
	}
	return pocConfig{
		tenantUID:        tenantUID,
		backupAppID:      os.Getenv("LAZYCAT_APP_ID"),
		sourceRoot:       os.Getenv("BACKUP_POC_SOURCE_ROOT"),
		sourceOwnerUID:   os.Getenv("BACKUP_POC_SOURCE_OWNER_UID"),
		sourceDeployID:   os.Getenv("BACKUP_POC_SOURCE_DEPLOY_ID"),
		sourceAppID:      os.Getenv("BACKUP_POC_SOURCE_APP_ID"),
		sourceAppName:    os.Getenv("BACKUP_POC_SOURCE_APP_NAME"),
		sourceVersion:    os.Getenv("BACKUP_POC_SOURCE_VERSION"),
		sourceMulti:      os.Getenv("BACKUP_POC_SOURCE_MULTI_INSTANCE") == "true",
		multiInstance:    os.Getenv("BACKUP_POC_SOURCE_MULTI_INSTANCE") == "true",
		applicationsFile: os.Getenv("BACKUP_POC_APPLICATIONS_FILE"),
		documentRoot:     documentRoot,
		webRoot:          webRoot,
	}
}

func (c pocConfig) ready() bool { return c.tenantUID != "" }

func (c pocConfig) sourceConfigured() bool {
	if c.resolver != nil {
		return true
	}
	if c.applicationsFile != "" {
		return true
	}
	if _, ok := fallbackApplication(c); ok {
		return true
	}
	return false
}

func (c pocConfig) catalogConfigured() bool {
	if c.applicationsFile != "" {
		return true
	}
	if _, ok := fallbackApplication(c); ok {
		return true
	}
	return platformCatalogConfigured()
}

// platformCatalogConfigured only checks whether the runtime API entry point is
// present. It does not claim that an appvar source projection is available.
// The latter is validated per application after QueryApplication returns.
func platformCatalogConfigured() bool {
	if strings.TrimSpace(os.Getenv("LZCAPP_API_GATEWAY_ADDRESS")) != "" {
		return true
	}
	_, err := os.Stat(gohelper.RuntimeSocketPath)
	return err == nil
}

func platformRequestContext(ctx context.Context, tenantUID string) context.Context {
	return gohelper.WithRealUID(ctx, tenantUID)
}

func fallbackApplication(c pocConfig) (pocApplication, bool) {
	if c.sourceRoot == "" || c.sourceDeployID == "" || c.sourceOwnerUID == "" {
		return pocApplication{}, false
	}
	name := c.sourceAppName
	if name == "" {
		name = "POC source fixture"
	}
	appid := c.sourceAppID
	if appid == "" {
		appid = "cloud.lazycat.app.backup.fixture"
	}
	return pocApplication{
		AppID:         appid,
		Name:          name,
		Version:       c.sourceVersion,
		DeployID:      c.sourceDeployID,
		OwnerUID:      c.sourceOwnerUID,
		MultiInstance: c.sourceMulti || c.multiInstance,
		SourceRoot:    c.sourceRoot,
	}, true
}

func loadApplications(c pocConfig) ([]pocApplication, error) {
	if c.applicationsFile != "" {
		data, err := os.ReadFile(c.applicationsFile)
		if err != nil {
			return nil, fmt.Errorf("read application catalog: %w", err)
		}
		var catalog applicationCatalog
		if err := json.Unmarshal(data, &catalog); err != nil {
			var apps []pocApplication
			if arrayErr := json.Unmarshal(data, &apps); arrayErr != nil {
				return nil, fmt.Errorf("parse application catalog: %w", err)
			}
			catalog.Applications = apps
		}
		return catalog.Applications, nil
	}
	if app, ok := fallbackApplication(c); ok {
		return []pocApplication{app}, nil
	}
	if !platformCatalogConfigured() {
		return nil, errors.New("platform application resolver is not configured")
	}
	return loadPlatformApplications(c.tenantUID, c.backupAppID)
}

// loadPlatformApplications calls the platform package manager in the current
// app container. The SDK derives the caller identity from the app certificate
// and API gateway context; this POC deliberately leaves OtherUid unset and
// asks the platform to enforce current-owner filtering.
func loadPlatformApplications(tenantUID, backupAppID string) ([]pocApplication, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	// The runtime API gateway does not infer a user from the app deploy UID.
	// Carry the frozen server-side tenant UID as the SDK's real-UID metadata;
	// never take this value from the browser or from QueryApplication.other_uid.
	requestCtx := platformRequestContext(ctx, tenantUID)
	gateway, err := gohelper.NewAPIGateway(requestCtx)
	if err != nil {
		return nil, fmt.Errorf("connect to platform api gateway: %w", err)
	}
	defer gateway.Close()
	owned := true
	ignorePending := true
	response, err := gateway.PkgManager.QueryApplication(requestCtx, &sys.QueryApplicationRequest{
		DeployIds:        []string{},
		OnlyOwner:        &owned,
		IgnorePendingPkg: &ignorePending,
	})
	if err != nil {
		return nil, fmt.Errorf("query current-user applications: %w", err)
	}
	applications := make([]pocApplication, 0, len(response.GetInfoList()))
	for _, info := range response.GetInfoList() {
		if info == nil || info.GetDeployId() == "" {
			continue
		}
		// Keep a second server-side owner check even though only_owner=true is
		// part of the platform request. A catalog response must never cross
		// the frozen tenant boundary if the platform returns an unexpected row.
		if tenantUID == "" || info.GetOwner() != tenantUID {
			continue
		}
		if backupAppID != "" && info.GetAppid() == backupAppID {
			continue
		}
		applications = append(applications, pocApplication{
			AppID:         info.GetAppid(),
			Name:          info.GetTitle(),
			Version:       info.GetVersion(),
			DeployID:      info.GetDeployId(),
			OwnerUID:      info.GetOwner(),
			MultiInstance: info.GetMultiInstance(),
			// QueryApplication exposes identity and instance metadata only.
			// SourceRoot is intentionally left empty until the platform's
			// appvar.other.read projection is verified and mapped.
		})
	}
	return applications, nil
}

func validateSourceRoot(config pocConfig, app pocApplication) (string, error) {
	resolved, err := resolveApplicationSource(context.Background(), config, app)
	if err != nil {
		return "", err
	}
	return resolved.Root, nil
}

// validateSource is retained for the original single-fixture API and tests.
func (c pocConfig) validateSource() (string, error) {
	app, ok := fallbackApplication(c)
	if !ok {
		return "", errors.New("platform source resolver is not configured")
	}
	return validateSourceRoot(c, app)
}

func relativeFile(root, requested string) (string, error) {
	if requested == "" || filepath.IsAbs(requested) {
		return "", errors.New("a relative file path is required")
	}
	clean := filepath.Clean(requested)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", errors.New("path escapes source root")
	}
	path := filepath.Join(root, clean)
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, resolved)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New("symlink escapes source root")
	}
	return resolved, nil
}

func sourceReadOnly(root string) bool {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(root, &stat); err != nil {
		return false
	}
	return stat.Flags&statfsReadOnly != 0
}

func safeSegment(value string) (string, error) {
	if value == "" || value == "." || value == ".." || strings.ContainsAny(value, `/\\`) {
		return "", errors.New("unsafe application identifier")
	}
	return value, nil
}

func databaseForFile(path string, info fs.FileInfo) (databaseFinding, bool) {
	rel := filepath.ToSlash(path)
	base := strings.ToLower(filepath.Base(path))
	if info.Mode().IsRegular() {
		file, err := os.Open(path)
		if err == nil {
			defer file.Close()
			var header [16]byte
			if n, readErr := io.ReadFull(file, header[:]); readErr == nil && n >= 16 && string(header[:16]) == "SQLite format 3\x00" {
				return databaseFinding{Type: "sqlite", Path: rel, Supported: true, Reason: "SQLite format 3 header"}, true
			}
		}
	}
	if base == "pg_version" || base == "ibdata1" || base == "wiredtiger" || base == "dump.rdb" || base == "appendonly.aof" || base == "appendonlydir" {
		typ := "unknown"
		switch base {
		case "pg_version":
			typ = "postgresql"
		case "ibdata1":
			typ = "mysql"
		case "wiredtiger":
			typ = "mongodb"
		case "dump.rdb", "appendonly.aof", "appendonlydir":
			typ = "redis"
		}
		return databaseFinding{Type: typ, Path: rel, Supported: false, Reason: "service database signature"}, true
	}
	if strings.HasSuffix(base, ".wt") || strings.HasPrefix(base, "collection-") {
		return databaseFinding{Type: "mongodb", Path: rel, Supported: false, Reason: "MongoDB WiredTiger signature"}, true
	}
	if base == "base" || base == "global" || base == "pg_wal" || base == "mysql" || base == "performance_schema" {
		typ := "postgresql"
		if base == "mysql" || base == "performance_schema" {
			typ = "mysql"
		}
		return databaseFinding{Type: typ, Path: rel, Supported: false, Reason: "service database directory"}, true
	}
	if strings.HasSuffix(base, ".sqlite") || strings.HasSuffix(base, ".sqlite3") || strings.HasSuffix(base, ".db") {
		return databaseFinding{Type: "unknown", Path: rel, Supported: false, Reason: "database-like file without a valid SQLite header"}, true
	}
	return databaseFinding{}, false
}

type scanResult struct {
	entries          []sourceEntry
	databaseFindings []databaseFinding
	fileCount        int
	totalBytes       int64
	skippedCount     int
}

func scanSource(root string) (scanResult, error) {
	result := scanResult{
		entries:          make([]sourceEntry, 0),
		databaseFindings: make([]databaseFinding, 0),
	}
	seen := 0
	err := filepath.WalkDir(root, func(current string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if current == root {
			return nil
		}
		seen++
		if seen > maxScanEntries {
			return errors.New("source contains too many entries")
		}
		rel, err := filepath.Rel(root, current)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if d.Type()&os.ModeSymlink != 0 {
			result.entries = append(result.entries, sourceEntry{Name: rel, Type: "symlink"})
			result.skippedCount++
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if d.IsDir() {
			result.entries = append(result.entries, sourceEntry{Name: rel, Type: "directory"})
			if finding, ok := databaseForFile(current, info); ok {
				result.databaseFindings = append(result.databaseFindings, finding)
			}
			return nil
		}
		if !info.Mode().IsRegular() {
			result.entries = append(result.entries, sourceEntry{Name: rel, Type: "special", Size: info.Size()})
			result.skippedCount++
			return nil
		}
		result.entries = append(result.entries, sourceEntry{Name: rel, Type: "file", Size: info.Size()})
		result.fileCount++
		result.totalBytes += info.Size()
		if finding, ok := databaseForFile(current, info); ok {
			result.databaseFindings = append(result.databaseFindings, finding)
		}
		return nil
	})
	if err != nil {
		return scanResult{}, err
	}
	sort.Slice(result.entries, func(i, j int) bool { return result.entries[i].Name < result.entries[j].Name })
	sort.Slice(result.databaseFindings, func(i, j int) bool { return result.databaseFindings[i].Path < result.databaseFindings[j].Path })
	return result, nil
}

func reportForApplication(config pocConfig, app pocApplication) applicationReport {
	report := applicationReport{
		AppID:            app.AppID,
		Name:             app.Name,
		Version:          app.Version,
		DeployID:         app.DeployID,
		OwnerUID:         app.OwnerUID,
		MultiInstance:    app.MultiInstance,
		DatabaseFindings: []databaseFinding{},
		Entries:          []sourceEntry{},
	}
	if !app.MultiInstance {
		// The V1 product still treats a shared appvar as a safety decision that
		// needs separate confirmation. The POC intentionally keeps the read and
		// one-shot snapshot loop usable so the platform capability can be
		// observed on a real application instead of stopping before a probe.
		report.SourceWarning = "目标应用是单实例，共享 appvar 可能包含多个用户数据；本轮 POC 仍允许只读探测和手动快照"
	}
	resolved, err := resolveApplicationSource(context.Background(), config, app)
	if err != nil {
		report.Status = "SOURCE_NOT_READY"
		report.SourceError = err.Error()
		return report
	}
	report.SourceProjection = resolved.Projection
	report.SourceAdapter = resolved.AdapterVersion
	report.SourceDevice = resolved.Device
	report.SourceInode = resolved.Inode
	report.SourceVerifiedAt = resolved.VerifiedAt.Format(time.RFC3339Nano)
	report.ReadOnly = resolved.ReadOnly
	scan, err := scanSource(resolved.Root)
	if err != nil {
		report.Status = "PERMISSION_DENIED"
		report.SourceError = err.Error()
		return report
	}
	report.Entries = scan.entries
	report.EntryCount = len(scan.entries)
	report.FileCount = scan.fileCount
	report.TotalBytes = scan.totalBytes
	report.SkippedCount = scan.skippedCount
	report.DatabaseFindings = scan.databaseFindings
	for _, finding := range scan.databaseFindings {
		if finding.Type == "sqlite" {
			report.SQLiteCount++
		}
	}
	report.Status = "BACKUPABLE"
	for _, finding := range scan.databaseFindings {
		if !finding.Supported {
			report.Status = "UNSUPPORTED_DATABASE"
			break
		}
	}
	if report.FileCount == 0 {
		report.Status = "NO_DATA"
	}
	return report
}

func findApplication(config pocConfig, deployID string) (pocApplication, error) {
	if deployID == "" {
		return pocApplication{}, errors.New("deploy_id is required")
	}
	apps, err := loadApplications(config)
	if err != nil {
		return pocApplication{}, err
	}
	for _, app := range apps {
		if app.DeployID == deployID && app.OwnerUID == config.tenantUID && (config.backupAppID == "" || app.AppID != config.backupAppID) {
			return app, nil
		}
	}
	return pocApplication{}, errors.New("application is not owned by this tenant or does not exist")
}

func allApplicationReports(config pocConfig) ([]applicationReport, error) {
	apps, err := loadApplications(config)
	if err != nil {
		return nil, err
	}
	reports := make([]applicationReport, 0, len(apps))
	for _, app := range apps {
		// Owner mismatch is deliberately omitted, never returned as a searchable
		// cross-user record.
		if app.OwnerUID != config.tenantUID || (config.backupAppID != "" && app.AppID == config.backupAppID) {
			continue
		}
		reports = append(reports, reportForApplication(config, app))
	}
	sort.Slice(reports, func(i, j int) bool { return reports[i].Name < reports[j].Name })
	return reports, nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func errorJSON(w http.ResponseWriter, status int, code string, err error) {
	writeJSON(w, status, map[string]string{"code": code, "message": err.Error()})
}

func methodNotAllowed(w http.ResponseWriter) { w.WriteHeader(http.StatusMethodNotAllowed) }

func tenantMiddleware(config pocConfig, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}
		if !config.ready() {
			if r.URL.Path == "/api/poc/identity" || !strings.HasPrefix(r.URL.Path, "/api/") {
				next.ServeHTTP(w, r)
				return
			}
			errorJSON(w, http.StatusForbidden, "TENANT_IDENTITY_MISSING", errors.New("backup instance identity is not configured"))
			return
		}
		if r.Header.Get("X-HC-User-ID") != config.tenantUID {
			errorJSON(w, http.StatusForbidden, "TENANT_IDENTITY_MISMATCH", errors.New("request identity does not match this backup instance"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func staticHandler(root string) http.Handler {
	fileServer := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			methodNotAllowed(w)
			return
		}
		path := strings.TrimPrefix(filepath.Clean("/"+r.URL.Path), "/")
		if path != "" {
			candidate := filepath.Join(root, path)
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}

func readOnlySourceForRequest(config pocConfig, r *http.Request) (pocApplication, string, error) {
	deployID := r.URL.Query().Get("deploy_id")
	var app pocApplication
	var err error
	if deployID == "" {
		var ok bool
		app, ok = fallbackApplication(config)
		if !ok {
			apps, loadErr := loadApplications(config)
			if loadErr != nil || len(apps) == 0 {
				if loadErr != nil {
					return pocApplication{}, "", loadErr
				}
				return pocApplication{}, "", errors.New("no tenant-owned application is configured")
			}
			for _, candidate := range apps {
				if candidate.OwnerUID == config.tenantUID {
					app = candidate
					break
				}
			}
			if app.DeployID == "" {
				return pocApplication{}, "", errors.New("no tenant-owned application is configured")
			}
		} else if app.OwnerUID != config.tenantUID {
			return pocApplication{}, "", errors.New("application is not owned by this tenant")
		}
	} else {
		app, err = findApplication(config, deployID)
		if err != nil {
			return pocApplication{}, "", err
		}
	}
	root, err := validateSourceRoot(config, app)
	if err != nil {
		return pocApplication{}, "", err
	}
	return app, root, nil
}

func snapshotID(now time.Time) string {
	return fmt.Sprintf("snap-%s", now.UTC().Format("20060102T150405.000000000Z"))
}

func hashFile(path string) (string, int64, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()
	hash := sha256.New()
	bytesRead, err := io.Copy(hash, file)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(hash.Sum(nil)), bytesRead, nil
}

func writeSnapshot(config pocConfig, app pocApplication, report applicationReport) (snapshotResult, error) {
	if report.Status != "BACKUPABLE" {
		return snapshotResult{}, fmt.Errorf("application status %s does not allow a snapshot", report.Status)
	}
	if config.documentRoot == "" {
		return snapshotResult{}, errors.New("private document root is not configured")
	}
	appid, err := safeSegment(app.AppID)
	if err != nil {
		return snapshotResult{}, err
	}
	deployID, err := safeSegment(app.DeployID)
	if err != nil {
		return snapshotResult{}, err
	}
	root, err := validateSourceRoot(config, app)
	if err != nil {
		return snapshotResult{}, err
	}
	now := time.Now().UTC()
	id := snapshotID(now)
	relDir := filepath.Join(defaultDocFolder, "poc", now.Format("20060102T150405Z"), appid, deployID)
	destination := filepath.Join(config.documentRoot, relDir)
	partial := destination + ".partial"
	if err := os.RemoveAll(partial); err != nil {
		return snapshotResult{}, err
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return snapshotResult{}, err
	}
	if err := os.Mkdir(destination, 0o700); err != nil {
		return snapshotResult{}, err
	}
	if err := os.Mkdir(partial, 0o700); err != nil {
		return snapshotResult{}, err
	}
	archivePartial := filepath.Join(partial, "snapshot.tar.gz")
	archiveFile, err := os.OpenFile(archivePartial, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		_ = os.RemoveAll(partial)
		return snapshotResult{}, err
	}
	gzipWriter := gzip.NewWriter(archiveFile)
	tarWriter := tar.NewWriter(gzipWriter)
	closeArchive := func() error {
		if err := tarWriter.Close(); err != nil {
			_ = archiveFile.Close()
			return err
		}
		if err := gzipWriter.Close(); err != nil {
			_ = archiveFile.Close()
			return err
		}
		return archiveFile.Close()
	}
	if err := filepath.WalkDir(root, func(current string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if current == root || d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		rel, err := filepath.Rel(root, current)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() && !d.IsDir() {
			return nil
		}
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(filepath.Join("appvar", rel))
		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		file, err := os.Open(current)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(tarWriter, file)
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}); err != nil {
		_ = closeArchive()
		_ = os.RemoveAll(partial)
		return snapshotResult{}, err
	}
	if err := closeArchive(); err != nil {
		_ = os.RemoveAll(partial)
		return snapshotResult{}, err
	}
	archivePath := filepath.Join(destination, "snapshot.tar.gz")
	manifestPath := filepath.Join(destination, "manifest.json")
	if err := os.Rename(archivePartial, archivePath); err != nil {
		_ = os.RemoveAll(partial)
		return snapshotResult{}, err
	}
	archiveSHA, archiveBytes, err := hashFile(archivePath)
	if err != nil {
		_ = os.RemoveAll(partial)
		return snapshotResult{}, err
	}
	result := snapshotResult{
		SnapshotID:    id,
		AppID:         app.AppID,
		Name:          app.Name,
		DeployID:      app.DeployID,
		CreatedAt:     now.Format(time.RFC3339),
		ArchivePath:   filepath.ToSlash(filepath.Join(relDir, "snapshot.tar.gz")),
		ManifestPath:  filepath.ToSlash(filepath.Join(relDir, "manifest.json")),
		ArchiveBytes:  archiveBytes,
		ArchiveSHA256: archiveSHA,
		FileCount:     report.FileCount,
		DatabaseCount: len(report.DatabaseFindings),
		Consistency:   "raw-read-poc",
	}
	manifest := map[string]any{
		"snapshot": result,
		"source": map[string]any{
			"appid": app.AppID, "name": app.Name, "deploy_id": app.DeployID,
			"owner_uid": app.OwnerUID, "read_only": report.ReadOnly,
		},
		"entries":           report.Entries,
		"database_findings": report.DatabaseFindings,
	}
	manifestData, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		_ = os.RemoveAll(partial)
		return snapshotResult{}, err
	}
	manifestPartial := filepath.Join(partial, "manifest.json")
	if err := os.WriteFile(manifestPartial, append(manifestData, '\n'), 0o600); err != nil {
		_ = os.RemoveAll(partial)
		return snapshotResult{}, err
	}
	if err := os.Rename(manifestPartial, manifestPath); err != nil {
		_ = os.RemoveAll(partial)
		return snapshotResult{}, err
	}
	if err := os.Remove(partial); err != nil {
		return snapshotResult{}, err
	}
	return result, nil
}

func newHandler(config pocConfig) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "identityConfigured": config.ready(), "sourceConfigured": config.sourceConfigured()})
	})
	mux.HandleFunc("/api/poc/identity", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"tenantUID": config.tenantUID, "identityConfigured": config.ready(), "sourceConfigured": config.sourceConfigured(),
			"catalogConfigured": config.catalogConfigured(), "requiredPermission": "appvar.other.read",
		})
	})
	mux.HandleFunc("/api/poc/applications", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		reports, err := allApplicationReports(config)
		if err != nil {
			errorJSON(w, http.StatusPreconditionFailed, "APPLICATION_CATALOG_NOT_READY", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"tenantUID": config.tenantUID, "applications": reports, "count": len(reports)})
	})
	mux.HandleFunc("/api/poc/applications/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		deployID, err := url.PathUnescape(strings.TrimPrefix(r.URL.Path, "/api/poc/applications/"))
		if err != nil || deployID == "" || strings.ContainsAny(deployID, `/\\`) {
			errorJSON(w, http.StatusBadRequest, "INVALID_DEPLOY_ID", errors.New("invalid deploy id"))
			return
		}
		app, err := findApplication(config, deployID)
		if err != nil {
			errorJSON(w, http.StatusNotFound, "APPLICATION_NOT_FOUND", err)
			return
		}
		writeJSON(w, http.StatusOK, reportForApplication(config, app))
	})
	mux.HandleFunc("/api/poc/source", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		app, root, err := readOnlySourceForRequest(config, r)
		if err != nil {
			errorJSON(w, http.StatusPreconditionFailed, "SOURCE_NOT_READY", err)
			return
		}
		scan, err := scanSource(root)
		if err != nil {
			errorJSON(w, http.StatusForbidden, "SOURCE_LIST_DENIED", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"sourceDeployID": app.DeployID, "appid": app.AppID, "name": app.Name,
			"entryCount": len(scan.entries), "entries": scan.entries, "readOnly": sourceReadOnly(root),
			"fileCount": scan.fileCount, "totalBytes": scan.totalBytes, "databaseFindings": scan.databaseFindings,
		})
	})
	mux.HandleFunc("/api/poc/read", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		_, root, err := readOnlySourceForRequest(config, r)
		if err != nil {
			errorJSON(w, http.StatusPreconditionFailed, "SOURCE_NOT_READY", err)
			return
		}
		path, err := relativeFile(root, r.URL.Query().Get("path"))
		if err != nil {
			errorJSON(w, http.StatusBadRequest, "INVALID_SOURCE_PATH", err)
			return
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			errorJSON(w, http.StatusNotFound, "SOURCE_FILE_NOT_FOUND", errors.New("source file was not found"))
			return
		}
		file, err := os.Open(path)
		if err != nil {
			errorJSON(w, http.StatusForbidden, "SOURCE_READ_DENIED", err)
			return
		}
		defer file.Close()
		hash := sha256.New()
		read, err := io.Copy(hash, io.LimitReader(file, maxProbeBytes))
		if err != nil {
			errorJSON(w, http.StatusInternalServerError, "SOURCE_READ_FAILED", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"bytesRead": read, "sha256": hex.EncodeToString(hash.Sum(nil)), "truncated": info.Size() > maxProbeBytes})
	})
	mux.HandleFunc("/api/poc/snapshots", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			methodNotAllowed(w)
			return
		}
		if r.Body == nil {
			errorJSON(w, http.StatusBadRequest, "INVALID_SNAPSHOT_REQUEST", errors.New("request body is required"))
			return
		}
		decoder := json.NewDecoder(io.LimitReader(r.Body, 4096))
		decoder.DisallowUnknownFields()
		var request snapshotRequest
		if err := decoder.Decode(&request); err != nil || request.DeployID == "" {
			errorJSON(w, http.StatusBadRequest, "INVALID_SNAPSHOT_REQUEST", errors.New("only an owned deploy_id is accepted"))
			return
		}
		app, err := findApplication(config, request.DeployID)
		if err != nil {
			errorJSON(w, http.StatusNotFound, "APPLICATION_NOT_FOUND", err)
			return
		}
		report := reportForApplication(config, app)
		result, err := writeSnapshot(config, app, report)
		if err != nil {
			errorJSON(w, http.StatusPreconditionFailed, "SNAPSHOT_BLOCKED", err)
			return
		}
		writeJSON(w, http.StatusCreated, result)
	})
	mux.Handle("/", staticHandler(config.webRoot))
	return tenantMiddleware(config, mux)
}

func main() {
	config := configFromEnv()
	server := &http.Server{Addr: ":8080", Handler: newHandler(config)}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
