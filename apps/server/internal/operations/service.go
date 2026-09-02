// Package operations owns current-tenant operational state used by the
// overview, alerts, settings, audit trail, and real-time event stream.
package operations

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
)

type Service struct {
	store     *persistence.Store
	tenantUID string
	notifier  Notifier
}

// Notifier sends a platform message to the supplied current-tenant user. It
// is optional so local development and platforms without user.notify keep the
// backup and in-app alert flows working.
type Notifier interface {
	Notify(context.Context, string, domain.Notification) error
}

func New(store *persistence.Store, tenantUID string, notifiers ...Notifier) (*Service, error) {
	if store == nil || tenantUID == "" {
		return nil, errors.New("operations store and tenant are required")
	}
	var notifier Notifier
	if len(notifiers) > 0 {
		notifier = notifiers[0]
	}
	return &Service{store: store, tenantUID: tenantUID, notifier: notifier}, nil
}

// ForTenant binds operational reads and writes to the authenticated gateway
// identity. The process startup value is the backup application's deployment
// scope and must not be used as a user tenant for browser requests.
func (s *Service) ForTenant(tenantUID string) *Service {
	clone := *s
	clone.tenantUID = tenantUID
	return &clone
}

func (s *Service) Overview(ctx context.Context) (domain.Overview, error) {
	result, err := s.store.Overview(ctx, s.tenantUID, time.Now().UTC().Add(-24*time.Hour))
	if err != nil {
		return domain.Overview{}, err
	}
	plans, err := s.store.Plans(ctx, s.tenantUID)
	if err != nil {
		return domain.Overview{}, err
	}
	for _, plan := range plans {
		if plan.Enabled && plan.NextRunAt != nil {
			result.NextPlans = append(result.NextPlans, plan)
			if len(result.NextPlans) == 5 {
				break
			}
		}
	}
	result.RecentActivity, err = s.store.Audits(ctx, s.tenantUID, 12)
	return result, err
}

func (s *Service) Settings(ctx context.Context) (domain.Settings, error) {
	return s.store.Settings(ctx, s.tenantUID)
}

func (s *Service) UpdateSettings(ctx context.Context, value domain.Settings, subject string) (domain.Settings, error) {
	if err := validateSettings(value); err != nil {
		return domain.Settings{}, err
	}
	value.UpdatedAt = time.Now().UTC()
	if err := s.store.SaveSettings(ctx, s.tenantUID, value); err != nil {
		return domain.Settings{}, err
	}
	if err := s.Record(ctx, "settings.updated", subject, "settings", "current", map[string]any{"locale": value.Locale, "timezone": value.Timezone}); err != nil {
		return domain.Settings{}, err
	}
	return value, nil
}

func validateSettings(value domain.Settings) error {
	if value.Locale != "zh-CN" && value.Locale != "en-US" {
		return &ValidationError{Code: "INVALID_LOCALE"}
	}
	if _, err := time.LoadLocation(value.Timezone); err != nil {
		return &ValidationError{Code: "INVALID_TIMEZONE"}
	}
	if value.MaxCatchUpSeconds < 60 || value.MaxCatchUpSeconds > int((30*24*time.Hour).Seconds()) {
		return &ValidationError{Code: "INVALID_CATCH_UP_WINDOW"}
	}
	if value.Retry.MaxRetries < 0 || value.Retry.MaxRetries > 8 || value.Retry.BackoffSeconds < 1 || value.Retry.BackoffSeconds > 24*60*60 {
		return &ValidationError{Code: "INVALID_RETRY_POLICY"}
	}
	if value.Retention.KeepLast < 1 || value.Retention.KeepLast > 10000 || value.Retention.KeepDaily < 0 || value.Retention.KeepWeekly < 0 || value.Retention.KeepMonthly < 0 || value.Retention.TrashGraceHours < 1 || value.Retention.TrashGraceHours > 24*365 {
		return &ValidationError{Code: "INVALID_RETENTION_POLICY"}
	}
	return nil
}

