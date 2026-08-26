// Package main is a deliberately small, read-only platform POC. It is not the
// V1 backup engine: its only purpose is to make tenant and source-projection
// assumptions observable on a real Lazycat box.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
)

const maxProbeBytes int64 = 64 * 1024

type pocConfig struct {
	tenantUID         string
	backupDeployUID   string
	backupDeployID    string
	sourceRoot        string
	sourceOwnerUID    string
	sourceDeployID    string
	sourceMultiInstance bool
}

type sourceEntry struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Size int64  `json:"size,omitempty"`
}

type apiError struct {
	status  int
	code    string
	message string
}

func (e *apiError) Error() string { return e.message }

func configFromEnv() pocConfig {
	return pocConfig{
		tenantUID:         os.Getenv("LAZYCAT_APP_DEPLOY_UID"),
		backupDeployUID:   os.Getenv("BACKUP_APP_DEPLOY_UID"),
		backupDeployID:    os.Getenv("BACKUP_APP_DEPLOY_ID"),
		sourceRoot:        os.Getenv("BACKUP_POC_SOURCE_ROOT"),
		sourceOwnerUID:    os.Getenv("BACKUP_POC_SOURCE_OWNER_UID"),
		sourceDeployID:    os.Getenv("BACKUP_POC_SOURCE_DEPLOY_ID"),
		sourceMultiInstance: os.Getenv("BACKUP_POC_SOURCE_MULTI_INSTANCE") == "true",
	}
}

func (c pocConfig) identityReady() bool {
	return c.tenantUID != "" && c.backupDeployUID == c.tenantUID && c.backupDeployID != ""
}

func (c pocConfig) sourceConfigured() bool {
	return c.sourceRoot != "" && c.sourceOwnerUID != "" && c.sourceDeployID != ""
}

// resolveFixture is deliberately an environment-backed test adapter. It does
// not discover source paths and therefore cannot be mistaken for the eventual
// platform SourceResolver.
func (c pocConfig) resolveFixture(deployID string) (string, *apiError) {
	if !c.identityReady() {
		return "", &apiError{status: http.StatusServiceUnavailable, code: "IDENTITY_NOT_READY", message: "backup instance identity is not configured"}
	}
	if !c.sourceConfigured() {
		return "", &apiError{status: http.StatusServiceUnavailable, code: "SOURCE_NOT_READY", message: "platform source resolver is not configured"}
	}
	if deployID == "" {
		return "", &apiError{status: http.StatusBadRequest, code: "SOURCE_DEPLOY_ID_REQUIRED", message: "a source deploy id is required"}
	}
	if deployID != c.sourceDeployID {
		return "", &apiError{status: http.StatusNotFound, code: "SOURCE_NOT_FOUND", message: "source is unavailable"}
	}
	if c.sourceOwnerUID != c.tenantUID || !c.sourceMultiInstance {
		return "", &apiError{status: http.StatusServiceUnavailable, code: "SOURCE_NOT_READY", message: "configured source violates the tenant or multi-instance boundary"}
	}

	root, err := filepath.EvalSymlinks(c.sourceRoot)
	if err != nil {
		return "", &apiError{status: http.StatusServiceUnavailable, code: "SOURCE_NOT_READY", message: "configured source is unavailable"}
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return "", &apiError{status: http.StatusServiceUnavailable, code: "SOURCE_NOT_READY", message: "configured source is unavailable"}
	}
	return root, nil
}

func relativeFile(root, requested string) (string, *apiError) {
	if requested == "" || filepath.IsAbs(requested) {
		return "", &apiError{status: http.StatusBadRequest, code: "INVALID_SOURCE_PATH", message: "a relative file path is required"}
	}
	clean := filepath.Clean(requested)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", &apiError{status: http.StatusBadRequest, code: "INVALID_SOURCE_PATH", message: "path escapes source root"}
	}
	resolved, err := filepath.EvalSymlinks(filepath.Join(root, clean))
	if err != nil {
		return "", &apiError{status: http.StatusNotFound, code: "SOURCE_FILE_NOT_FOUND", message: "source file is unavailable"}
	}
	rel, err := filepath.Rel(root, resolved)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", &apiError{status: http.StatusBadRequest, code: "INVALID_SOURCE_PATH", message: "path escapes source root"}
	}
	return resolved, nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeAPIError(w http.ResponseWriter, err *apiError) {
	writeJSON(w, err.status, map[string]string{"code": err.code, "message": err.message})
}

func requireMethod(method string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != method {
			w.Header().Set("Allow", method)
			writeAPIError(w, &apiError{status: http.StatusMethodNotAllowed, code: "METHOD_NOT_ALLOWED", message: "method is not allowed"})
			return
		}
		next(w, r)
	}
}

