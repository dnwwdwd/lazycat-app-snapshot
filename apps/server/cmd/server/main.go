package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"cloud.lazycat.app.backup/apps/server/internal/auth"
	"cloud.lazycat.app.backup/apps/server/internal/backup"
	"cloud.lazycat.app.backup/apps/server/internal/catalog"
	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/httpapi"
	"cloud.lazycat.app.backup/apps/server/internal/operations"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"cloud.lazycat.app.backup/apps/server/internal/plans"
	"cloud.lazycat.app.backup/apps/server/internal/platform"
	"cloud.lazycat.app.backup/apps/server/internal/queue"
	"cloud.lazycat.app.backup/apps/server/internal/scheduler"
	"cloud.lazycat.app.backup/apps/server/internal/snapshots"
	"cloud.lazycat.app.backup/apps/server/internal/source"
)

type config struct {
	TenantUID      string
	BackupAppID    string
	ControlDB      string
	WebRoot        string
	AppvarRoot     string
	AppvarLayout   string
	DocumentRoot   string
	CacheRoot      string
	FixtureCatalog string
	OIDC           auth.Config
}

func value(name string) string {
	result := strings.TrimSpace(os.Getenv(name))
	if strings.HasPrefix(result, "${") && strings.HasSuffix(result, "}") {
		return ""
	}
	return result
}

func loadConfig() config {
	tenant := value("BACKUP_APP_DEPLOY_UID")
	if tenant == "" {
		tenant = value("LAZYCAT_APP_DEPLOY_UID")
	}
	controlDB := value("BACKUP_CONTROL_DB")
	if controlDB == "" {
		controlDB = "/lzcapp/var/backup.sqlite"
	}
	webRoot := value("BACKUP_WEB_ROOT")
	if webRoot == "" {
		webRoot = "/lzcapp/pkg/content/web"
	}
	appvarRoot := value("BACKUP_APPVAR_ROOT")
	if appvarRoot == "" {
		appvarRoot = source.RuntimeAppvarRoot
	}
	return config{
		TenantUID: tenant, BackupAppID: value("LAZYCAT_APP_ID"), ControlDB: controlDB, WebRoot: webRoot, AppvarRoot: appvarRoot,
		AppvarLayout: value("BACKUP_APPVAR_LAYOUT"), FixtureCatalog: value("BACKUP_APPLICATIONS_FILE"), DocumentRoot: documentRoot(), CacheRoot: cacheRoot(),
		OIDC: auth.Config{TransactionScope: tenant, ClientID: value("OIDC_CLIENT_ID"), ClientSecret: value("OIDC_CLIENT_SECRET"), IssuerURL: value("OIDC_ISSUER_URI"), AuthURL: value("OIDC_AUTH_URI"), TokenURL: value("OIDC_TOKEN_URI"), UserInfoURL: value("OIDC_USERINFO_URI")},
	}
}

func documentRoot() string {
	if root := value("BACKUP_DOCUMENT_ROOT"); root != "" {
		return root
	}
	return "/lzcapp/document"
}

func cacheRoot() string {
	if root := value("BACKUP_CACHE_ROOT"); root != "" {
		return root
	}
	return "/lzcapp/cache/jobs"
}

func main() {
	config := loadConfig()
	if config.TenantUID == "" {
		slog.Error("backup tenant identity is not configured")
		os.Exit(1)
	}
	if config.AppvarLayout != "" && config.AppvarLayout != "appid" {
		slog.Error("unsupported appvar layout", "layout", config.AppvarLayout)
		os.Exit(1)
	}
	store, err := persistence.Open(config.ControlDB)
	if err != nil {
		slog.Error("open control database", "error", err)
		os.Exit(1)
	}
	defer store.Close()
	manager, err := auth.New(context.Background(), store, config.OIDC)
	if err != nil {
		slog.Error("configure OIDC", "error", err)
		os.Exit(1)
	}
	var provider platform.Catalog = platform.SDKCatalog{}
	if config.FixtureCatalog != "" {
		if value("DEV_MODE") != "1" {
			slog.Error("fixture catalog requires DEV_MODE=1")
			os.Exit(1)
		}
		provider = platform.FixtureCatalog{Path: config.FixtureCatalog}
	}
	service := catalog.New(store, provider, source.Resolver{Root: config.AppvarRoot, AllowNonstandardRoot: value("DEV_MODE") == "1"}, config.TenantUID, config.BackupAppID, 4)
	backupService, err := backup.New(store, source.Resolver{Root: config.AppvarRoot, AllowNonstandardRoot: value("DEV_MODE") == "1"}, backup.Config{TenantUID: config.TenantUID, DocumentRoot: config.DocumentRoot, CacheRoot: config.CacheRoot, ManagedByQueue: true})
	if err != nil {
		slog.Error("configure backup engine", "error", err)
		os.Exit(1)
	}
	snapshotService, err := snapshots.New(store, config.DocumentRoot, config.TenantUID)
	if err != nil {
		slog.Error("configure backup library", "error", err)
		os.Exit(1)
	}
	operationsService, err := operations.New(store, config.TenantUID)
	if err != nil {
		slog.Error("configure operations service", "error", err)
		os.Exit(1)
	}
	queueService, err := queue.New(store, backupService, queue.Config{TenantUID: config.TenantUID, OnTaskUpdated: operationsService.TaskUpdated, OnBatchUpdated: operationsService.BatchUpdated, OnScopeInvalid: func(ctx context.Context, reason domain.PlanPauseReason) {
		_ = operationsService.Record(ctx, "plan.scope_paused", "", "plan", reason.DeployID, reason)
		_, _ = operationsService.CreateAlert(ctx, "WARNING", "PLAN_SCOPE_INVALID", reason.Code, "备份计划已暂停", "所选目录或文件已删除、移动或类型变化，请重新选择范围后保存计划。", "application", reason.DeployID)
	}})
	if err != nil {
		slog.Error("configure persistent backup queue", "error", err)
		os.Exit(1)
	}
	planService, err := plans.New(store, queueService, config.TenantUID)
	if err != nil {
		slog.Error("configure backup plans", "error", err)
		os.Exit(1)
	}
	scheduler.New(planService, 0).Start(context.Background())
	service.StartSync(context.Background())
	server := &http.Server{Addr: ":8080", Handler: httpapi.New(manager, service, filepath.Clean(config.WebRoot), backupService).SetPhase4(planService, queueService, snapshotService).SetPhase5(operationsService).Handler()}
	slog.Info("starting backup V1 server", "address", server.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
