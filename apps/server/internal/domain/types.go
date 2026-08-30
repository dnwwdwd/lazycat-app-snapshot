package domain

import (
	"errors"
	"time"
)

var (
	ErrNotFound = errors.New("record not found")
	ErrConflict = errors.New("conflicting record")
)

type Role string

const (
	RoleNormal Role = "NORMAL"
	RoleAdmin  Role = "ADMIN"
)

type LoginTransaction struct {
	TenantUID    string
	EntranceUID  string
	EntranceRole Role
	Nonce        string
	Verifier     string
	ReturnTo     string
	RedirectURI  string
	ExpiresAt    time.Time
}

type Session struct {
	Subject    string
	UID        string
	GatewayUID string
	Name       string
	Email      string
	Groups     []string
	Role       Role
	TenantUID  string
	CreatedAt  time.Time
	ExpiresAt  time.Time
}

type DatabaseFinding struct {
	Type      string `json:"type"`
	Path      string `json:"path"`
	Supported bool   `json:"supported"`
	Reason    string `json:"reason,omitempty"`
}

type ApplicationInstance struct {
	TenantUID        string            `json:"-"`
	AppID            string            `json:"appid"`
	Name             string            `json:"name"`
	Version          string            `json:"version,omitempty"`
	Icon             string            `json:"icon,omitempty"`
	DeployID         string            `json:"deployId"`
	MultiInstance    bool              `json:"multiInstance"`
	CapabilityStatus string            `json:"capabilityStatus"`
	ProtectionStatus string            `json:"protectionStatus"`
	ReadOnlyMode     string            `json:"readOnlyMode,omitempty"`
	TotalBytes       int64             `json:"totalBytes"`
	FileCount        int               `json:"fileCount"`
	SQLiteCount      int               `json:"sqliteCount"`
	SkippedCount     int               `json:"skippedCount"`
	DatabaseFindings []DatabaseFinding `json:"databaseFindings,omitempty"`
	LastProbedAt     *time.Time        `json:"lastProbedAt,omitempty"`
	LastSyncedAt     time.Time         `json:"lastSyncedAt"`
	LastBackupAt     *time.Time        `json:"lastBackupAt,omitempty"`
	ProbeErrorCode   string            `json:"probeErrorCode,omitempty"`
}

type ApplicationPage struct {
	Items      []ApplicationInstance `json:"items"`
	NextCursor string                `json:"nextCursor,omitempty"`
}

type ApplicationFilter struct {
	Cursor           string
	Limit            int
	Query            string
	Mode             string
	CapabilityStatus string
	ProtectionStatus string
}

type SyncStatus struct {
	State      string     `json:"state"`
	StartedAt  *time.Time `json:"startedAt,omitempty"`
	FinishedAt *time.Time `json:"finishedAt,omitempty"`
	ErrorCode  string     `json:"errorCode,omitempty"`
}

type BackupJob struct {
	ID                 string      `json:"id"`
	TenantUID          string      `json:"-"`
	OIDCSubject        string      `json:"-"`
	UserRole           Role        `json:"-"`
	AppID              string      `json:"appid"`
	ApplicationName    string      `json:"applicationName"`
	ApplicationVersion string      `json:"applicationVersion,omitempty"`
	DeployID           string      `json:"deployId"`
	MultiInstance      bool        `json:"multiInstance"`
	SharedRiskAccepted bool        `json:"sharedRiskAccepted"`
	Status             string      `json:"status"`
	ErrorCode          string      `json:"errorCode,omitempty"`
	SnapshotID         string      `json:"snapshotId,omitempty"`
	PlanID             string      `json:"planId,omitempty"`
	BatchID            string      `json:"batchId,omitempty"`
	TaskID             string      `json:"taskId,omitempty"`
	TriggerType        string      `json:"triggerType,omitempty"`
	Scope              BackupScope `json:"scope"`
	ScheduledAt        *time.Time  `json:"scheduledAt,omitempty"`
	CreatedAt          time.Time   `json:"createdAt"`
	StartedAt          *time.Time  `json:"startedAt,omitempty"`
	FinishedAt         *time.Time  `json:"finishedAt,omitempty"`
}

