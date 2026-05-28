package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/yourorg/releaseradar/internal/auth"
	"github.com/yourorg/releaseradar/internal/calendar"
	"github.com/yourorg/releaseradar/internal/domain"
	"github.com/yourorg/releaseradar/internal/middleware"
	"github.com/yourorg/releaseradar/internal/store"
)

type handlers struct {
	Deps
}

// ---------- OIDC ----------

func (h *handlers) login(w http.ResponseWriter, r *http.Request) {
	if !h.OIDC.Enabled() {
		http.Error(w, "OIDC not configured", http.StatusServiceUnavailable)
		return
	}
	state := auth.RandomState()
	nonce := auth.RandomState()
	auth.WriteOIDCCookies(w, state, nonce, r.TLS != nil)
	http.Redirect(w, r, h.OIDC.AuthCodeURL(state, nonce), http.StatusFound)
}

func (h *handlers) callback(w http.ResponseWriter, r *http.Request) {
	if !h.OIDC.Enabled() {
		http.Error(w, "OIDC not configured", http.StatusServiceUnavailable)
		return
	}
	// Read the transient state + nonce cookies, then clear them immediately
	// (before writing any response header) so a stale nonce can never be
	// replayed, regardless of how the rest of the callback turns out.
	stateCookie, stateErr := r.Cookie("rr_oidc_state")
	var expectedNonce string
	if nonceCookie, nerr := r.Cookie("rr_oidc_nonce"); nerr == nil {
		expectedNonce = nonceCookie.Value
	}
	auth.ClearOIDCCookies(w, r.TLS != nil)

	if stateErr != nil || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}
	// expectedNonce is the value we stored at login; an empty/missing cookie
	// is a hard failure inside Exchange (no bypass).
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing code", http.StatusBadRequest)
		return
	}
	claims, err := h.OIDC.Exchange(r.Context(), code, expectedNonce)
	if err != nil {
		h.Logger.Error("oidc exchange", "err", err)
		http.Error(w, "auth exchange failed", http.StatusUnauthorized)
		return
	}
	role, groups, err := h.LDAP.Resolve(claims.Email)
	if err != nil {
		h.Logger.Error("ldap resolve", "err", err, "email", claims.Email)
		// fail soft to readonly so the user still gets a session.
		role = domain.RoleReadOnly
	}
	actor := auth.ActorFromClaims(claims)
	actor.Role = role
	if err := h.Repo.UpsertActor(r.Context(), actor); err != nil {
		h.Logger.Error("upsert actor", "err", err)
	}
	sess := auth.Session{
		ID:     actor.ID,
		Email:  actor.Email,
		Name:   actor.Name,
		Role:   role,
		Groups: groups,
	}
	if err := h.Sessions.Issue(w, sess, r.TLS != nil); err != nil {
		http.Error(w, "session issue failed", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

func (h *handlers) logout(w http.ResponseWriter, r *http.Request) {
	h.Sessions.Clear(w, r.TLS != nil)
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Generic ----------

func (h *handlers) me(w http.ResponseWriter, r *http.Request) {
	sess, _ := middleware.WithSession(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"email":    sess.Email,
		"name":     sess.Name,
		"initials": initials(sess.Name),
		"role":     sess.Role,
		"groups":   sess.Groups,
	})
}

// ---------- Products ----------

func (h *handlers) listProducts(w http.ResponseWriter, r *http.Request) {
	products, err := h.Repo.Products(r.Context())
	if err != nil {
		h.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

func (h *handlers) upsertProduct(w http.ResponseWriter, r *http.Request) {
	var p domain.Product
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		h.badRequestBody(w, err)
		return
	}
	if p.ID == "" {
		p.ID = strings.ToLower(strings.ReplaceAll(p.Name, " ", "-"))
	}
	if err := h.Repo.UpsertProduct(r.Context(), p); err != nil {
		h.writeErr(w, err)
		return
	}
	h.Hub.Broadcast("product", p.ID, "update")
	writeJSON(w, http.StatusOK, p)
}

// ---------- Rollout types ----------

func (h *handlers) listRolloutTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.Repo.RolloutTypes(r.Context())
	if err != nil {
		h.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, types)
}

func (h *handlers) upsertRolloutType(w http.ResponseWriter, r *http.Request) {
	var t domain.RolloutType
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		h.badRequestBody(w, err)
		return
	}
	if t.ID == "" {
		t.ID = strings.ToLower(strings.ReplaceAll(t.Name, " ", "-"))
	}
	if err := h.Repo.UpsertRolloutType(r.Context(), t); err != nil {
		h.writeErr(w, err)
		return
	}
	h.Hub.Broadcast("rollout-type", t.ID, "update")
	writeJSON(w, http.StatusOK, t)
}

// ---------- Rollouts ----------

func (h *handlers) listRollouts(w http.ResponseWriter, r *http.Request) {
	rs, err := h.Repo.Rollouts(r.Context())
	if err != nil {
		h.writeErr(w, err)
		return
	}
	sess, _ := middleware.WithSession(r)
	if sess.Role != domain.RoleAdmin {
		for i := range rs {
			rs[i] = stripInternal(rs[i])
		}
	}
	writeJSON(w, http.StatusOK, rs)
}

func (h *handlers) getRollout(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ro, err := h.Repo.Rollout(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		h.writeErr(w, err)
		return
	}
	sess, _ := middleware.WithSession(r)
	if sess.Role != domain.RoleAdmin {
		ro = stripInternal(ro)
	}
	writeJSON(w, http.StatusOK, ro)
}

func (h *handlers) createRollout(w http.ResponseWriter, r *http.Request) {
	var in domain.Rollout
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		h.badRequestBody(w, err)
		return
	}
	if in.ID == "" {
		in.ID = "r-" + uuid.NewString()[:8]
	}
	sess, _ := middleware.WithSession(r)
	in.CreatedBy = sess.ID
	out, err := h.Repo.CreateRollout(r.Context(), in)
	if err != nil {
		h.writeErr(w, err)
		return
	}
	// Schedule advance-warning notifications based on stage env.
	h.scheduleNotifications(r, out)
	h.Hub.Broadcast("rollout", out.ID, "create")
	writeJSON(w, http.StatusCreated, out)
}

