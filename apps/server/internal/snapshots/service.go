// Package snapshots provides current-tenant backup-library operations. It
// only receives snapshot IDs and safe storage metadata from the control DB.
package snapshots

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/storage"
)

type Service struct {
	store     *persistence.Store
	storage   *storage.Store
	tenantUID string
}

func New(store *persistence.Store, documentRoot, tenantUID string) (*Service, error) {
	if store == nil || tenantUID == "" {
		return nil, errors.New("snapshot store and tenant are required")
	}
	fileStore, err := storage.New(documentRoot)
	if err != nil {
		return nil, err
	}
	return &Service{store: store, storage: fileStore, tenantUID: tenantUID}, nil
}

func (s *Service) Files(ctx context.Context, id string) ([]domain.SnapshotFile, error) {
	snapshot, err := s.store.Snapshot(ctx, s.tenantUID, id)
	if err != nil {
		return nil, err
	}
	if snapshot.RetentionStatus == "TRASHED" {
		return nil, domain.ErrNotFound
	}
	items, err := s.storage.FileIndex(storage.Location{Directory: snapshot.StoragePath}, 10000)
	if err != nil {
		return nil, err
	}
	result := make([]domain.SnapshotFile, 0, len(items))
	for _, item := range items {
		result = append(result, domain.SnapshotFile{Path: item.Path, Type: item.Type, Size: item.Size, Modified: item.Modified})
	}
	return result, nil
}

func (s *Service) Verify(ctx context.Context, id string, full bool) (domain.Snapshot, error) {
	snapshot, err := s.store.Snapshot(ctx, s.tenantUID, id)
	if err != nil {
		return domain.Snapshot{}, err
	}
	if snapshot.RetentionStatus == "TRASHED" {
		return domain.Snapshot{}, domain.ErrNotFound
	}
	location := storage.Location{Directory: snapshot.StoragePath}
	if full {
		err = s.storage.FullVerify(location, snapshot.ArchiveSize, snapshot.ArchiveSHA256)
	} else {
		err = s.storage.QuickVerify(location, snapshot.ArchiveSize, snapshot.ArchiveSHA256)
	}
	now := time.Now().UTC()
	if err != nil {
		_ = s.store.SetSnapshotVerification(context.Background(), s.tenantUID, id, "FAILED", now)
		return domain.Snapshot{}, err
	}
	if err := s.store.SetSnapshotVerification(ctx, s.tenantUID, id, "VERIFIED", now); err != nil {
		return domain.Snapshot{}, err
	}
	snapshot.VerificationStatus, snapshot.VerifiedAt = "VERIFIED", &now
	return snapshot, nil
}

func (s *Service) Export(ctx context.Context, id string) (string, error) {
	snapshot, err := s.store.Snapshot(ctx, s.tenantUID, id)
	if err != nil {
		return "", err
	}
	if snapshot.RetentionStatus == "TRASHED" {
		return "", domain.ErrNotFound
	}
	if err := s.storage.QuickVerify(storage.Location{Directory: snapshot.StoragePath}, snapshot.ArchiveSize, snapshot.ArchiveSHA256); err != nil {
		return "", err
	}
	return s.storage.ExportData(storage.Location{Directory: snapshot.StoragePath}, "export-"+id)
}

func (s *Service) Delete(ctx context.Context, id string) (domain.Snapshot, error) {
	snapshot, err := s.store.Snapshot(ctx, s.tenantUID, id)
	if err != nil {
		return domain.Snapshot{}, err
	}
	if snapshot.RetentionStatus == "TRASHED" {
		return domain.Snapshot{}, domain.ErrNotFound
	}
	location, err := s.storage.MoveToTrash(storage.Location{Directory: snapshot.StoragePath}, id)
	if err != nil {
		return domain.Snapshot{}, err
	}
	now := time.Now().UTC()
	if err := s.store.MarkSnapshotTrashed(ctx, s.tenantUID, id, location.Directory, now); err != nil {
		return domain.Snapshot{}, err
	}
	snapshot.StoragePath, snapshot.RetentionStatus, snapshot.Status, snapshot.TrashedAt = location.Directory, "TRASHED", "TRASHED", &now
	return snapshot, nil
}