type Snapshot struct {
	ID                    string      `json:"id"`
	TenantUID             string      `json:"-"`
	JobID                 string      `json:"jobId"`
	AppID                 string      `json:"appid"`
	ApplicationName       string      `json:"applicationName"`
	ApplicationVersion    string      `json:"applicationVersion,omitempty"`
	DeployID              string      `json:"deployId"`
	MultiInstance         bool        `json:"multiInstance"`
	SharedInstanceWarning bool        `json:"sharedInstanceWarning"`
	Status                string      `json:"status"`
	StoragePath           string      `json:"storagePath"`
	StorageStatus         string      `json:"storageStatus,omitempty"`
	ArchiveName           string      `json:"archiveName"`
	ArchiveSize           int64       `json:"archiveSize"`
	ArchiveSHA256         string      `json:"archiveSha256"`
	OriginalBytes         int64       `json:"originalBytes"`
	FileCount             int         `json:"fileCount"`
	DirectoryCount        int         `json:"directoryCount"`
	SQLiteCount           int         `json:"sqliteCount"`
	SkippedCount          int         `json:"skippedCount"`
	WarningCount          int         `json:"warningCount"`
	CapturedAt            time.Time   `json:"capturedAt"`
	FinishedAt            time.Time   `json:"finishedAt"`
	VerificationStatus    string      `json:"verificationStatus"`
	VerifiedAt            *time.Time  `json:"verifiedAt,omitempty"`
	PlanID                string      `json:"planId,omitempty"`
	BatchID               string      `json:"batchId,omitempty"`
	TaskID                string      `json:"taskId,omitempty"`
	TriggerType           string      `json:"triggerType,omitempty"`
	RetentionStatus       string      `json:"retentionStatus"`
	Scope                 BackupScope `json:"scope"`
	TrashedAt             *time.Time  `json:"trashedAt,omitempty"`
}

type RetentionPolicy struct {
	KeepLast        int `json:"keepLast"`
	KeepDaily       int `json:"keepDaily"`
	KeepWeekly      int `json:"keepWeekly"`
	KeepMonthly     int `json:"keepMonthly"`
	TrashGraceHours int `json:"trashGraceHours"`
}

type RetryPolicy struct {
	MaxRetries     int `json:"maxRetries"`
	BackoffSeconds int `json:"backoffSeconds"`
}

type BackupPlan struct {
	ID                 string           `json:"id"`
	TenantUID          string           `json:"-"`
	Name               string           `json:"name"`
	TargetKind         string           `json:"targetKind"`
	Targets            []PlanTarget     `json:"targets"`
	SharedRiskAccepted bool             `json:"sharedRiskAccepted"`
	ScheduleType       string           `json:"scheduleType"`
	ExecutionTime      string           `json:"executionTime"`
	CronExpression     string           `json:"cronExpression,omitempty"`
	Timezone           string           `json:"timezone"`
	Enabled            bool             `json:"enabled"`
	CatchUp            bool             `json:"catchUp"`
	MaxCatchUpSeconds  int              `json:"maxCatchUpSeconds"`
	Retry              RetryPolicy      `json:"retry"`
	Retention          RetentionPolicy  `json:"retention"`
	CreatedBySubject   string           `json:"-"`
	CreatedAt          time.Time        `json:"createdAt"`
	UpdatedAt          time.Time        `json:"updatedAt"`
	LastScheduledAt    *time.Time       `json:"lastScheduledAt,omitempty"`
	NextRunAt          *time.Time       `json:"nextRunAt,omitempty"`
	PauseReason        *PlanPauseReason `json:"pauseReason,omitempty"`
}

// BackupScope is an allow-list rooted at the already-authorized appvar. Paths
// are relative only; selecting a directory includes its current descendants.
type BackupScope struct {
	Mode        string   `json:"mode"`
	Directories []string `json:"directories,omitempty"`
	Files       []string `json:"files,omitempty"`
	Revision    int      `json:"revision"`
	Summary     string   `json:"summary,omitempty"`
}

