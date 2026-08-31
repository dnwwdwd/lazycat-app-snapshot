package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"cloud.lazycat.app.backup/apps/server/internal/auth"
	"cloud.lazycat.app.backup/apps/server/internal/backup"
	"cloud.lazycat.app.backup/apps/server/internal/catalog"
	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/operations"
	"cloud.lazycat.app.backup/apps/server/internal/plans"
	"cloud.lazycat.app.backup/apps/server/internal/queue"
	"cloud.lazycat.app.backup/apps/server/internal/snapshots"
	"github.com/go-chi/chi/v5"
)

type Server struct {
	auth       *auth.Manager
	catalog    *catalog.Service
	backups    *backup.Service
	plans      *plans.Service
	queue      *queue.Service
	snapshots  *snapshots.Service
	operations *operations.Service
	staticRoot string
}

// SetPhase4 wires the persisted schedule, queue and backup-library services
// while preserving the phase-3 constructor used by focused tests.
func (s *Server) SetPhase4(planService *plans.Service, queueService *queue.Service, snapshotService *snapshots.Service) *Server {
	s.plans, s.queue, s.snapshots = planService, queueService, snapshotService
	return s
}

// SetPhase5 wires current-tenant operational state while leaving older
// constructor call sites usable in focused compilation environments.
func (s *Server) SetPhase5(operationsService *operations.Service) *Server {
	s.operations = operationsService
	return s
}

func New(authManager *auth.Manager, catalogService *catalog.Service, staticRoot string, backupServices ...*backup.Service) *Server {
	server := &Server{auth: authManager, catalog: catalogService, staticRoot: staticRoot}
	if len(backupServices) > 0 {
		server.backups = backupServices[0]
	}
	return server
}

func (s *Server) Handler() http.Handler {
	router := chi.NewRouter()
	router.Use(requestID)
	router.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	router.Get("/assets/lzc-icon.png", s.loginIcon)
	router.Get("/auth/login", s.loginPage)
	router.Post("/auth/login", s.login)
	router.Get("/auth/oidc/callback", s.callback)
	router.Get("/auth/error", s.authError)
	router.Group(func(r chi.Router) {
		r.Use(s.requireAPI)
		r.Get("/api/session", s.session)
		r.Post("/auth/logout", s.logout)
		r.Get("/api/applications", s.listApplications)
		r.Post("/api/applications/sync", s.syncApplications)
		r.Get("/api/applications/{appid}", s.application)
		r.Get("/api/instances/{deployID}", s.instance)
		r.Get("/api/instances/{deployID}/backup-scope", s.backupScope)
		r.Post("/api/instances/{deployID}/probe", s.probeInstance)
		r.Post("/api/instances/{deployID}/backup", s.startBackup)
		r.Get("/api/backup-jobs/{jobID}", s.backupJob)
		r.Get("/api/backups", s.listBackups)
		r.Get("/api/backups/{snapshotID}", s.snapshot)
		r.Post("/api/backups/{snapshotID}/verify", s.verifySnapshot)
		r.Get("/api/plans", s.listPlans)
		r.Post("/api/plans", s.createPlan)
		r.Get("/api/plans/{planID}", s.plan)
		r.Put("/api/plans/{planID}", s.updatePlan)
		r.Post("/api/plans/{planID}/run", s.runPlan)
		r.Post("/api/plans/{planID}/pause", s.pausePlan)
		r.Post("/api/plans/{planID}/resume", s.resumePlan)
		r.Get("/api/batches", s.listBatches)
		r.Get("/api/batches/{batchID}", s.batch)
		r.Get("/api/tasks", s.listTasks)
		r.Get("/api/tasks/{taskID}", s.task)
		r.Post("/api/tasks/{taskID}/cancel", s.cancelTask)
		r.Post("/api/tasks/{taskID}/retry", s.retryTask)
		r.Get("/api/backups/{snapshotID}/files", s.snapshotFiles)
		r.Post("/api/backups/{snapshotID}/export", s.exportSnapshot)
		r.Get("/api/storage", s.storageSummary)
		r.Post("/api/storage/scan", s.scanStorage)
		r.Get("/api/overview", s.overview)
		r.Get("/api/alerts", s.listAlerts)
		r.Post("/api/alerts/{alertID}/read", s.readAlert)
		r.Post("/api/alerts/{alertID}/resolve", s.resolveAlert)
		r.Post("/api/alerts/{alertID}/mute", s.muteAlert)
		r.Get("/api/settings", s.settings)
		r.Put("/api/settings", s.updateSettings)
		r.Get("/api/audit", s.audit)
		r.Get("/api/events", s.events)
	})
	router.Handle("/*", s.requireBrowser(http.HandlerFunc(s.static)))
	return router
}

