// Package backup implements the phase-3 manual snapshot boundary. It owns no
// source paths outside an active worker and never accepts them from callers.
package backup

import (
	"archive/zip"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/probe"
	"cloud.lazycat.app.backup/apps/server/internal/source"
	"cloud.lazycat.app.backup/apps/server/internal/storage"
	"golang.org/x/sys/unix"
	"modernc.org/sqlite"
)

const (
	defaultQueueSize = 16
	defaultTimeout   = 2 * time.Hour
)

type Error struct {
	Code string
	Err  error
}

func (e *Error) Error() string { return e.Code + ": " + e.Err.Error() }
func (e *Error) Unwrap() error { return e.Err }

func Code(err error) string {
	var backupError *Error
	if errors.As(err, &backupError) {
		return backupError.Code
	}
	var sourceError *source.Error
	if errors.As(err, &sourceError) {
		return source.Code(err)
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "BACKUP_TIMED_OUT"
	}
	if errors.Is(err, context.Canceled) {
		return "BACKUP_CANCELLED"
	}
	return "BACKUP_FAILED"
}

type Config struct {
	TenantUID      string
	DocumentRoot   string
	CacheRoot      string
	Workers        int
	QueueSize      int
	JobTimeout     time.Duration
	ManagedByQueue bool
}

type Service struct {
	store          *persistence.Store
	resolver       source.Resolver
	tenantUID      string
	storage        *storage.Store
	cacheRoot      string
	timeout        time.Duration
	jobs           chan string
	managedByQueue bool
}

func New(store *persistence.Store, resolver source.Resolver, config Config) (*Service, error) {
	if store == nil || strings.TrimSpace(config.TenantUID) == "" {
		return nil, errors.New("backup store and tenant identity are required")
	}
	if config.CacheRoot == "" {
		config.CacheRoot = "/lzcapp/cache/jobs"
	}
	if err := os.MkdirAll(config.CacheRoot, 0o700); err != nil {
		return nil, fmt.Errorf("create backup cache root: %w", err)
	}
	cacheRoot, err := filepath.Abs(filepath.Clean(config.CacheRoot))
	if err != nil {
		return nil, fmt.Errorf("resolve backup cache root: %w", err)
	}
	cacheRoot, err = filepath.EvalSymlinks(cacheRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve backup cache root: %w", err)
	}
	fileStore, err := storage.New(config.DocumentRoot)
	if err != nil {
		return nil, err
	}
	if !config.ManagedByQueue {
		if err := store.InterruptOpenBackupJobs(context.Background(), config.TenantUID, time.Now().UTC()); err != nil {
			return nil, fmt.Errorf("recover interrupted manual backup jobs: %w", err)
		}
	}
	if config.Workers < 1 {
		config.Workers = 1
	}
	if config.Workers > 2 {
		config.Workers = 2
	}
	if config.QueueSize < 1 {
		config.QueueSize = defaultQueueSize
	}
	if config.JobTimeout <= 0 {
		config.JobTimeout = defaultTimeout
	}
	service := &Service{
		store: store, resolver: resolver, tenantUID: config.TenantUID, storage: fileStore,
		cacheRoot: cacheRoot, timeout: config.JobTimeout, jobs: make(chan string, config.QueueSize), managedByQueue: config.ManagedByQueue,
	}
	if !config.ManagedByQueue {
		for range config.Workers {
			go service.worker()
		}
	}
	return service, nil
}

func (s *Service) StartManual(ctx context.Context, deployID string, sharedRiskAccepted bool, subject string, role domain.Role) (domain.BackupJob, error) {
	job, err := s.CreateJob(ctx, deployID, sharedRiskAccepted, subject, role, "", "", "", "manual", time.Now().UTC())
	if err != nil || s.managedByQueue {
		return job, err
	}
	select {
	case s.jobs <- job.ID:
		return job, nil
	default:
		_ = s.store.FailBackupJob(context.Background(), s.tenantUID, job.ID, "BACKUP_QUEUE_FULL", time.Now().UTC())
		return domain.BackupJob{}, &Error{Code: "BACKUP_QUEUE_FULL", Err: errors.New("manual backup queue is full")}
	}
}