func (h *handlers) updateRollout(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var in domain.Rollout
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		h.badRequestBody(w, err)
		return
	}
	in.ID = id
	out, err := h.Repo.UpdateRollout(r.Context(), in)
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		h.writeErr(w, err)
		return
	}
	// Stages may have shifted — (re)schedule advance-warning notifications.
	h.scheduleNotifications(r, out)
	h.Hub.Broadcast("rollout", out.ID, "update")
	writeJSON(w, http.StatusOK, out)
}

func (h *handlers) deleteRollout(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Repo.DeleteRollout(r.Context(), id); err != nil {
		h.writeErr(w, err)
		return
	}
	h.Hub.Broadcast("rollout", id, "delete")
	w.WriteHeader(http.StatusNoContent)
}

func (h *handlers) updateTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	seq, err := strconv.Atoi(r.PathValue("seq"))
	if err != nil {
		http.Error(w, "bad seq", http.StatusBadRequest)
		return
	}
	var body struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.badRequestBody(w, err)
		return
	}
	// Validate up front so an out-of-range status surfaces as 400 instead of
	// hitting the DB CHECK constraint and bubbling up as a 500.
	if body.Status != "" && body.Status != "done" && body.Status != "failed" {
		http.Error(w, "invalid status", http.StatusBadRequest)
		return
	}
	sess, _ := middleware.WithSession(r)
	if err := h.Repo.UpdateRolloutTask(r.Context(), id, seq, body.Status, body.Reason, sess.ID); err != nil {
		h.writeErr(w, err)
		return
	}
	// task events carry the parent rollout id so clients refetch the rollout.
	h.Hub.Broadcast("task", id, "update")
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Locks ----------

func (h *handlers) listLocks(w http.ResponseWriter, r *http.Request) {
	ls, err := h.Repo.Locks(r.Context())
	if err != nil {
		h.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ls)
}

func (h *handlers) createLock(w http.ResponseWriter, r *http.Request) {
	var in domain.Lock
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		h.badRequestBody(w, err)
		return
	}
	if msg := normalizeAndValidateLock(&in); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		in.ID = "l-" + uuid.NewString()[:8]
	}
	sess, _ := middleware.WithSession(r)
	in.CreatedBy = sess.ID
	out, err := h.Repo.CreateLock(r.Context(), in)
	if err != nil {
		h.writeErr(w, err)
		return
	}
	h.Hub.Broadcast("lock", out.ID, "create")
	writeJSON(w, http.StatusCreated, out)
}

func (h *handlers) updateLock(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var in domain.Lock
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		h.badRequestBody(w, err)
		return
	}
	if msg := normalizeAndValidateLock(&in); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	in.ID = id
	out, err := h.Repo.UpdateLock(r.Context(), in)
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		h.writeErr(w, err)
		return
	}
	h.Hub.Broadcast("lock", out.ID, "update")
	writeJSON(w, http.StatusOK, out)
}

func (h *handlers) deleteLock(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Repo.DeleteLock(r.Context(), id); err != nil {
		h.writeErr(w, err)
		return
	}
	h.Hub.Broadcast("lock", id, "delete")
	w.WriteHeader(http.StatusNoContent)
}

// ---------- iCalendar ----------

