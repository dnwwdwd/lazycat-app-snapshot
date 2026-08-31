package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/operations"
	"github.com/go-chi/chi/v5"
)

func (s *Server) overview(w http.ResponseWriter, r *http.Request) {
	if s.operations == nil {
		phase5Unavailable(w, r)
		return
	}
	result, err := s.operations.Overview(r.Context())
	if err != nil {
		phase5Error(w, r, err)
		return
	}
	if s.snapshots != nil {
		if summary, summaryErr := s.snapshots.Summary(r.Context()); summaryErr == nil {
			result.Storage = summary
		}
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) listAlerts(w http.ResponseWriter, r *http.Request) {
	if s.operations == nil {
		phase5Unavailable(w, r)
		return
	}
	status := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("status")))
	if status != "" && status != "ALL" && status != "OPEN" && status != "MUTED" && status != "RESOLVED" {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_ALERT_STATUS", "告警状态无效")
		return
	}
	limit, ok := listLimit(w, r, 200)
	if !ok {
		return
	}
	page, err := s.operations.AlertsPage(r.Context(), domain.AlertFilter{Cursor: r.URL.Query().Get("cursor"), Limit: limit, Status: status})
	if err != nil {
		phase5Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) readAlert(w http.ResponseWriter, r *http.Request) {
	if s.operations == nil {
		phase5Unavailable(w, r)
		return
	}
	current := r.Context().Value(sessionKey).(domain.Session)
	item, err := s.operations.MarkAlertRead(r.Context(), chi.URLParam(r, "alertID"), current.Subject)
	if err != nil {
		phase5Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) resolveAlert(w http.ResponseWriter, r *http.Request) {
	if s.operations == nil {
		phase5Unavailable(w, r)
		return
	}
	current := r.Context().Value(sessionKey).(domain.Session)
	item, err := s.operations.ResolveAlert(r.Context(), chi.URLParam(r, "alertID"), current.Subject)
	if err != nil {
		phase5Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

type muteAlertRequest struct {
	Minutes int `json:"minutes"`
}

func (s *Server) muteAlert(w http.ResponseWriter, r *http.Request) {
	if s.operations == nil {
		phase5Unavailable(w, r)
		return
	}
	request := muteAlertRequest{Minutes: 60}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil && !errors.Is(err, io.EOF) {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_MUTE_DURATION", "静默时长无效")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != nil && !errors.Is(err, io.EOF) {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_MUTE_DURATION", "静默时长无效")
		return
	}
	current := r.Context().Value(sessionKey).(domain.Session)
	item, err := s.operations.MuteAlert(r.Context(), chi.URLParam(r, "alertID"), current.Subject, time.Duration(request.Minutes)*time.Minute)
	if err != nil {
		phase5Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) settings(w http.ResponseWriter, r *http.Request) {
	if s.operations == nil {
		phase5Unavailable(w, r)
		return
	}
	value, err := s.operations.Settings(r.Context())
	if err != nil {
		phase5Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request) {
	if s.operations == nil {
		phase5Unavailable(w, r)
		return
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32*1024))
	decoder.DisallowUnknownFields()
	var value domain.Settings
	if err := decoder.Decode(&value); err != nil {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_SETTINGS", "设置内容无效")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != nil && !errors.Is(err, io.EOF) {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_SETTINGS", "设置内容无效")
		return
	}
	current := r.Context().Value(sessionKey).(domain.Session)
	result, err := s.operations.UpdateSettings(r.Context(), value, current.Subject)
	if err != nil {
		phase5Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) audit(w http.ResponseWriter, r *http.Request) {
	if s.operations == nil {
		phase5Unavailable(w, r)
		return
	}
	limit, ok := listLimit(w, r, 200)
	if !ok {
		return
	}
	page, err := s.operations.AuditsPage(r.Context(), r.URL.Query().Get("cursor"), limit)
	if err != nil {
		phase5Error(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

// events writes a bounded event stream. SQLite remains the source of truth;
// a reconnecting client must re-read its REST resources after an event gap.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	if s.operations == nil {
		phase5Unavailable(w, r)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		errorJSON(w, r, http.StatusInternalServerError, "EVENT_STREAM_UNAVAILABLE", "当前服务不支持实时事件")
		return
	}
	after := int64(0)
	if raw := r.Header.Get("Last-Event-ID"); raw != "" {
		after, _ = strconv.ParseInt(raw, 10, 64)
	} else if raw := r.URL.Query().Get("after"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed < 0 {
			errorJSON(w, r, http.StatusBadRequest, "INVALID_EVENT_CURSOR", "事件游标无效")
			return
		}
		after = parsed
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	deadline := time.NewTimer(25 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		items, err := s.operations.EventsAfter(r.Context(), after)
		if err != nil {
			return
		}
		for _, item := range items {
			_, _ = fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", item.ID, item.Type, item.Data)
			after = item.ID
		}
		current := r.Context().Value(sessionKey).(domain.Session)
		if time.Until(current.ExpiresAt) < 5*time.Minute {
			_, _ = fmt.Fprint(w, "event: session.expiring\ndata: {\"expiresSoon\":true}\n\n")
		}
		flusher.Flush()
		select {
		case <-r.Context().Done():
			return
		case <-deadline.C:
			return
		case <-ticker.C:
			_, _ = fmt.Fprint(w, ": keep-alive\n\n")
			flusher.Flush()
		}
	}
}

func phase5Unavailable(w http.ResponseWriter, r *http.Request) {
	errorJSON(w, r, http.StatusServiceUnavailable, "PHASE5_SERVICE_UNAVAILABLE", "运营服务暂时不可用")
}

func phase5Error(w http.ResponseWriter, r *http.Request, err error) {
	// A reverse proxy can cancel a request after the browser navigates away or
	// times out. There is no response left to send and this is not an
	// application failure worth logging as a 500.
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return
	}
	if errors.Is(err, domain.ErrInvalidCursor) {
		errorJSON(w, r, http.StatusBadRequest, "INVALID_CURSOR", "分页游标无效")
		return
	}
	if errors.Is(err, domain.ErrNotFound) {
		errorJSON(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "资源不存在")
		return
	}
	var validation *operations.ValidationError
	if errors.As(err, &validation) {
		errorJSON(w, r, http.StatusBadRequest, validation.Code, "设置或告警操作无效")
		return
	}
	slog.Error("phase5 operation failed", "request_id", requestIDFrom(r.Context()), "error", err)
	errorJSON(w, r, http.StatusInternalServerError, "PHASE5_OPERATION_FAILED", "操作未完成")
}

func (s *Server) auditRequest(r *http.Request, action, entityType, entityID string) {
	if s.operations == nil {
		return
	}
	current, ok := r.Context().Value(sessionKey).(domain.Session)
	if !ok {
		return
	}
	_ = s.operations.Record(r.Context(), action, current.Subject, entityType, entityID, nil)
}
