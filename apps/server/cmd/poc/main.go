// Package main is a deliberately small, read-only platform POC. It is not the
// V1 backup engine: its only purpose is to make the tenant and source-projection
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

const maxProbeBytes = 64 * 1024

type pocConfig struct {
	tenantUID      string
	backupDeployID string
	sourceRoot     string
	sourceOwnerUID string
	sourceDeployID string
	multiInstance  bool
}

type sourceEntry struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Size int64  `json:"size"`
}

func configFromEnv() pocConfig {
	return pocConfig{
		tenantUID:      os.Getenv("BACKUP_APP_DEPLOY_UID"),
		backupDeployID: os.Getenv("BACKUP_APP_DEPLOY_ID"),
		sourceRoot:     os.Getenv("BACKUP_POC_SOURCE_ROOT"),
		sourceOwnerUID: os.Getenv("BACKUP_POC_SOURCE_OWNER_UID"),
		sourceDeployID: os.Getenv("BACKUP_POC_SOURCE_DEPLOY_ID"),
		multiInstance:  os.Getenv("BACKUP_POC_SOURCE_MULTI_INSTANCE") == "true",
	}
}

func (c pocConfig) ready() bool {
	return c.tenantUID != "" && c.backupDeployID != ""
}

// sourceRoot is supplied only by a platform adapter/test fixture, never by an
// HTTP request. Production V1 will obtain it from the platform SourceResolver.
func (c pocConfig) validateSource() (string, error) {
	if !c.ready() {
		return "", errors.New("backup instance identity is missing")
	}
	if c.sourceRoot == "" || c.sourceDeployID == "" || c.sourceOwnerUID == "" {
		return "", errors.New("platform source resolver is not configured")
	}
	if c.sourceOwnerUID != c.tenantUID || !c.multiInstance {
		return "", errors.New("source violates tenant or multi-instance boundary")
	}
	root, err := filepath.EvalSymlinks(c.sourceRoot)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(root)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("source root is not a directory")
	}
	return root, nil
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

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func main() {
	config := configFromEnv()
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet { w.WriteHeader(http.StatusMethodNotAllowed); return }
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "identityConfigured": config.ready()})
	})

	mux.HandleFunc("/api/poc/identity", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet { w.WriteHeader(http.StatusMethodNotAllowed); return }
		writeJSON(w, http.StatusOK, map[string]any{
			"tenantUID": config.tenantUID,
			"backupDeployID": config.backupDeployID,
			"identityConfigured": config.ready(),
			"sourceConfigured": config.sourceRoot != "",
			"requiredPermission": "appvar.other.read",
		})
	})

	mux.HandleFunc("/api/poc/source", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet { w.WriteHeader(http.StatusMethodNotAllowed); return }
		root, err := config.validateSource()
		if err != nil { writeJSON(w, http.StatusPreconditionFailed, map[string]string{"code": "SOURCE_NOT_READY", "message": err.Error()}); return }
		var stat syscall.Statfs_t
		if err := syscall.Statfs(root, &stat); err != nil { writeJSON(w, http.StatusInternalServerError, map[string]string{"code": "SOURCE_STAT_FAILED"}); return }
		entries, err := os.ReadDir(root)
		if err != nil { writeJSON(w, http.StatusForbidden, map[string]string{"code": "SOURCE_LIST_DENIED"}); return }
		items := make([]sourceEntry, 0, len(entries))
		for _, entry := range entries {
			info, infoErr := entry.Info()
			if infoErr != nil { continue }
			kind := "file"
			if entry.IsDir() { kind = "directory" }
			items = append(items, sourceEntry{Name: entry.Name(), Type: kind, Size: info.Size()})
		}
		sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
		writeJSON(w, http.StatusOK, map[string]any{"sourceDeployID": config.sourceDeployID, "entryCount": len(items), "entries": items, "readOnly": stat.Flags&syscall.ST_RDONLY != 0})
	})

	mux.HandleFunc("/api/poc/read", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet { w.WriteHeader(http.StatusMethodNotAllowed); return }
		root, err := config.validateSource()
		if err != nil { writeJSON(w, http.StatusPreconditionFailed, map[string]string{"code": "SOURCE_NOT_READY", "message": err.Error()}); return }
		path, err := relativeFile(root, r.URL.Query().Get("path"))
		if err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"code": "INVALID_SOURCE_PATH", "message": err.Error()}); return }
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() { writeJSON(w, http.StatusNotFound, map[string]string{"code": "SOURCE_FILE_NOT_FOUND"}); return }
		file, err := os.Open(path)
		if err != nil { writeJSON(w, http.StatusForbidden, map[string]string{"code": "SOURCE_READ_DENIED"}); return }
		defer file.Close()
		hash := sha256.New()
		read, err := io.Copy(hash, io.LimitReader(file, maxProbeBytes))
		if err != nil { writeJSON(w, http.StatusInternalServerError, map[string]string{"code": "SOURCE_READ_FAILED"}); return }
		writeJSON(w, http.StatusOK, map[string]any{"bytesRead": read, "sha256": hex.EncodeToString(hash.Sum(nil)), "truncated": info.Size() > maxProbeBytes})
	})

	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" { writeJSON(w, http.StatusNotFound, map[string]string{"code": "NOT_FOUND"}); return }
		writeJSON(w, http.StatusOK, map[string]string{"name": "Lazycat App Backup POC", "next": "Use the platform adapter to configure a disposable owned source, then call /api/poc/source."})
	}))

	_ = http.ListenAndServe(":8080", mux)
}