type contextKey string

const sessionKey contextKey = "session"

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bytes := make([]byte, 8)
		_, _ = rand.Read(bytes)
		id := hex.EncodeToString(bytes)
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey("requestID"), id)))
	})
}
func requestIDFrom(ctx context.Context) string {
	value, _ := ctx.Value(contextKey("requestID")).(string)
	return value
}

func (s *Server) requireAPI(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, err := s.auth.Session(r.Context(), r)
		if err == nil {
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey, session)))
			return
		}
		if errors.Is(err, auth.ErrIdentityMismatch) {
			auth.ClearSessionCookie(w)
			errorJSON(w, r, http.StatusForbidden, "IDENTITY_MISMATCH", "当前登录会话与懒猫账号不一致")
			return
		}
		if errors.Is(err, auth.ErrSessionRequired) {
			errorJSON(w, r, http.StatusUnauthorized, "SESSION_REQUIRED", "登录会话已失效")
			return
		}
		errorJSON(w, r, http.StatusInternalServerError, "SESSION_LOOKUP_FAILED", "无法读取登录会话")
	})
}

func (s *Server) requireBrowser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := s.auth.Session(r.Context(), r); err == nil {
			next.ServeHTTP(w, r)
			return
		} else if errors.Is(err, auth.ErrIdentityMismatch) {
			auth.ClearSessionCookie(w)
			http.Redirect(w, r, "/auth/login?reason=identity_mismatch&return_to=/", http.StatusSeeOther)
			return
		}
		returnTo := r.URL.RequestURI()
		if returnTo == "" {
			returnTo = "/"
		}
		http.Redirect(w, r, "/auth/login?return_to="+url.QueryEscape(returnTo), http.StatusFound)
	})
}

func (s *Server) loginPage(w http.ResponseWriter, r *http.Request) {
	if _, err := s.auth.Session(r.Context(), r); err == nil {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	reason := r.URL.Query().Get("reason")
	returnTo := r.URL.Query().Get("return_to")
	if returnTo == "" || !strings.HasPrefix(returnTo, "/") || strings.HasPrefix(returnTo, "//") {
		returnTo = "/"
	}
	s.renderLoginPage(w, r, reason, returnTo)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		s.authErrorCode(w, r, http.StatusBadRequest, "OIDC_LOGIN_INVALID", "登录请求无效")
		return
	}
	redirectURI := externalURL(r, "/auth/oidc/callback")
	location, err := s.auth.LoginURLWithRole(r.Context(), r.Header.Get("X-HC-User-ID"), r.Header.Get("X-HC-User-Role"), redirectURI, r.Form.Get("return_to"))
	if errors.Is(err, auth.ErrIdentityMismatch) {
		s.authErrorCode(w, r, http.StatusForbidden, "IDENTITY_MISMATCH", "当前登录会话与懒猫账号不一致")
		return
	}
	if err != nil {
		s.authErrorCode(w, r, http.StatusServiceUnavailable, "OIDC_LOGIN_UNAVAILABLE", "OIDC 登录服务暂不可用")
		return
	}
	http.Redirect(w, r, location, http.StatusFound)
}