type PlanPauseReason struct {
	Code          string    `json:"code"`
	DeployID      string    `json:"deployId"`
	Path          string    `json:"path,omitempty"`
	Expected      string    `json:"expected,omitempty"`
	DetectedAt    time.Time `json:"detectedAt"`
	ScopeRevision int       `json:"scopeRevision"`
}

type ScopeEntry struct {
	Path       string `json:"path"`
	Type       string `json:"type"`
	Size       int64  `json:"size"`
	SQLite     bool   `json:"sqlite"`
	Selectable bool   `json:"selectable"`
}

type BackupScopeCatalog struct {
	Items      []ScopeEntry `json:"items"`
	NextCursor string       `json:"nextCursor,omitempty"`
}

type PlanTarget struct {
	DeployID           string      `json:"deployId"`
	SharedRiskAccepted bool        `json:"sharedRiskAccepted"`
	Scope              BackupScope `json:"scope"`
}

type PlanInput struct {
	Name               string          `json:"name"`
	TargetKind         string          `json:"targetKind"`
	Targets            []PlanTarget    `json:"targets"`
	SharedRiskAccepted bool            `json:"sharedRiskAccepted"`
	ScheduleType       string          `json:"scheduleType"`
	ExecutionTime      string          `json:"executionTime"`
	CronExpression     string          `json:"cronExpression,omitempty"`
	Timezone           string          `json:"timezone"`
	Enabled            bool            `json:"enabled"`
	CatchUp            bool            `json:"catchUp"`
	MaxCatchUpSeconds  int             `json:"maxCatchUpSeconds"`
	Retry              RetryPolicy     `json:"retry"`
	Retention          RetentionPolicy `json:"retention"`
}

