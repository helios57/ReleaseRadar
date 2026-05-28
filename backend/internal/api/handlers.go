package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

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
	stateCookie, err := r.Cookie("rr_oidc_state")
	if err != nil || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing code", http.StatusBadRequest)
		return
	}
	claims, err := h.OIDC.Exchange(r.Context(), code)
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
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

func (h *handlers) upsertProduct(w http.ResponseWriter, r *http.Request) {
	var p domain.Product
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if p.ID == "" {
		p.ID = strings.ToLower(strings.ReplaceAll(p.Name, " ", "-"))
	}
	if err := h.Repo.UpsertProduct(r.Context(), p); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// ---------- Rollout types ----------

func (h *handlers) listRolloutTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.Repo.RolloutTypes(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, types)
}

func (h *handlers) upsertRolloutType(w http.ResponseWriter, r *http.Request) {
	var t domain.RolloutType
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if t.ID == "" {
		t.ID = strings.ToLower(strings.ReplaceAll(t.Name, " ", "-"))
	}
	if err := h.Repo.UpsertRolloutType(r.Context(), t); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// ---------- Rollouts ----------

func (h *handlers) listRollouts(w http.ResponseWriter, r *http.Request) {
	rs, err := h.Repo.Rollouts(r.Context())
	if err != nil {
		writeErr(w, err)
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
		writeErr(w, err)
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
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		in.ID = "r-" + uuid.NewString()[:8]
	}
	sess, _ := middleware.WithSession(r)
	in.CreatedBy = sess.ID
	out, err := h.Repo.CreateRollout(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}
	// Schedule advance-warning notifications based on stage env.
	h.scheduleNotifications(r, out)
	writeJSON(w, http.StatusCreated, out)
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
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sess, _ := middleware.WithSession(r)
	if err := h.Repo.UpdateRolloutTask(r.Context(), id, seq, body.Status, body.Reason, sess.ID); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- Locks ----------

func (h *handlers) listLocks(w http.ResponseWriter, r *http.Request) {
	ls, err := h.Repo.Locks(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ls)
}

func (h *handlers) createLock(w http.ResponseWriter, r *http.Request) {
	var in domain.Lock
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ID == "" {
		in.ID = "l-" + uuid.NewString()[:8]
	}
	sess, _ := middleware.WithSession(r)
	in.CreatedBy = sess.ID
	out, err := h.Repo.CreateLock(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

// ---------- iCalendar ----------

func (h *handlers) calendar(w http.ResponseWriter, r *http.Request) {
	rs, err := h.Repo.Rollouts(r.Context())
	if err != nil {
		writeErr(w, err)
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
		now := time.Now()
		for _, adv := range advances {
			fireAt := st.StartAt.Add(-adv)
			// If the requested advance is already in the past (rollout created
			// late), clip to "now" so the scheduler still fires once on the
			// next tick instead of dropping the notification on the floor.
			if fireAt.Before(now) {
				fireAt = now.Add(time.Second)
			}
			_ = h.Repo.ScheduleNotification(r.Context(), ro.ID, i, channel, fireAt)
		}
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
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
