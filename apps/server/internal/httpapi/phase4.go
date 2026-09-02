package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/plans"
	"github.com/go-chi/chi/v5"
)

// decoratePlanTargets attaches the current catalog metadata to plan responses.
// Targets are persisted by deploy_id only, so a plan remains stable while the
// display can still use the real application name and icon when the catalog
// page is not currently loaded in the browser.
func (s *Server) decoratePlanTargets(r *http.Request, plan *domain.BackupPlan) {
	if s.catalog == nil || plan == nil {
		return
	}
	catalogService := s.catalogFor(r)
	for index := range plan.Targets {
		instance, err := catalogService.Instance(r.Context(), plan.Targets[index].DeployID)
		if err != nil {
			continue
		}
		plan.Targets[index].AppID = instance.AppID
		plan.Targets[index].ApplicationName = instance.Name
		plan.Targets[index].Icon = instance.Icon
	}
}

func (s *Server) decorateTask(r *http.Request, task *domain.BackupTask) {
	if s.catalog == nil || task == nil {
		return
	}
	instance, err := s.catalogFor(r).Instance(r.Context(), task.DeployID)
	if err != nil {
		return
	}
	task.AppID = instance.AppID
	task.ApplicationName = instance.Name
	task.Icon = instance.Icon
}

func (s *Server) decorateSnapshot(r *http.Request, snapshot *domain.Snapshot) {
	if s.catalog == nil || snapshot == nil {
		return
	}
	instance, err := s.catalogFor(r).Instance(r.Context(), snapshot.DeployID)
	if err != nil {
		return
	}
	snapshot.AppID = instance.AppID
	snapshot.ApplicationName = instance.Name
	snapshot.Icon = instance.Icon
}

func (s *Server) listPlans(w http.ResponseWriter, r *http.Request) {
	if s.plans == nil {
		phase4Unavailable(w, r)
		return
	}
	items, err := s.plans.List(r.Context())
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	for index := range items {
		s.decoratePlanTargets(r, &items[index])
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) createPlan(w http.ResponseWriter, r *http.Request) {
	if s.plans == nil {
		phase4Unavailable(w, r)
		return
	}
	input, ok := decodePlan(w, r)
	if !ok {
		return
	}
	current := r.Context().Value(sessionKey).(domain.Session)
	plan, err := s.plans.Create(r.Context(), input, current.Subject)
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "plan.created", "plan", plan.ID)
	writeJSON(w, http.StatusCreated, plan)
}