func ingressIdentity(config pocConfig, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Forwarded-By") != "lzc-ingress" || r.Header.Get("X-HC-User-ID") == "" {
			writeAPIError(w, &apiError{status: http.StatusForbidden, code: "INGRESS_IDENTITY_REQUIRED", message: "trusted ingress identity is required"})
			return
		}
		if config.identityReady() && r.Header.Get("X-HC-User-ID") != config.tenantUID {
			writeAPIError(w, &apiError{status: http.StatusForbidden, code: "TENANT_IDENTITY_MISMATCH", message: "request identity does not match this backup instance"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func sourceEntries(root string) ([]sourceEntry, *apiError) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, &apiError{status: http.StatusForbidden, code: "SOURCE_LIST_DENIED", message: "source directory cannot be listed"}
	}
	items := make([]sourceEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 {
			items = append(items, sourceEntry{Name: entry.Name(), Type: "symlink"})
			continue
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			continue
		}
		kind := "other"
		switch {
		case info.IsDir():
			kind = "directory"
		case info.Mode().IsRegular():
			kind = "file"
		}
		items = append(items, sourceEntry{Name: entry.Name(), Type: kind, Size: info.Size()})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
	return items, nil
}

func sourceReadOnly(root string) (bool, *apiError) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(root, &stat); err != nil {
		return false, &apiError{status: http.StatusInternalServerError, code: "SOURCE_STAT_FAILED", message: "source mount cannot be inspected"}
	}
	return stat.Flags&syscall.ST_RDONLY != 0, nil
}

func staticFiles(webRoot string) http.Handler {
	if webRoot == "" {
		webRoot = "/app/web"
	}
	return http.FileServer(http.Dir(webRoot))
}

func newServer(config pocConfig, webRoot string) http.Handler {
	api := http.NewServeMux()

	api.HandleFunc("/api/poc/identity", requireMethod(http.MethodGet, func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{
			"identityConfigured": config.identityReady(),
			"sourceConfigured":   config.sourceConfigured(),
			"requiredPermissions": []string{"appvar.other.read", "document.private"},
			"optionalPermissions": []string{"user.notify"},
			"sourceAdapter":       "fixture-only",
		}
		if config.identityReady() {
			body["tenantUID"] = config.tenantUID
			body["backupDeployID"] = config.backupDeployID
		}
		if config.sourceConfigured() && config.identityReady() && config.sourceOwnerUID == config.tenantUID && config.sourceMultiInstance {
			body["configuredSourceDeployID"] = config.sourceDeployID
		}
		writeJSON(w, http.StatusOK, body)
	}))

	api.HandleFunc("/api/poc/source", requireMethod(http.MethodGet, func(w http.ResponseWriter, r *http.Request) {
		deployID := r.URL.Query().Get("deploy_id")
		root, apiErr := config.resolveFixture(deployID)
		if apiErr != nil {
			writeAPIError(w, apiErr)
			return
		}
		readOnly, apiErr := sourceReadOnly(root)
		if apiErr != nil {
			writeAPIError(w, apiErr)
			return
		}
		entries, apiErr := sourceEntries(root)
		if apiErr != nil {
			writeAPIError(w, apiErr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"sourceDeployID": deployID,
			"sourceAdapter":  "fixture-only",
			"readOnly":       readOnly,
			"entryCount":     len(entries),
			"entries":        entries,
		})
	}))

	api.HandleFunc("/api/poc/read", requireMethod(http.MethodGet, func(w http.ResponseWriter, r *http.Request) {
		deployID := r.URL.Query().Get("deploy_id")
		root, apiErr := config.resolveFixture(deployID)
		if apiErr != nil {
			writeAPIError(w, apiErr)
			return
		}
		path, apiErr := relativeFile(root, r.URL.Query().Get("path"))
		if apiErr != nil {
			writeAPIError(w, apiErr)
			return
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			writeAPIError(w, &apiError{status: http.StatusNotFound, code: "SOURCE_FILE_NOT_FOUND", message: "source file is unavailable"})
			return
		}
		file, err := os.Open(path)
		if err != nil {
			writeAPIError(w, &apiError{status: http.StatusForbidden, code: "SOURCE_READ_DENIED", message: "source file cannot be read"})
			return
		}
		defer file.Close()

		hash := sha256.New()
		bytesRead, err := io.Copy(hash, io.LimitReader(file, maxProbeBytes))
		if err != nil {
			writeAPIError(w, &apiError{status: http.StatusInternalServerError, code: "SOURCE_READ_FAILED", message: "source file cannot be inspected"})
			return
		}
		complete := info.Size() <= maxProbeBytes
		hashScope := "prefix"
		if complete {
			hashScope = "complete"
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"sourceDeployID": deployID,
			"path":           r.URL.Query().Get("path"),
			"bytesRead":      bytesRead,
			"sha256":         hex.EncodeToString(hash.Sum(nil)),
			"hashScope":      hashScope,
			"complete":       complete,
		})
	}))

	root := http.NewServeMux()
	root.HandleFunc("/api/health", requireMethod(http.MethodGet, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}))
	root.Handle("/api/poc/", ingressIdentity(config, api))
	root.Handle("/", ingressIdentity(config, staticFiles(webRoot)))
	return root
}

func main() {
	config := configFromEnv()
	webRoot := os.Getenv("WEB_ROOT")
	if err := http.ListenAndServe(":8080", newServer(config, webRoot)); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}