// CreateJob persists a validated backup job without assigning it to an in-memory
// worker. The phase-4 queue owns execution when ManagedByQueue is enabled.
func (s *Service) CreateJob(ctx context.Context, deployID string, sharedRiskAccepted bool, subject string, role domain.Role, planID, batchID, taskID, triggerType string, scheduledAt time.Time) (domain.BackupJob, error) {
	instance, err := s.store.Instance(ctx, s.tenantUID, deployID)
	if err != nil {
		return domain.BackupJob{}, err
	}
	if instance.CapabilityStatus != "BACKUPABLE" && instance.CapabilityStatus != "BACKUPABLE_SHARED_WARNING" {
		return domain.BackupJob{}, &Error{Code: "INSTANCE_NOT_BACKUPABLE", Err: errors.New("instance is not backupable")}
	}
	id, err := randomID("backup")
	if err != nil {
		return domain.BackupJob{}, err
	}
	job := domain.BackupJob{
		ID: id, TenantUID: s.tenantUID, OIDCSubject: subject, UserRole: role,
		AppID: instance.AppID, ApplicationName: instance.Name, ApplicationVersion: instance.Version,
		DeployID: instance.DeployID, MultiInstance: instance.MultiInstance, SharedRiskAccepted: sharedRiskAccepted,
		Status: "QUEUED", CreatedAt: time.Now().UTC(), PlanID: planID, BatchID: batchID, TaskID: taskID,
		TriggerType: triggerType, ScheduledAt: &scheduledAt,
	}
	if err := s.store.CreateBackupJob(ctx, job); err != nil {
		return domain.BackupJob{}, err
	}
	return job, nil
}

func (s *Service) Job(ctx context.Context, id string) (domain.BackupJob, error) {
	return s.store.BackupJob(ctx, s.tenantUID, id)
}

func (s *Service) Snapshots(ctx context.Context, limit int) ([]domain.Snapshot, error) {
	return s.store.ListSnapshots(ctx, s.tenantUID, limit)
}

func (s *Service) Snapshot(ctx context.Context, id string) (domain.Snapshot, error) {
	return s.store.Snapshot(ctx, s.tenantUID, id)
}

func (s *Service) Verify(ctx context.Context, id string) (domain.Snapshot, error) {
	snapshot, err := s.store.Snapshot(ctx, s.tenantUID, id)
	if err != nil {
		return domain.Snapshot{}, err
	}
	location := storage.Location{Directory: snapshot.StoragePath}
	if err := s.storage.QuickVerify(location, snapshot.ArchiveSize, snapshot.ArchiveSHA256); err != nil {
		_ = s.store.SetSnapshotVerification(ctx, s.tenantUID, id, "FAILED", time.Now().UTC())
		return domain.Snapshot{}, &Error{Code: "SNAPSHOT_VERIFICATION_FAILED", Err: err}
	}
	now := time.Now().UTC()
	if err := s.store.SetSnapshotVerification(ctx, s.tenantUID, id, "VERIFIED", now); err != nil {
		return domain.Snapshot{}, err
	}
	snapshot.VerificationStatus, snapshot.VerifiedAt = "VERIFIED", &now
	return snapshot, nil
}

func (s *Service) worker() {
	for id := range s.jobs {
		s.run(id)
	}
}

func (s *Service) run(id string) {
	_ = s.ExecuteJob(context.Background(), id)
}

// ExecuteJob runs one persisted job synchronously. Its caller must already
// have acquired the phase-4 task lease.
func (s *Service) ExecuteJob(parent context.Context, id string) error {
	ctx, cancel := context.WithTimeout(parent, s.timeout)
	defer cancel()
	job, err := s.store.BackupJob(ctx, s.tenantUID, id)
	if err != nil {
		return err
	}
	started := time.Now().UTC()
	if err := s.store.StartBackupJob(ctx, s.tenantUID, id, started); err != nil {
		return err
	}
	job.Status, job.StartedAt = "RUNNING", &started
	if err := s.execute(ctx, job); err != nil {
		_ = s.store.FailBackupJob(context.Background(), s.tenantUID, id, Code(err), time.Now().UTC())
		return err
	}
	return nil
}

