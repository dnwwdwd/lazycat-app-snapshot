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

func (s *Server) deletePlan(w http.ResponseWriter, r *http.Request) {
	if s.plans == nil {
		phase4Unavailable(w, r)
		return
	}
	if err := s.plans.Delete(r.Context(), chi.URLParam(r, "planID")); err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "plan.deleted", "plan", chi.URLParam(r, "planID"))
	w.WriteHeader(http.StatusNoContent)
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
	limit, ok := listLimit(w, r, 100)
	if !ok {
		return
	}
	items, err := s.queue.Batches(r.Context(), limit)
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
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
	items, err := s.queue.Tasks(r.Context(), domain.TaskFilter{Limit: limit, Status: r.URL.Query().Get("status"), BatchID: r.URL.Query().Get("batch_id")})
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
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

func (s *Server) deleteSnapshot(w http.ResponseWriter, r *http.Request) {
	if s.snapshots == nil {
		phase4Unavailable(w, r)
		return
	}
	item, err := s.snapshots.Delete(r.Context(), chi.URLParam(r, "snapshotID"))
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "snapshot.trashed", "snapshot", item.ID)
	if s.operations != nil {
		_ = s.operations.Publish(r.Context(), "snapshot.updated", map[string]string{"snapshotId": item.ID, "status": item.Status})
	}
	writeJSON(w, http.StatusOK, item)
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
		_ = s.operations.Publish(r.Context(), "storage.updated", map[string]string{"action": "scan"})
	}
	writeJSON(w, http.StatusOK, value)
}

func (s *Server) cleanupStorage(w http.ResponseWriter, r *http.Request) {
	if s.snapshots == nil {
		phase4Unavailable(w, r)
		return
	}
	value, err := s.snapshots.Cleanup(r.Context())
	if err != nil {
		phase4Error(w, r, err)
		return
	}
	s.auditRequest(r, "storage.cleaned", "storage", "current")
	if s.operations != nil {
		_ = s.operations.Publish(r.Context(), "storage.updated", map[string]string{"action": "cleanup"})
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