func (s *Service) Alerts(ctx context.Context, status string, limit int) ([]domain.Alert, error) {
	return s.store.Alerts(ctx, s.tenantUID, status, limit)
}

func (s *Service) AlertsPage(ctx context.Context, filter domain.AlertFilter) (domain.AlertPage, error) {
	return s.store.AlertsPage(ctx, s.tenantUID, filter)
}

func (s *Service) MarkAlertRead(ctx context.Context, id, subject string) (domain.Alert, error) {
	item, err := s.store.MarkAlertRead(ctx, s.tenantUID, id, time.Now().UTC())
	if err != nil {
		return domain.Alert{}, err
	}
	_ = s.Record(ctx, "alert.read", subject, "alert", id, nil)
	return item, nil
}

func (s *Service) ResolveAlert(ctx context.Context, id, subject string) (domain.Alert, error) {
	item, err := s.store.ResolveAlert(ctx, s.tenantUID, id, time.Now().UTC())
	if err != nil {
		return domain.Alert{}, err
	}
	_ = s.Record(ctx, "alert.resolved", subject, "alert", id, nil)
	return item, nil
}

func (s *Service) MuteAlert(ctx context.Context, id, subject string, duration time.Duration) (domain.Alert, error) {
	if duration <= 0 || duration > 30*24*time.Hour {
		return domain.Alert{}, &ValidationError{Code: "INVALID_MUTE_DURATION"}
	}
	item, err := s.store.MuteAlert(ctx, s.tenantUID, id, time.Now().UTC().Add(duration))
	if err != nil {
		return domain.Alert{}, err
	}
	_ = s.Record(ctx, "alert.muted", subject, "alert", id, map[string]any{"minutes": int(duration.Minutes())})
	return item, nil
}

func (s *Service) CreateAlert(ctx context.Context, level, alertType, code, title, message, referenceType, referenceID string) (domain.Alert, error) {
	now := time.Now().UTC()
	id, err := randomID("alert")
	if err != nil {
		return domain.Alert{}, err
	}
	item := domain.Alert{ID: id, TenantUID: s.tenantUID, Level: level, Type: alertType, Code: code, Title: title, Message: message, ReferenceType: referenceType, ReferenceID: referenceID, Status: "OPEN", CreatedAt: now, UpdatedAt: now}
	if err := s.store.CreateAlert(ctx, item); err != nil {
		return domain.Alert{}, err
	}
	_ = s.Publish(ctx, "alert.created", map[string]string{"alertId": item.ID, "level": item.Level, "code": item.Code})
	return item, nil
}

func (s *Service) Audits(ctx context.Context, limit int) ([]domain.AuditEntry, error) {
	return s.store.Audits(ctx, s.tenantUID, limit)
}

func (s *Service) AuditsPage(ctx context.Context, cursor string, limit int) (domain.AuditPage, error) {
	return s.store.AuditsPage(ctx, s.tenantUID, cursor, limit)
}

func (s *Service) Record(ctx context.Context, action, subject, entityType, entityID string, metadata any) error {
	value := ""
	if metadata != nil {
		encoded, err := json.Marshal(metadata)
		if err != nil {
			return err
		}
		value = string(encoded)
	}
	id, err := randomID("audit")
	if err != nil {
		return err
	}
	if err := s.store.AppendAudit(ctx, domain.AuditEntry{ID: id, TenantUID: s.tenantUID, Action: action, Subject: subject, EntityType: entityType, EntityID: entityID, Metadata: value, CreatedAt: time.Now().UTC()}); err != nil {
		return err
	}
	return s.Publish(ctx, "audit.created", map[string]string{"action": action, "entityType": entityType, "entityId": entityID})
}

func (s *Service) Publish(ctx context.Context, eventType string, data any) error {
	encoded, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = s.store.AppendEvent(ctx, s.tenantUID, eventType, string(encoded), time.Now().UTC())
	return err
}