func (s *Service) execute(ctx context.Context, job domain.BackupJob) error {
	resolved, err := s.resolver.Resolve(source.Request{TenantUID: s.tenantUID, OwnerUID: s.tenantUID, AppID: job.AppID, DeployID: job.DeployID})
	if err != nil {
		return err
	}
	plan, err := probe.BuildPlan(ctx, resolved, job.MultiInstance)
	if err != nil {
		return &Error{Code: "BACKUP_PRECHECK_FAILED", Err: err}
	}
	switch plan.Result.CapabilityStatus {
	case "NO_DATA":
		return &Error{Code: "NO_APPLICATION_DATA", Err: errors.New("source has no backupable data")}
	case "UNSUPPORTED_DATABASE":
		return &Error{Code: "UNSUPPORTED_DATABASE", Err: errors.New("source contains a blocked database")}
	case "BACKUPABLE", "BACKUPABLE_SHARED_WARNING":
	default:
		return &Error{Code: "INSTANCE_NOT_BACKUPABLE", Err: errors.New("source preflight rejected instance")}
	}
	partial, err := s.storage.CreatePartial(job.ID)
	if err != nil {
		return &Error{Code: "STORAGE_WRITE_FAILED", Err: err}
	}
	defer s.storage.RemoveDirectory(partial.Directory)
	cacheDirectory := filepath.Join(s.cacheRoot, job.ID)
	if err := os.MkdirAll(cacheDirectory, 0o700); err != nil {
		return &Error{Code: "BACKUP_CACHE_UNAVAILABLE", Err: err}
	}
	defer os.RemoveAll(cacheDirectory)
	capturedAt := time.Now().UTC()
	base := manifest{
		FormatVersion: "1", ProductVersion: "0.1.0", Status: "completed", TenantUID: s.tenantUID,
		OIDCSubject: job.OIDCSubject, UserRole: string(job.UserRole), AppID: job.AppID,
		ApplicationName: job.ApplicationName, ApplicationVersion: job.ApplicationVersion, DeployID: job.DeployID,
		MultiInstance: job.MultiInstance, SharedInstanceWarning: !job.MultiInstance, JobID: job.ID,
		TriggerType: job.TriggerType, ScheduledAt: dereferenceTime(job.ScheduledAt, capturedAt), StartedAt: dereferenceTime(job.StartedAt, capturedAt),
		CapturedAt: capturedAt, SourceProvider: "runtime-appvar", SourceProviderVersion: "lzcos-runtime-appvar-v1",
		SourceReadOnlyMode: resolved.ReadOnlyMode, ArchiveName: "snapshot.zip", OriginalBytes: archiveSourceBytes(plan),
		FileCount: plan.ArchiveFileCount(), DirectoryCount: len(plan.Directories), SQLiteCount: len(plan.SQLite),
		SkippedCount: plan.Result.SkippedCount, WarningCount: len(plan.Warnings), Consistency: consistency(plan),
	}
	if err := s.writeWithRetry(ctx, partial, cacheDirectory, plan, base); err != nil {
		return err
	}
	if err := s.storage.SyncArchive(partial.Archive); err != nil {
		return &Error{Code: "STORAGE_WRITE_FAILED", Err: err}
	}
	size, sha256, err := s.storage.Digest(partial.Archive)
	if err != nil {
		return &Error{Code: "ARCHIVE_DIGEST_FAILED", Err: err}
	}
	location, err := s.storage.CommitArchive(partial, capturedAt.Format("20060102T150405.000Z"), job.DeployID, shortID(job.ID))
	if err != nil {
		return &Error{Code: "STORAGE_COMMIT_FAILED", Err: err}
	}
	committed := false
	defer func() {
		if !committed {
			_ = s.storage.RemoveDirectory(location.Directory)
		}
	}()
	finishedAt := time.Now().UTC()
	base.ArchiveSize, base.ArchiveSHA256, base.ZipBytes, base.FinishedAt, base.StoragePath = size, sha256, size, finishedAt, location.Directory
	external, err := json.MarshalIndent(base, "", "  ")
	if err != nil {
		return &Error{Code: "MANIFEST_WRITE_FAILED", Err: err}
	}
	if err := s.storage.WriteManifest(location, external); err != nil {
		return &Error{Code: "MANIFEST_WRITE_FAILED", Err: err}
	}
	if err := s.storage.QuickVerify(location, size, sha256); err != nil {
		return &Error{Code: "SNAPSHOT_VERIFICATION_FAILED", Err: err}
	}
	verifiedAt := time.Now().UTC()
	snapshot := domain.Snapshot{
		ID: snapshotID(job.ID), TenantUID: s.tenantUID, JobID: job.ID, AppID: job.AppID,
		ApplicationName: job.ApplicationName, ApplicationVersion: job.ApplicationVersion, DeployID: job.DeployID,
		MultiInstance: job.MultiInstance, SharedInstanceWarning: !job.MultiInstance, Status: "COMPLETED",
		StoragePath: location.Directory, ArchiveName: "snapshot.zip", ArchiveSize: size, ArchiveSHA256: sha256,
		OriginalBytes: base.OriginalBytes, FileCount: base.FileCount, DirectoryCount: base.DirectoryCount,
		SQLiteCount: base.SQLiteCount, SkippedCount: base.SkippedCount, WarningCount: base.WarningCount,
		CapturedAt: capturedAt, FinishedAt: finishedAt, VerificationStatus: "VERIFIED", VerifiedAt: &verifiedAt,
		PlanID: job.PlanID, BatchID: job.BatchID, TaskID: job.TaskID, TriggerType: job.TriggerType, RetentionStatus: "ACTIVE",
	}
	if err := s.store.CommitSnapshot(ctx, snapshot); err != nil {
		return &Error{Code: "CONTROL_DATABASE_WRITE_FAILED", Err: err}
	}
	committed = true
	return nil
}