type BackupBatch struct {
	ID          string     `json:"id"`
	TenantUID   string     `json:"-"`
	PlanID      string     `json:"planId,omitempty"`
	PlanName    string     `json:"planName,omitempty"`
	TriggerType string     `json:"triggerType"`
	Status      string     `json:"status"`
	ScheduledAt time.Time  `json:"scheduledAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	StartedAt   *time.Time `json:"startedAt,omitempty"`
	FinishedAt  *time.Time `json:"finishedAt,omitempty"`
	TotalTasks  int        `json:"totalTasks"`
	Succeeded   int        `json:"succeeded"`
	Failed      int        `json:"failed"`
	Skipped     int        `json:"skipped"`
	Running     int        `json:"running"`
	Queued      int        `json:"queued"`
}

type BackupTask struct {
	ID                  string           `json:"id"`
	TenantUID           string           `json:"-"`
	BatchID             string           `json:"batchId"`
	PlanID              string           `json:"planId,omitempty"`
	BackupJobID         string           `json:"backupJobId"`
	AppID               string           `json:"appid"`
	ApplicationName     string           `json:"applicationName"`
	DeployID            string           `json:"deployId"`
	MultiInstance       bool             `json:"multiInstance"`
	SharedRiskAccepted  bool             `json:"sharedRiskAccepted"`
	TriggerType         string           `json:"triggerType"`
	Status              string           `json:"status"`
	Priority            int              `json:"priority"`
	AttemptCount        int              `json:"attemptCount"`
	MaxRetries          int              `json:"maxRetries"`
	RetryBackoffSeconds int              `json:"retryBackoffSeconds"`
	ErrorCode           string           `json:"errorCode,omitempty"`
	AvailableAt         time.Time        `json:"availableAt"`
	ScheduledAt         time.Time        `json:"scheduledAt"`
	CreatedAt           time.Time        `json:"createdAt"`
	StartedAt           *time.Time       `json:"startedAt,omitempty"`
	FinishedAt          *time.Time       `json:"finishedAt,omitempty"`
	LeaseExpiresAt      *time.Time       `json:"leaseExpiresAt,omitempty"`
	HeartbeatAt         *time.Time       `json:"heartbeatAt,omitempty"`
	SnapshotID          string           `json:"snapshotId,omitempty"`
	Scope               BackupScope      `json:"scope"`
	ScopeValidation     *PlanPauseReason `json:"scopeValidation,omitempty"`
}

type TaskAttempt struct {
	ID         string     `json:"id"`
	TaskID     string     `json:"taskId"`
	Attempt    int        `json:"attempt"`
	Status     string     `json:"status"`
	ErrorCode  string     `json:"errorCode,omitempty"`
	StartedAt  time.Time  `json:"startedAt"`
	FinishedAt *time.Time `json:"finishedAt,omitempty"`
}

type TaskFilter struct {
	Limit   int
	Status  string
	BatchID string
}

type SnapshotFile struct {
	Path     string    `json:"path"`
	Type     string    `json:"type"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

type StorageSummary struct {
	SnapshotCount  int        `json:"snapshotCount"`
	ArchiveBytes   int64      `json:"archiveBytes"`
	AvailableBytes int64      `json:"availableBytes"`
	PartialCount   int        `json:"partialCount"`
	TrashCount     int        `json:"trashCount"`
	MissingCount   int        `json:"missingCount"`
	LastVerifiedAt *time.Time `json:"lastVerifiedAt,omitempty"`
}

// Settings contains only current-tenant defaults that are already enforced by
// the service or are safe to present in the UI. It deliberately has no path,
// tenant-selection, credential, or privilege fields.
type Settings struct {
	Locale             string          `json:"locale"`
	Timezone           string          `json:"timezone"`
	CatchUp            bool            `json:"catchUp"`
	MaxCatchUpSeconds  int             `json:"maxCatchUpSeconds"`
	Retry              RetryPolicy     `json:"retry"`
	Retention          RetentionPolicy `json:"retention"`
	NotifyFirstFailure bool            `json:"notifyFirstFailure"`
	NotifySuccess      bool            `json:"notifySuccess"`
	UpdatedAt          time.Time       `json:"updatedAt"`
}

type Alert struct {
	ID            string     `json:"id"`
	TenantUID     string     `json:"-"`
	Level         string     `json:"level"`
	Type          string     `json:"type"`
	Code          string     `json:"code"`
	Title         string     `json:"title"`
	Message       string     `json:"message"`
	ReferenceType string     `json:"referenceType,omitempty"`
	ReferenceID   string     `json:"referenceId,omitempty"`
	Status        string     `json:"status"`
	ReadAt        *time.Time `json:"readAt,omitempty"`
	ResolvedAt    *time.Time `json:"resolvedAt,omitempty"`
	MutedUntil    *time.Time `json:"mutedUntil,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

type AuditEntry struct {
	ID         string    `json:"id"`
	TenantUID  string    `json:"-"`
	Action     string    `json:"action"`
	Subject    string    `json:"subject,omitempty"`
	EntityType string    `json:"entityType,omitempty"`
	EntityID   string    `json:"entityId,omitempty"`
	Metadata   string    `json:"metadata,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

type Event struct {
	ID        int64     `json:"id"`
	TenantUID string    `json:"-"`
	Type      string    `json:"type"`
	Data      string    `json:"data"`
	CreatedAt time.Time `json:"createdAt"`
}

type Overview struct {
	ApplicationCount int            `json:"applicationCount"`
	BackupableCount  int            `json:"backupableCount"`
	ProtectedCount   int            `json:"protectedCount"`
	UnprotectedCount int            `json:"unprotectedCount"`
	UnsupportedCount int            `json:"unsupportedCount"`
	NoDataCount      int            `json:"noDataCount"`
	QueuedTasks      int            `json:"queuedTasks"`
	RunningTasks     int            `json:"runningTasks"`
	Succeeded24h     int            `json:"succeeded24h"`
	Failed24h        int            `json:"failed24h"`
	UnreadAlerts     int            `json:"unreadAlerts"`
	Storage          StorageSummary `json:"storage"`
	NextPlans        []BackupPlan   `json:"nextPlans"`
	RecentActivity   []AuditEntry   `json:"recentActivity"`
}