func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	if providerError := r.URL.Query().Get("error"); providerError != "" {
		s.authErrorCode(w, r, http.StatusBadRequest, "OIDC_CALLBACK_FAILED", "OIDC 授权未完成")
		return
	}
	session, rawID, _, err := s.auth.CompleteLogin(r.Context(), r.Header.Get("X-HC-User-ID"), r.Header.Get("X-HC-User-Role"), r.URL.Query().Get("state"), r.URL.Query().Get("code"))
	if errors.Is(err, auth.ErrIdentityMismatch) {
		s.authErrorCode(w, r, http.StatusForbidden, "IDENTITY_MISMATCH", "当前登录会话与懒猫账号不一致")
		return
	}
	if errors.Is(err, domain.ErrNotFound) {
		s.authErrorCode(w, r, http.StatusBadRequest, "OIDC_STATE_INVALID", "登录请求已过期，请重新登录")
		return
	}
	if err != nil {
		s.authErrorCode(w, r, http.StatusBadRequest, "OIDC_CALLBACK_FAILED", "OIDC 登录验证失败")
		return
	}
	auth.SetSessionCookie(w, rawID, session.ExpiresAt)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (s *Server) authError(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		code = "OIDC_CALLBACK_FAILED"
	}
	s.renderAuthError(w, http.StatusBadRequest, code, "登录验证失败")
}
func templateEscape(value string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;").Replace(value)
}
func (s *Server) authErrorCode(w http.ResponseWriter, _ *http.Request, status int, code, message string) {
	s.renderAuthError(w, status, code, message)
}
func (s *Server) renderAuthError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte("<!doctype html><title>登录失败</title><p>" + templateEscape(message) + "：" + templateEscape(code) + "</p><a href=\"/auth/login\">重新登录</a>"))
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	current := r.Context().Value(sessionKey).(domain.Session)
	writeJSON(w, http.StatusOK, map[string]any{"uid": current.UID, "subject": current.Subject, "displayName": current.Name, "email": current.Email, "role": current.Role, "tenantUid": current.TenantUID, "expiresAt": current.ExpiresAt, "identityVerified": true})
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	s.auth.Logout(r.Context(), r)
	auth.ClearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listApplications(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 200 {
			errorJSON(w, r, http.StatusBadRequest, "INVALID_LIMIT", "limit 必须在 1 到 200 之间")
			return
		}
		limit = value
	}
	filter := domain.ApplicationFilter{Cursor: r.URL.Query().Get("cursor"), Limit: limit, Query: r.URL.Query().Get("q"), Mode: r.URL.Query().Get("mode"), CapabilityStatus: r.URL.Query().Get("capability_status"), ProtectionStatus: r.URL.Query().Get("protection_status")}
	if filter.Mode != "" && filter.Mode != "single" && filter.Mode != "multi" {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_MODE", "实例模式无效")
		return
	}
	page, err := s.catalog.List(r.Context(), filter)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidCursor) {
			errorJSON(w, r, http.StatusBadRequest, "INVALID_CURSOR", "分页游标无效")
		} else {
			errorJSON(w, r, http.StatusServiceUnavailable, "APPLICATION_CATALOG_UNAVAILABLE", "应用目录暂时不可用")
		}
		return
	}
	syncStatus, err := s.catalog.SyncStatus(r.Context())
	if err != nil {
		errorJSON(w, r, http.StatusInternalServerError, "SYNC_STATUS_UNAVAILABLE", "无法读取同步状态")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": page.Items, "nextCursor": page.NextCursor, "sync": syncStatus})
}
func (s *Server) syncApplications(w http.ResponseWriter, r *http.Request) {
	started := s.catalog.StartSync(r.Context())
	status, _ := s.catalog.SyncStatus(r.Context())
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "started": started, "sync": status})
}
func (s *Server) application(w http.ResponseWriter, r *http.Request) {
	items, err := s.catalog.App(r.Context(), chi.URLParam(r, "appid"))
	if errors.Is(err, domain.ErrNotFound) {
		errorJSON(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "应用不存在")
		return
	}
	if err != nil {
		errorJSON(w, r, http.StatusInternalServerError, "APPLICATION_LOOKUP_FAILED", "无法读取应用")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"appid": items[0].AppID, "name": items[0].Name, "version": items[0].Version, "instances": items})
}
func (s *Server) instance(w http.ResponseWriter, r *http.Request) {
	item, err := s.catalog.Instance(r.Context(), chi.URLParam(r, "deployID"))
	if errors.Is(err, domain.ErrNotFound) {
		errorJSON(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "应用实例不存在")
		return
	}
	if err != nil {
		errorJSON(w, r, http.StatusInternalServerError, "INSTANCE_LOOKUP_FAILED", "无法读取应用实例")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) backupScope(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		phase4Unavailable(w, r)
		return
	}
	limit := 200
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, parseErr := strconv.Atoi(raw)
		if parseErr != nil || value < 1 || value > 200 {
			errorJSON(w, r, http.StatusBadRequest, "INVALID_LIMIT", "limit 必须在 1 到 200 之间")
			return
		}
		limit = value
	}
	value, err := s.backups.ScopeCatalog(r.Context(), chi.URLParam(r, "deployID"), r.URL.Query().Get("q"), r.URL.Query().Get("cursor"), limit)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidCursor) {
			errorJSON(w, r, http.StatusBadRequest, "INVALID_CURSOR", "分页游标无效")
			return
		}
		phase4Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}