func (s *Service) writeWithRetry(ctx context.Context, partial storage.Partial, cacheDirectory string, plan probe.Plan, base manifest) error {
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			if err := s.storage.DiscardArchive(partial); err != nil {
				return &Error{Code: "STORAGE_WRITE_FAILED", Err: err}
			}
		}
		err := writeArchive(ctx, s.storage, partial, cacheDirectory, plan, base)
		if Code(err) != "SOURCE_FILE_CHANGED" || attempt == 1 {
			return err
		}
	}
	return &Error{Code: "SOURCE_FILE_CHANGED", Err: errors.New("source changed while reading")}
}

type manifest struct {
	FormatVersion         string    `json:"format_version"`
	ProductVersion        string    `json:"product_version"`
	Status                string    `json:"status"`
	TenantUID             string    `json:"tenant_uid"`
	OIDCSubject           string    `json:"oidc_subject"`
	UserRole              string    `json:"user_role"`
	AppID                 string    `json:"appid"`
	ApplicationName       string    `json:"application_name"`
	ApplicationVersion    string    `json:"application_version"`
	DeployID              string    `json:"deploy_id"`
	MultiInstance         bool      `json:"multi_instance"`
	SharedInstanceWarning bool      `json:"shared_instance_warning"`
	JobID                 string    `json:"job_id"`
	TriggerType           string    `json:"trigger_type"`
	ScheduledAt           time.Time `json:"scheduled_at"`
	StartedAt             time.Time `json:"started_at"`
	CapturedAt            time.Time `json:"captured_at"`
	FinishedAt            time.Time `json:"finished_at,omitempty"`
	SourceProvider        string    `json:"source_provider"`
	SourceProviderVersion string    `json:"source_provider_version"`
	SourceReadOnlyMode    string    `json:"source_readonly_mode"`
	StoragePath           string    `json:"storage_path,omitempty"`
	ArchiveName           string    `json:"archive_name"`
	ArchiveSize           int64     `json:"archive_size"`
	ArchiveSHA256         string    `json:"archive_sha256"`
	FileCount             int       `json:"file_count"`
	DirectoryCount        int       `json:"directory_count"`
	SQLiteCount           int       `json:"sqlite_count"`
	SkippedCount          int       `json:"skipped_count"`
	WarningCount          int       `json:"warning_count"`
	OriginalBytes         int64     `json:"original_bytes"`
	ZipBytes              int64     `json:"zip_bytes"`
	Consistency           string    `json:"consistency"`
}