func (h *handlers) calendar(w http.ResponseWriter, r *http.Request) {
	rs, err := h.Repo.Rollouts(r.Context())
	if err != nil {
		h.writeErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", `inline; filename="releaseradar.ics"`)
	if err := calendar.WriteICS(w, rs); err != nil {
		h.Logger.Error("ics write", "err", err)
	}
}

// ---------- helpers ----------

// stripInternal removes admin-only fields so readonly callers only ever see
// "external description" + scheduling data.
func stripInternal(r domain.Rollout) domain.Rollout {
	r.DescInt = ""
	r.Risks = ""
	// Tasks contain workflow detail — keep counts but blank descriptions.
	for i := range r.Tasks {
		r.Tasks[i].Description = "•"
		r.Tasks[i].Reason = ""
	}
	return r
}

// scheduleNotifications computes fire times based on stage env. Per the design
// rules: non-prod ≥ 1h, prod1 ≥ 1w, prod2 ≥ 2w. We pick the largest standard
// advance window (≥ available time-to-start) so we don't fire in the past.
func (h *handlers) scheduleNotifications(r *http.Request, ro domain.Rollout) {
	now := time.Now()
	items := make([]store.ScheduledNotification, 0, len(ro.Stages)*3)
	for i, st := range ro.Stages {
		var channel string
		var advances []time.Duration
		switch st.Env {
		case "non-prod":
			channel = "TMS_NP"
			advances = []time.Duration{1 * time.Hour}
		case "prod1":
			channel = "TMS_PROD"
			advances = []time.Duration{7 * 24 * time.Hour, 24 * time.Hour, time.Hour}
		case "prod2":
			channel = "TMS_PROD"
			advances = []time.Duration{14 * 24 * time.Hour, 7 * 24 * time.Hour, time.Hour}
		default:
			channel = "TMS_PROD"
			advances = []time.Duration{time.Hour}
		}
		for _, adv := range advances {
			fireAt := st.StartAt.Add(-adv)
			// If the requested advance is already in the past (rollout created
			// late), clip to "now" so the scheduler still fires once on the
			// next tick instead of dropping the notification on the floor.
			if fireAt.Before(now) {
				fireAt = now.Add(time.Second)
			}
			items = append(items, store.ScheduledNotification{StageSeq: i, Channel: channel, FireAt: fireAt})
		}
	}
	// Replace the rollout's unsent notifications atomically: a single transaction
	// deletes the stale rows and inserts the recomputed set, so a concurrent
	// dispatcher tick can't observe a half-applied reschedule. Don't fail the
	// request on error — the rollout was already persisted.
	if err := h.Repo.RescheduleNotifications(r.Context(), ro.ID, items); err != nil {
		h.Logger.Error("reschedule notifications", "err", err, "rollout", ro.ID)
	}
}

// normalizeAndValidateLock applies defaults (empty kind → "manual") and returns
// a client-facing message if the lock is invalid, or "" if it's OK. Keeps bad
// input from reaching the DB CHECK constraint as a 500.
func normalizeAndValidateLock(in *domain.Lock) string {
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" {
		return "title is required"
	}
	if in.Kind == "" {
		in.Kind = "manual"
	}
	switch in.Kind {
	case "manual", "holiday", "window":
	default:
		return "kind must be one of: manual, holiday, window"
	}
	if !in.EndAt.After(in.StartAt) {
		return "endAt must be after startAt"
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// writeErr maps an internal error to a client response. ErrNotFound becomes a
// 404; everything else is logged server-side with the detail and returns a
// generic 500 so we never leak raw error/SQL strings to the client.
func (h *handlers) writeErr(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// A Postgres integrity-constraint violation (class 23 — FK, unique, check,
	// not-null) is caused by bad client input, not a server fault: report 400.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && strings.HasPrefix(pgErr.Code, "23") {
		h.Logger.Warn("constraint violation", "code", pgErr.Code, "constraint", pgErr.ConstraintName)
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	h.Logger.Error("request failed", "err", err)
	http.Error(w, "internal error", http.StatusInternalServerError)
}

// badRequestBody logs the detailed decode error and returns a generic 400 so
// parser internals (offsets, expected types) don't leak to the client.
func (h *handlers) badRequestBody(w http.ResponseWriter, err error) {
	h.Logger.Warn("decode request body", "err", err)
	http.Error(w, "invalid request body", http.StatusBadRequest)
}

func initials(name string) string {
	parts := strings.Fields(name)
	if len(parts) == 0 {
		return "??"
	}
	if len(parts) == 1 {
		s := parts[0]
		if len(s) >= 2 {
			return strings.ToUpper(s[:2])
		}
		return strings.ToUpper(s)
	}
	return strings.ToUpper(string(parts[0][0]) + string(parts[len(parts)-1][0]))
}