func (s *Service) Summary(ctx context.Context) (domain.StorageSummary, error) {
	items, err := s.store.AllSnapshots(ctx, s.tenantUID)
	if err != nil {
		return domain.StorageSummary{}, err
	}
	count := 0
	missing := 0
	var verifiedAt *time.Time
	for _, item := range items {
		if item.RetentionStatus == "TRASHED" {
			continue
		}
		count++
		if s.storage.LocationStatus(storage.Location{Directory: item.StoragePath}) != "AVAILABLE" {
			missing++
		}
		if item.VerifiedAt != nil && (verifiedAt == nil || item.VerifiedAt.After(*verifiedAt)) {
			stamp := *item.VerifiedAt
			verifiedAt = &stamp
		}
	}
	usage, err := s.storage.Usage()
	if err != nil {
		return domain.StorageSummary{}, err
	}
	// ArchiveBytes is measured from the current user's document directory.
	// The control database's recorded archive_size is historical metadata and
	// must not keep reporting bytes after a cloud file has been removed.
	return domain.StorageSummary{SnapshotCount: count, ArchiveBytes: usage.ArchiveBytes, AvailableBytes: usage.AvailableBytes, PartialCount: usage.PartialCount, TrashCount: usage.TrashCount, MissingCount: missing, LastVerifiedAt: verifiedAt}, nil
}

// Scan verifies current control-library records against the current user's
// document root. It never scans or reconciles source appvar paths.
func (s *Service) Scan(ctx context.Context) (domain.StorageSummary, error) {
	items, err := s.store.AllSnapshots(ctx, s.tenantUID)
	if err != nil {
		return domain.StorageSummary{}, err
	}
	for _, item := range items {
		if item.RetentionStatus == "TRASHED" {
			continue
		}
		if err := s.storage.QuickVerify(storage.Location{Directory: item.StoragePath}, item.ArchiveSize, item.ArchiveSHA256); err != nil {
			_ = s.store.SetSnapshotVerification(context.Background(), s.tenantUID, item.ID, "FAILED", time.Now().UTC())
		}
	}
	return s.Summary(ctx)
}

type CleanupResult struct {
	PartialRemoved int `json:"partialRemoved"`
	TrashRemoved   int `json:"trashRemoved"`
}

func (s *Service) Cleanup(ctx context.Context) (CleanupResult, error) {
	now := time.Now().UTC()
	partial, err := s.storage.RemoveExpiredChildren("_partial", now.Add(-24*time.Hour))
	if err != nil {
		return CleanupResult{}, err
	}
	trash, err := s.storage.RemoveExpiredChildren("_trash", now.Add(-7*24*time.Hour))
	if err != nil {
		return CleanupResult{}, err
	}
	_, _ = s.store.DeleteTrashedBefore(ctx, s.tenantUID, now.Add(-7*24*time.Hour))
	return CleanupResult{PartialRemoved: partial, TrashRemoved: trash}, nil
}

func (s *Service) ApplyRetentionForTask(ctx context.Context, task domain.BackupTask) error {
	if task.PlanID == "" || strings.HasPrefix(task.PlanID, "manual-") {
		return nil
	}
	plan, err := s.store.Plan(ctx, s.tenantUID, task.PlanID)
	if err != nil {
		return err
	}
	return s.ApplyRetention(ctx, plan)
}

func (s *Service) ApplyRetention(ctx context.Context, plan domain.BackupPlan) error {
	items, err := s.store.SnapshotsForPlan(ctx, s.tenantUID, plan.ID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if item.VerificationStatus == "FAILED" {
			return nil
		}
	}
	keep := map[string]bool{}
	verified := ""
	days, weeks, months := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for index, item := range items {
		if index < plan.Retention.KeepLast {
			keep[item.ID] = true
		}
		if item.VerificationStatus == "VERIFIED" && verified == "" {
			verified = item.ID
		}
		stamp := item.CapturedAt.In(time.UTC)
		day := stamp.Format("2006-01-02")
		weekYear, week := stamp.ISOWeek()
		weekKey := fmtKey(weekYear, week)
		month := stamp.Format("2006-01")
		if !days[day] && len(days) < plan.Retention.KeepDaily {
			keep[item.ID] = true
			days[day] = true
		}
		if !weeks[weekKey] && len(weeks) < plan.Retention.KeepWeekly {
			keep[item.ID] = true
			weeks[weekKey] = true
		}
		if !months[month] && len(months) < plan.Retention.KeepMonthly {
			keep[item.ID] = true
			months[month] = true
		}
	}
	if verified != "" {
		keep[verified] = true
	}
	for _, item := range items {
		if keep[item.ID] {
			continue
		}
		if _, err := s.Delete(ctx, item.ID); err != nil {
			return err
		}
	}
	return nil
}

func fmtKey(year, week int) string { return fmt.Sprintf("%04d-%02d", year, week) }