type indexEntry struct {
	Path     string    `json:"path"`
	Type     string    `json:"type"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

func writeArchive(ctx context.Context, fileStore *storage.Store, partial storage.Partial, cacheDirectory string, plan probe.Plan, base manifest) (err error) {
	archive, err := fileStore.CreateArchive(partial)
	if err != nil {
		return &Error{Code: "STORAGE_WRITE_FAILED", Err: err}
	}
	closed := false
	defer func() {
		if !closed {
			_ = archive.Close()
		}
	}()
	writer := zip.NewWriter(archive)
	writerClosed := false
	defer func() {
		if !writerClosed {
			_ = writer.Close()
		}
	}()
	for _, directory := range plan.Directories {
		if err := writeDirectory(writer, directory); err != nil {
			return err
		}
	}
	indexPath := filepath.Join(cacheDirectory, "file-index.jsonl")
	defer os.Remove(indexPath)
	indexFile, err := os.OpenFile(indexPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return &Error{Code: "BACKUP_CACHE_UNAVAILABLE", Err: err}
	}
	indexClosed := false
	defer func() {
		if !indexClosed {
			_ = indexFile.Close()
		}
	}()
	encoder := json.NewEncoder(indexFile)
	for _, entry := range plan.Files {
		if err := writeRegular(ctx, writer, entry); err != nil {
			return err
		}
		if err := encoder.Encode(indexEntry{Path: entry.Relative, Type: "file", Size: entry.Info.Size(), Modified: entry.Info.ModTime().UTC()}); err != nil {
			return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
		}
	}
	for index, entry := range plan.SQLite {
		if err := writeSQLite(ctx, writer, entry, filepath.Join(cacheDirectory, "sqlite", fmt.Sprintf("%d.sqlite", index))); err != nil {
			return err
		}
		if err := encoder.Encode(indexEntry{Path: entry.Relative, Type: "sqlite", Size: entry.Info.Size(), Modified: entry.Info.ModTime().UTC()}); err != nil {
			return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
		}
	}
	if err := indexFile.Sync(); err != nil {
		return &Error{Code: "BACKUP_CACHE_UNAVAILABLE", Err: err}
	}
	if err := indexFile.Close(); err != nil {
		return &Error{Code: "BACKUP_CACHE_UNAVAILABLE", Err: err}
	}
	indexClosed = true
	if err := writeInternalFile(ctx, writer, "_snapshot/file-index.jsonl", indexPath); err != nil {
		return err
	}
	warnings, err := json.Marshal(plan.Warnings)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	if err := writeBytes(writer, "_snapshot/warnings.json", warnings); err != nil {
		return err
	}
	base.ArchiveSHA256 = "calculated_after_close"
	internal, err := json.Marshal(base)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	if err := writeBytes(writer, "_snapshot/manifest.json", internal); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	writerClosed = true
	if err := archive.Sync(); err != nil {
		return &Error{Code: "STORAGE_WRITE_FAILED", Err: err}
	}
	if err := archive.Close(); err != nil {
		return &Error{Code: "STORAGE_WRITE_FAILED", Err: err}
	}
	closed = true
	return nil
}

func writeDirectory(writer *zip.Writer, entry probe.Entry) error {
	name, err := zipName(entry.Relative, true)
	if err != nil {
		return err
	}
	header, err := zip.FileInfoHeader(entry.Info)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	header.Name, header.Method = name, zip.Store
	_, err = writer.CreateHeader(header)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	return nil
}

func writeRegular(ctx context.Context, writer *zip.Writer, entry probe.Entry) error {
	name, err := zipName(entry.Relative, false)
	if err != nil {
		return err
	}
	header, err := zip.FileInfoHeader(entry.Info)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	header.Name, header.Method = name, compressionMethod(entry.Relative)
	destination, err := writer.CreateHeader(header)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	return copyStable(ctx, entry.Path, destination)
}

func writeSQLite(ctx context.Context, writer *zip.Writer, entry probe.Entry, temporary string) error {
	if err := os.MkdirAll(filepath.Dir(temporary), 0o700); err != nil {
		return &Error{Code: "SQLITE_SNAPSHOT_FAILED", Err: err}
	}
	defer os.Remove(temporary)
	if err := onlineBackup(ctx, entry.Path, temporary); err != nil {
		return &Error{Code: "SQLITE_SNAPSHOT_FAILED", Err: err}
	}
	name, err := zipName(entry.Relative, false)
	if err != nil {
		return err
	}
	info, err := os.Stat(temporary)
	if err != nil {
		return &Error{Code: "SQLITE_SNAPSHOT_FAILED", Err: err}
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	header.Name, header.Method, header.Modified = name, zip.Deflate, entry.Info.ModTime()
	destination, err := writer.CreateHeader(header)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	return copyStable(ctx, temporary, destination)
}

func writeBytes(writer *zip.Writer, name string, value []byte) error {
	if !safeInternalZipName(name) {
		return &Error{Code: "ARCHIVE_PATH_UNSAFE", Err: errors.New("unsafe internal archive path")}
	}
	destination, err := writer.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate})
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	_, err = destination.Write(value)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	return nil
}

func writeInternalFile(ctx context.Context, writer *zip.Writer, name, filename string) error {
	if !safeInternalZipName(name) {
		return &Error{Code: "ARCHIVE_PATH_UNSAFE", Err: errors.New("unsafe internal archive path")}
	}
	info, err := os.Stat(filename)
	if err != nil {
		return &Error{Code: "BACKUP_CACHE_UNAVAILABLE", Err: err}
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	header.Name, header.Method = name, zip.Deflate
	destination, err := writer.CreateHeader(header)
	if err != nil {
		return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
	}
	file, err := os.Open(filename)
	if err != nil {
		return &Error{Code: "BACKUP_CACHE_UNAVAILABLE", Err: err}
	}
	defer file.Close()
	if err := copyContext(ctx, destination, file); err != nil {
		return err
	}
	return nil
}

func copyContext(ctx context.Context, destination io.Writer, source io.Reader) error {
	buffer := make([]byte, 64*1024)
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		count, readErr := source.Read(buffer)
		if count > 0 {
			if _, err := destination.Write(buffer[:count]); err != nil {
				return &Error{Code: "ARCHIVE_WRITE_FAILED", Err: err}
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return &Error{Code: "SOURCE_READ_FAILED", Err: readErr}
		}
	}
	return nil
}

func copyStable(ctx context.Context, filename string, destination io.Writer) error {
	fd, err := unix.Open(filename, unix.O_RDONLY|unix.O_CLOEXEC|unix.O_NOFOLLOW, 0)
	if err != nil {
		return &Error{Code: "SOURCE_FILE_CHANGED", Err: err}
	}
	file := os.NewFile(uintptr(fd), filename)
	if file == nil {
		_ = unix.Close(fd)
		return &Error{Code: "SOURCE_FILE_CHANGED", Err: errors.New("open source file")}
	}
	defer file.Close()
	before, err := file.Stat()
	if err != nil || !before.Mode().IsRegular() {
		return &Error{Code: "SOURCE_FILE_CHANGED", Err: errors.New("source is no longer a regular file")}
	}
	if err := copyContext(ctx, destination, file); err != nil {
		return err
	}
	after, err := os.Lstat(filename)
	if err != nil || !after.Mode().IsRegular() || !os.SameFile(before, after) || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return &Error{Code: "SOURCE_FILE_CHANGED", Err: errors.New("source changed during read")}
	}
	return nil
}

type onlineBackuper interface {
	NewBackup(string) (*sqlite.Backup, error)
}

func onlineBackup(ctx context.Context, sourcePath, destination string) error {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if err := os.Remove(destination); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if err := onlineBackupOnce(ctx, sourcePath, destination); err == nil {
			return quickCheck(ctx, destination)
		} else if !sqliteBusy(err) || attempt == 2 {
			return err
		} else {
			lastErr = err
		}
		wait := time.Duration(attempt+1) * 50 * time.Millisecond
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
	return lastErr
}

func onlineBackupOnce(ctx context.Context, sourcePath, destination string) error {
	db, err := sql.Open("sqlite", sqliteReadOnlyURI(sourcePath))
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	connection, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer connection.Close()
	err = connection.Raw(func(raw any) error {
		backuper, ok := raw.(onlineBackuper)
		if !ok {
			return errors.New("sqlite driver does not expose online backup")
		}
		backup, err := backuper.NewBackup(destination)
		if err != nil {
			return err
		}
		for {
			if err := ctx.Err(); err != nil {
				_ = backup.Finish()
				return err
			}
			more, err := backup.Step(128)
			if err != nil {
				_ = backup.Finish()
				return err
			}
			if !more {
				return backup.Finish()
			}
		}
	})
	return err
}

func sqliteBusy(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "database is locked") || strings.Contains(message, "database is busy") || strings.Contains(message, "sqlite_busy")
}

func quickCheck(ctx context.Context, filename string) error {
	db, err := sql.Open("sqlite", sqliteReadOnlyURI(filename))
	if err != nil {
		return err
	}
	defer db.Close()
	var result string
	if err := db.QueryRowContext(ctx, "PRAGMA quick_check").Scan(&result); err != nil {
		return err
	}
	if result != "ok" {
		return fmt.Errorf("sqlite quick_check returned %q", result)
	}
	return nil
}

func sqliteReadOnlyURI(filename string) string {
	return "file:" + filepath.ToSlash(filename) + "?mode=ro"
}

func zipName(relative string, directory bool) (string, error) {
	relative = filepath.ToSlash(relative)
	if !safeInternalZipName(relative) {
		return "", &Error{Code: "ARCHIVE_PATH_UNSAFE", Err: errors.New("unsafe source-relative archive path")}
	}
	name := "appvar/" + relative
	if directory {
		name += "/"
	}
	return name, nil
}

func safeInternalZipName(value string) bool {
	return value != "" && !strings.HasPrefix(value, "/") && path.Clean(value) == value && value != ".." && !strings.HasPrefix(value, "../")
}

func compressionMethod(relative string) uint16 {
	switch strings.ToLower(filepath.Ext(relative)) {
	case ".zip", ".gz", ".zst", ".bz2", ".xz", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp3", ".mp4", ".mov", ".avi":
		return zip.Store
	default:
		return zip.Deflate
	}
}

func archiveSourceBytes(plan probe.Plan) int64 {
	var total int64
	for _, entry := range plan.Files {
		total += entry.Info.Size()
	}
	for _, entry := range plan.SQLite {
		total += entry.Info.Size()
	}
	return total
}

func consistency(plan probe.Plan) string {
	if len(plan.SQLite) > 0 {
		return "sqlite-online-backup-and-file-level-strict"
	}
	return "file-level-strict"
}

func dereferenceTime(value *time.Time, fallback time.Time) time.Time {
	if value == nil {
		return fallback
	}
	return *value
}

func randomID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return prefix + "-" + hex.EncodeToString(bytes), nil
}

func snapshotID(jobID string) string { return "snapshot-" + strings.TrimPrefix(jobID, "backup-") }
func shortID(value string) string {
	value = strings.TrimPrefix(value, "backup-")
	if len(value) > 8 {
		return value[:8]
	}
	return value
}