func (s *Service) EventsAfter(ctx context.Context, after int64) ([]domain.Event, error) {
	return s.store.EventsAfter(ctx, s.tenantUID, after, 100)
}

func (s *Service) LatestEventID(ctx context.Context) (int64, error) {
	return s.store.LatestEventID(ctx, s.tenantUID)
}

func (s *Service) TaskUpdated(ctx context.Context, task domain.BackupTask) {
	scoped := s
	if tenantUID := strings.TrimSpace(task.TenantUID); tenantUID != "" && tenantUID != s.tenantUID {
		scoped = s.ForTenant(tenantUID)
	}
	_ = scoped.Publish(ctx, "task.updated", map[string]string{
		"taskId":          task.ID,
		"batchId":         task.BatchID,
		"status":          task.Status,
		"appid":           task.AppID,
		"deployId":        task.DeployID,
		"applicationName": task.ApplicationName,
	})
	if task.Status == "SUCCEEDED" || task.Status == "SUCCEEDED_WITH_WARNINGS" || task.Status == "FAILED" || task.Status == "TIMED_OUT" || task.Status == "CANCELLED" || task.Status == "SKIPPED" {
		_ = scoped.Record(ctx, "task."+strings.ToLower(task.Status), "", "task", task.ID, map[string]string{"status": task.Status, "code": task.ErrorCode})
	}
	if task.Status == "SUCCEEDED" || task.Status == "SUCCEEDED_WITH_WARNINGS" {
		scoped.notifyTask(ctx, task, true)
	}
	if task.Status == "FAILED" || task.Status == "TIMED_OUT" {
		scoped.notifyTask(ctx, task, false)
		_, _ = scoped.CreateAlert(ctx, "WARNING", "TASK_FAILURE", task.ErrorCode, "备份任务未完成", "备份任务失败，可查看任务详情后重试。", "task", task.ID)
	}
}

func (s *Service) notifyTask(ctx context.Context, task domain.BackupTask, succeeded bool) {
	if s.notifier == nil {
		return
	}
	settings, err := s.Settings(ctx)
	if err != nil {
		slog.Warn("read notification settings", "error", err)
		return
	}
	if (succeeded && !settings.NotifySuccess) || (!succeeded && !settings.NotifyFirstFailure) {
		return
	}
	name := strings.TrimSpace(task.ApplicationName)
	if name == "" {
		name = strings.TrimSpace(task.AppID)
	}
	if name == "" {
		name = task.DeployID
	}
	status := task.Status
	title, content := "备份成功", fmt.Sprintf("应用「%s」的备份已完成。", name)
	if !succeeded {
		title = "备份失败"
		content = fmt.Sprintf("应用「%s」的备份未完成，请查看任务详情。", name)
	}
	meta, err := json.Marshal(map[string]string{
		"taskId": task.ID, "batchId": task.BatchID, "deployId": task.DeployID,
		"appid": task.AppID, "status": status,
	})
	if err != nil {
		slog.Warn("encode notification metadata", "error", err)
		return
	}
	if err := s.notifier.Notify(ctx, s.tenantUID, domain.Notification{Title: title, Content: content, Meta: string(meta)}); err != nil {
		// user.notify is optional. A denied/unavailable platform message must
		// never turn an already committed backup result into a failed task.
		slog.Warn("send platform notification", "error", err)
	}
}

func (s *Service) BatchUpdated(ctx context.Context, batch domain.BackupBatch) {
	scoped := s
	if tenantUID := strings.TrimSpace(batch.TenantUID); tenantUID != "" && tenantUID != s.tenantUID {
		scoped = s.ForTenant(tenantUID)
	}
	_ = scoped.Publish(ctx, "batch.updated", map[string]string{"batchId": batch.ID, "status": batch.Status})
}

type ValidationError struct{ Code string }

func (e *ValidationError) Error() string { return e.Code }

func randomID(prefix string) (string, error) {
	bytes := make([]byte, 12)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%s", strings.TrimSpace(prefix), hex.EncodeToString(bytes)), nil
}