func (s *Server) plan(w http.ResponseWriter, r *http.Request) {
	if s.plans == nil {
		phase4Unavailable(w, r)
		return
	}
	plan, err := s.plans.Plan(r.Context(), chi.URLParam(r, "planID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.decoratePlanTargets(r, &plan)
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) updatePlan(w http.ResponseWriter, r *http.Request) {
	if s.plans == nil {
		phase4Unavailable(w, r)
		return
	}
	input, ok := decodePlan(w, r)
	if !ok {
		return
	}
	plan, err := s.plans.Update(r.Context(), chi.URLParam(r, "planID"), input)
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "plan.updated", "plan", plan.ID)
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) runPlan(w http.ResponseWriter, r *http.Request) {
	if s.plans == nil {
		phase4Unavailable(w, r)
		return
	}
	batch, err := s.plans.Run(r.Context(), chi.URLParam(r, "planID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "plan.run_requested", "plan", chi.URLParam(r, "planID"))
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "batch": batch})
}

func (s *Server) pausePlan(w http.ResponseWriter, r *http.Request) {
	if s.plans == nil {
		phase4Unavailable(w, r)
		return
	}
	plan, err := s.plans.Pause(r.Context(), chi.URLParam(r, "planID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "plan.paused", "plan", plan.ID)
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) resumePlan(w http.ResponseWriter, r *http.Request) {
	if s.plans == nil {
		phase4Unavailable(w, r)
		return
	}
	plan, err := s.plans.Resume(r.Context(), chi.URLParam(r, "planID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "plan.resumed", "plan", plan.ID)
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) listBatches(w http.ResponseWriter, r *http.Request) {
	if s.queue == nil {
		phase4Unavailable(w, r)
		return
	}
	limit, ok := listLimit(w, r, 200)
	if !ok {
		return
	}
	page, err := s.queue.BatchesPage(r.Context(), r.URL.Query().Get("cursor"), limit)
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) batch(w http.ResponseWriter, r *http.Request) {
	if s.queue == nil {
		phase4Unavailable(w, r)
		return
	}
	batch, err := s.queue.Batch(r.Context(), chi.URLParam(r, "batchID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, batch)
}

func (s *Server) listTasks(w http.ResponseWriter, r *http.Request) {
	if s.queue == nil {
		phase4Unavailable(w, r)
		return
	}
	limit, ok := listLimit(w, r, 200)
	if !ok {
		return
	}
	page, err := s.queue.TasksPage(r.Context(), domain.TaskFilter{Limit: limit, Cursor: r.URL.Query().Get("cursor"), Status: r.URL.Query().Get("status"), BatchID: r.URL.Query().Get("batch_id"), DeployID: r.URL.Query().Get("deploy_id")})
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	for index := range page.Items {
		s.decorateTask(r, &page.Items[index])
	}
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) task(w http.ResponseWriter, r *http.Request) {
	if s.queue == nil {
		phase4Unavailable(w, r)
		return
	}
	task, attempts, err := s.queue.Task(r.Context(), chi.URLParam(r, "taskID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.decorateTask(r, &task)
	writeJSON(w, http.StatusOK, map[string]any{"task": task, "attempts": attempts})
}

func (s *Server) cancelTask(w http.ResponseWriter, r *http.Request) {
	if s.queue == nil {
		phase4Unavailable(w, r)
		return
	}
	task, err := s.queue.Cancel(r.Context(), chi.URLParam(r, "taskID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "task.cancel_requested", "task", task.ID)
	writeJSON(w, http.StatusOK, task)
}

func (s *Server) retryTask(w http.ResponseWriter, r *http.Request) {
	if s.queue == nil {
		phase4Unavailable(w, r)
		return
	}
	task, err := s.queue.Retry(r.Context(), chi.URLParam(r, "taskID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "task.retry_requested", "task", task.ID)
	writeJSON(w, http.StatusAccepted, task)
}

func (s *Server) snapshotFiles(w http.ResponseWriter, r *http.Request) {
	if s.snapshots == nil {
		phase4Unavailable(w, r)
		return
	}
	items, err := s.snapshots.Files(r.Context(), chi.URLParam(r, "snapshotID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) exportSnapshot(w http.ResponseWriter, r *http.Request) {
	if s.snapshots == nil {
		phase4Unavailable(w, r)
		return
	}
	location, err := s.snapshots.Export(r.Context(), chi.URLParam(r, "snapshotID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "snapshot.exported", "snapshot", chi.URLParam(r, "snapshotID"))
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true, "exportPath": location})
}

func (s *Server) storageSummary(w http.ResponseWriter, r *http.Request) {
	if s.snapshots == nil {
		phase4Unavailable(w, r)
		return
	}
	value, err := s.snapshots.Summary(r.Context())
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

func (s *Server) scanStorage(w http.ResponseWriter, r *http.Request) {
	if s.snapshots == nil {
		phase4Unavailable(w, r)
		return
	}
	value, err := s.snapshots.Scan(r.Context())
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "storage.scanned", "storage", "current")
	if s.operations != nil {
		_ = s.operationsFor(r).Publish(r.Context(), "storage.updated", map[string]string{"action": "scan"})
	}
	writeJSON(w, http.StatusOK, value)
}

func decodePlan(w http.ResponseWriter, r *http.Request) (domain.PlanInput, bool) {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024))
	decoder.DisallowUnknownFields()
	var input domain.PlanInput
	if err := decoder.Decode(&input); err != nil {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_PLAN_REQUEST", "计划配置无效")
		return domain.PlanInput{}, false
	}
	if err := decoder.Decode(&struct{}{}); err != nil && !errors.Is(err, io.EOF) {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_PLAN_REQUEST", "计划配置无效")
		return domain.PlanInput{}, false
	}
	return input, true
}

func listLimit(w http.ResponseWriter, r *http.Request, max int) (int, bool) {
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > max {
			errorJSON(w, r, http.StatusBadRequest, "INVALID_LIMIT", "limit 超出允许范围")
			return 0, false
		}
		limit = value
	}
	return limit, true
}

func phase4Unavailable(w http.ResponseWriter, r *http.Request) {
	errorJSON(w, r, http.StatusServiceUnavailable, "PHASE4_SERVICE_UNAVAILABLE", "任务与备份库服务暂时不可用")
}

func phase4Error(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, domain.ErrInvalidCursor) {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_CURSOR", "分页游标无效")
		return
	}
	if errors.Is(err, domain.ErrNotFound) {
		errorJSON(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "资源不存在")
		return
	}
	if errors.Is(err, domain.ErrConflict) {
		errorJSON(w, r, http.StatusConflict, "OPERATION_CONFLICT", "当前资源状态不允许该操作")
		return
	}
	var validation *plans.ValidationError
	if errors.As(err, &validation) {
		status := http.StatusBadRequest
		if validation.Code == "SHARED_INSTANCE_CONFIRMATION_REQUIRED" || validation.Code == "INSTANCE_NOT_BACKUPABLE" {
			status = http.StatusConflict
		}
		errorJSON(w, r, status, validation.Code, "计划配置不符合当前应用状态")
		return
	}
	errorJSON(w, r, http.StatusInternalServerError, "PHASE4_OPERATION_FAILED", "操作未完成")
}