func (s *Server) probeInstance(w http.ResponseWriter, r *http.Request) {
	if _, err := s.catalog.Instance(r.Context(), chi.URLParam(r, "deployID")); errors.Is(err, domain.ErrNotFound) {
		errorJSON(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "应用实例不存在")
		return
	} else if err != nil {
		errorJSON(w, r, http.StatusInternalServerError, "INSTANCE_LOOKUP_FAILED", "无法读取应用实例")
		return
	}
	started := s.catalog.StartSync(r.Context())
	status, _ := s.catalog.SyncStatus(r.Context())
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "started": started, "sync": status})
}

type manualBackupRequest struct {
	SharedRiskAccepted bool `json:"sharedRiskAccepted"`
}

func (s *Server) startBackup(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		errorJSON(w, r, http.StatusServiceUnavailable, "BACKUP_ENGINE_UNAVAILABLE", "备份引擎暂时不可用")
		return
	}
	request := manualBackupRequest{}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil && !errors.Is(err, io.EOF) {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_BACKUP_REQUEST", "备份请求无效")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != nil && !errors.Is(err, io.EOF) {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_BACKUP_REQUEST", "备份请求无效")
		return
	}
	current := r.Context().Value(sessionKey).(domain.Session)
	var job domain.BackupJob
	var err error
	enqueueCtx := context.WithoutCancel(r.Context())
	if s.queue != nil {
		job, err = s.queue.StartManual(enqueueCtx, chi.URLParam(r, "deployID"), request.SharedRiskAccepted, current.Subject, current.Role)
	} else {
		job, err = s.backups.StartManual(enqueueCtx, chi.URLParam(r, "deployID"), request.SharedRiskAccepted, current.Subject, current.Role)
	}
	if err != nil {
		s.backupError(w, r, err)
		return
	}
	s.auditRequest(r, "backup.manual_queued", "backup_job", job.ID)
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "job": job})
}

