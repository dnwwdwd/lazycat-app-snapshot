package probe

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/source"
)

const maxEntries = 100000

type Result struct {
	CapabilityStatus string
	TotalBytes       int64
	FileCount        int
	SQLiteCount      int
	SkippedCount     int
	Findings         []domain.DatabaseFinding
}

// Entry is a preflighted source object. Path is private to the backup engine:
// callers must never persist or expose it through an API.
type Entry struct {
	Path     string
	Relative string
	Info     fs.FileInfo
}

// Plan is a complete, bounded snapshot plan. SQLite contains only validated
// main database files; their WAL, SHM and journal companions are excluded.
type Plan struct {
	Result      Result
	Directories []Entry
	Files       []Entry
	SQLite      []Entry
	Warnings    []string
}

// ScopeValidationError identifies the declared relative path that no longer
// resolves to the expected safe object. Callers can pause the plan without
// ever exposing the authorized source root.
type ScopeValidationError struct {
	Path     string
	Expected string
}

func (e *ScopeValidationError) Error() string {
	return fmt.Sprintf("scope %s missing or changed type: %s", e.Expected, e.Path)
}

// ScopeCatalog exposes only safe relative metadata for the range picker.
func ScopeCatalog(ctx context.Context, resolved source.Resolved, multiInstance bool, query string, limit int) (domain.BackupScopeCatalog, error) {
	plan, err := BuildPlan(ctx, resolved, multiInstance)
	if err != nil {
		return domain.BackupScopeCatalog{}, err
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	query = strings.ToLower(strings.TrimSpace(query))
	items := make([]domain.ScopeEntry, 0, limit)
	appendEntry := func(entry Entry, typ string, sqlite bool) {
		if query != "" && !strings.Contains(strings.ToLower(entry.Relative), query) {
			return
		}
		if len(items) < limit {
			items = append(items, domain.ScopeEntry{Path: entry.Relative, Type: typ, Size: entry.Info.Size(), SQLite: sqlite, Selectable: true})
		}
	}
	for _, entry := range plan.Directories {
		appendEntry(entry, "directory", false)
	}
	for _, entry := range plan.Files {
		appendEntry(entry, "file", false)
	}
	for _, entry := range plan.SQLite {
		appendEntry(entry, "file", true)
	}
	return domain.BackupScopeCatalog{Items: items}, nil
}

// ApplyScope validates allow-listed paths against a fresh source scan and
// returns exactly the objects that may enter this archive.
func ApplyScope(plan Plan, scope domain.BackupScope) (Plan, error) {
	if scope.Mode == "" || scope.Mode == "FULL" {
		return plan, nil
	}
	dirs := map[string]Entry{}
	files := map[string]Entry{}
	for _, entry := range plan.Directories {
		dirs[entry.Relative] = entry
	}
	for _, entry := range append(append([]Entry{}, plan.Files...), plan.SQLite...) {
		files[entry.Relative] = entry
	}
	if scope.Mode == "CORE" {
		if len(plan.SQLite) == 0 {
			return Plan{}, &ScopeValidationError{Path: "Notus core SQLite profile", Expected: "SQLite database"}
		}
		filtered := Plan{Result: plan.Result, Warnings: append([]string{}, plan.Warnings...), SQLite: append([]Entry{}, plan.SQLite...)}
		filtered.Result.FileCount = 0
		filtered.Result.SQLiteCount = len(filtered.SQLite)
		filtered.Result.TotalBytes = 0
		for _, entry := range filtered.SQLite {
			filtered.Result.TotalBytes += entry.Info.Size()
		}
		return filtered, nil
	}
	for _, path := range scope.Directories {
		if _, ok := dirs[path]; !ok {
			return Plan{}, &ScopeValidationError{Path: path, Expected: "directory"}
		}
	}
	for _, path := range scope.Files {
		if _, ok := files[path]; !ok {
			return Plan{}, &ScopeValidationError{Path: path, Expected: "file"}
		}
	}
	selected := func(relative string) bool {
		for _, root := range scope.Directories {
			if relative == root || strings.HasPrefix(relative, root+"/") {
				return true
			}
		}
		for _, file := range scope.Files {
			if relative == file {
				return true
			}
		}
		return false
	}
	filtered := Plan{Result: plan.Result, Warnings: append([]string{}, plan.Warnings...)}
	for _, entry := range plan.Directories {
		if selected(entry.Relative) {
			filtered.Directories = append(filtered.Directories, entry)
		}
	}
	for _, entry := range plan.Files {
		if selected(entry.Relative) {
			filtered.Files = append(filtered.Files, entry)
		}
	}
	for _, entry := range plan.SQLite {
		if selected(entry.Relative) {
			filtered.SQLite = append(filtered.SQLite, entry)
		}
	}
	filtered.Result.FileCount, filtered.Result.TotalBytes, filtered.Result.SQLiteCount = len(filtered.Files), 0, len(filtered.SQLite)
	for _, entry := range append(append([]Entry{}, filtered.Files...), filtered.SQLite...) {
		filtered.Result.TotalBytes += entry.Info.Size()
	}
	if filtered.ArchiveFileCount() == 0 {
		return Plan{}, &ScopeValidationError{Path: "selected range", Expected: "backupable file"}
	}
	return filtered, nil
}

func (p Plan) ArchiveFileCount() int { return len(p.Files) + len(p.SQLite) }

func Run(ctx context.Context, resolved source.Resolved, multiInstance bool) (Result, error) {
	plan, err := BuildPlan(ctx, resolved, multiInstance)
	if err != nil {
		return Result{}, err
	}
	return plan.Result, nil
}

// BuildPlan repeats the source scan immediately before a backup. The catalog
// probe is only a display hint and must not authorize archive contents.
func BuildPlan(ctx context.Context, resolved source.Resolved, multiInstance bool) (Plan, error) {
	plan := Plan{Result: Result{Findings: []domain.DatabaseFinding{}}, Warnings: []string{}}
	seen := 0
	err := filepath.WalkDir(resolved.Root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if path == resolved.Root {
			return nil
		}
		seen++
		if seen > maxEntries {
			return errors.New("source contains too many entries")
		}
		relative, err := filepath.Rel(resolved.Root, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if entry.Type()&os.ModeSymlink != 0 {
			plan.Result.SkippedCount++
			plan.Warnings = append(plan.Warnings, "skipped symbolic link: "+relative)
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if finding, ok := databaseFinding(path, relative, info); ok {
				plan.Result.Findings = append(plan.Result.Findings, finding)
			}
			plan.Directories = append(plan.Directories, Entry{Path: path, Relative: relative, Info: info})
			return nil
		}
		if !info.Mode().IsRegular() {
			plan.Result.SkippedCount++
			plan.Warnings = append(plan.Warnings, "skipped special file: "+relative)
			return nil
		}
		plan.Result.FileCount++
		plan.Result.TotalBytes += info.Size()
		if finding, ok := databaseFinding(path, relative, info); ok {
			plan.Result.Findings = append(plan.Result.Findings, finding)
		}
		plan.Files = append(plan.Files, Entry{Path: path, Relative: relative, Info: info})
		return nil
	})
	if err != nil {
		return Plan{}, err
	}
	sort.Slice(plan.Result.Findings, func(i, j int) bool { return plan.Result.Findings[i].Path < plan.Result.Findings[j].Path })
	sqlitePaths := make(map[string]struct{})
	for _, finding := range plan.Result.Findings {
		if finding.Type == "sqlite" {
			plan.Result.SQLiteCount++
			sqlitePaths[finding.Path] = struct{}{}
		}
	}
	files := plan.Files[:0]
	for _, entry := range plan.Files {
		if _, isSQLite := sqlitePaths[entry.Relative]; isSQLite {
			plan.SQLite = append(plan.SQLite, entry)
			continue
		}
		if hasSQLiteCompanion(entry.Relative, sqlitePaths) {
			continue
		}
		files = append(files, entry)
	}
	plan.Files = files
	plan.Result.CapabilityStatus = "BACKUPABLE"
	if !multiInstance {
		plan.Result.CapabilityStatus = "BACKUPABLE_SHARED_WARNING"
	}
	if plan.ArchiveFileCount() == 0 {
		plan.Result.CapabilityStatus = "NO_DATA"
	}
	for _, finding := range plan.Result.Findings {
		if !finding.Supported {
			plan.Result.CapabilityStatus = "UNSUPPORTED_DATABASE"
			break
		}
	}
	return plan, nil
}

func hasSQLiteCompanion(relative string, sqlitePaths map[string]struct{}) bool {
	for suffix := range map[string]struct{}{"-wal": {}, "-shm": {}, "-journal": {}} {
		base := strings.TrimSuffix(relative, suffix)
		if base != relative {
			_, ok := sqlitePaths[base]
			return ok
		}
	}
	return false
}

func databaseFinding(path, relative string, info fs.FileInfo) (domain.DatabaseFinding, bool) {
	base := strings.ToLower(filepath.Base(path))
	if info.Mode().IsRegular() {
		file, err := os.Open(path)
		if err == nil {
			defer file.Close()
			var header [16]byte
			if count, readErr := io.ReadFull(file, header[:]); readErr == nil && count == len(header) && string(header[:]) == "SQLite format 3\x00" {
				return domain.DatabaseFinding{Type: "sqlite", Path: relative, Supported: true, Reason: "SQLite format 3 header"}, true
			}
		}
	}
	if base == "pg_version" || base == "ibdata1" || base == "wiredtiger" || base == "dump.rdb" || base == "appendonly.aof" || base == "appendonlydir" {
		typ := map[string]string{"pg_version": "postgresql", "ibdata1": "mysql", "wiredtiger": "mongodb", "dump.rdb": "redis", "appendonly.aof": "redis", "appendonlydir": "redis"}[base]
		return domain.DatabaseFinding{Type: typ, Path: relative, Supported: false, Reason: "service database signature"}, true
	}
	if strings.HasSuffix(base, ".wt") || strings.HasPrefix(base, "collection-") {
		return domain.DatabaseFinding{Type: "mongodb", Path: relative, Supported: false, Reason: "MongoDB WiredTiger signature"}, true
	}
	if base == "base" || base == "global" || base == "pg_wal" || base == "mysql" || base == "performance_schema" {
		typ := "postgresql"
		if base == "mysql" || base == "performance_schema" {
			typ = "mysql"
		}
		return domain.DatabaseFinding{Type: typ, Path: relative, Supported: false, Reason: "service database directory"}, true
	}
	if strings.HasSuffix(base, ".sqlite") || strings.HasSuffix(base, ".sqlite3") || strings.HasSuffix(base, ".db") {
		return domain.DatabaseFinding{Type: "unknown", Path: relative, Supported: false, Reason: "database-like file without a valid SQLite header"}, true
	}
	return domain.DatabaseFinding{}, false
}

func Now() time.Time { return time.Now().UTC() }