func (s *Server) backupJob(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		errorJSON(w, r, http.StatusServiceUnavailable, "BACKUP_ENGINE_UNAVAILABLE", "备份引擎暂时不可用")
		return
	}
	job, err := s.backups.Job(r.Context(), chi.URLParam(r, "jobID"))
	if err != nil {
		s.backupError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (s *Server) listBackups(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		errorJSON(w, r, http.StatusServiceUnavailable, "BACKUP_ENGINE_UNAVAILABLE", "备份引擎暂时不可用")
		return
	}
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 200 {
			errorJSON(w, r, http.StatusBadRequest, "INVALID_LIMIT", "limit 必须在 1 到 200 之间")
			return
		}
		limit = value
	}
	page, err := s.backups.SnapshotsPage(r.Context(), r.URL.Query().Get("cursor"), limit)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidCursor) {
			errorJSON(w, r, http.StatusBadRequest, "INVALID_CURSOR", "分页游标无效")
			return
		}
		errorJSON(w, r, http.StatusInternalServerError, "BACKUP_LIST_UNAVAILABLE", "无法读取备份快照")
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) snapshot(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		errorJSON(w, r, http.StatusServiceUnavailable, "BACKUP_ENGINE_UNAVAILABLE", "备份引擎暂时不可用")
		return
	}
	item, err := s.backups.Snapshot(r.Context(), chi.URLParam(r, "snapshotID"))
	if err != nil {
		s.backupError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) verifySnapshot(w http.ResponseWriter, r *http.Request) {
	if s.snapshots != nil {
		item, err := s.snapshots.Verify(r.Context(), chi.URLParam(r, "snapshotID"), r.URL.Query().Get("mode") == "full")
		if err != nil {
			if s.operations != nil {
				_, _ = s.operations.CreateAlert(r.Context(), "WARNING", "SNAPSHOT_VERIFICATION", "SNAPSHOT_VERIFICATION_FAILED", "快照校验未通过", "快照校验未完成，请检查网盘状态。", "snapshot", chi.URLParam(r, "snapshotID"))
			}
			phase4Error(w, r, err)
			return
		}
		s.auditRequest(r, "snapshot.verified", "snapshot", item.ID)
		if s.operations != nil {
			_ = s.operations.Publish(r.Context(), "snapshot.updated", map[string]string{"snapshotId": item.ID, "verificationStatus": item.VerificationStatus})
		}
		writeJSON(w, http.StatusOK, item)
		return
	}
	if s.backups == nil {
		errorJSON(w, r, http.StatusServiceUnavailable, "BACKUP_ENGINE_UNAVAILABLE", "备份引擎暂时不可用")
		return
	}
	item, err := s.backups.Verify(r.Context(), chi.URLParam(r, "snapshotID"))
	if err != nil {
		s.backupError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) backupError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, domain.ErrNotFound) {
		errorJSON(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "资源不存在")
		return
	}
	if errors.Is(err, domain.ErrConflict) {
		errorJSON(w, r, http.StatusConflict, "BACKUP_ALREADY_RUNNING", "该实例已有正在进行的备份")
		return
	}
	code := backup.Code(err)
	switch code {
	case "SHARED_INSTANCE_CONFIRMATION_REQUIRED", "INSTANCE_NOT_BACKUPABLE", "NO_APPLICATION_DATA", "UNSUPPORTED_DATABASE", "SNAPSHOT_VERIFICATION_FAILED":
		errorJSON(w, r, http.StatusConflict, code, "当前实例不能完成该备份操作")
	case "BACKUP_QUEUE_FULL":
		errorJSON(w, r, http.StatusTooManyRequests, code, "备份队列暂时繁忙")
	default:
		errorJSON(w, r, http.StatusInternalServerError, code, "备份操作未完成")
	}
}

func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if s.staticRoot == "" {
		http.NotFound(w, r)
		return
	}
	requested := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if requested == "." {
		requested = ""
	}
	if requested != "" && !strings.HasPrefix(requested, ".."+string(filepath.Separator)) {
		candidate := filepath.Join(s.staticRoot, requested)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			http.ServeFile(w, r, candidate)
			return
		}
	}
	index := filepath.Join(s.staticRoot, "index.html")
	if _, err := os.Stat(index); errors.Is(err, fs.ErrNotExist) {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, index)
}

// loginIcon stays public so the unauthenticated OIDC login page can load its
// brand image without being redirected back to the login route.
func (s *Server) loginIcon(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, filepath.Join(s.staticRoot, "assets", "lzc-icon.png"))
}

type errorBody struct {
	Code      string            `json:"code"`
	Message   string            `json:"message"`
	RequestID string            `json:"requestId"`
	Params    map[string]string `json:"params,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func errorJSON(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	writeJSON(w, status, errorBody{Code: code, Message: message, RequestID: requestIDFrom(r.Context())})
}
func externalURL(r *http.Request, path string) string {
	scheme := "https"
	if r.TLS != nil {
		scheme = "https"
	} else if forwarded := strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0]; forwarded == "http" || forwarded == "https" {
		scheme = forwarded
	}
	return scheme + "://" + r.Host + path
}
