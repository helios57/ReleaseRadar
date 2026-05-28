// Package api wires the HTTP handlers using Go 1.22's enhanced ServeMux
// (method + wildcard routing). No third-party router.
package api

import (
	"log/slog"
	"net/http"

	"github.com/yourorg/releaseradar/internal/auth"
	"github.com/yourorg/releaseradar/internal/hub"
	"github.com/yourorg/releaseradar/internal/ldap"
	"github.com/yourorg/releaseradar/internal/middleware"
	"github.com/yourorg/releaseradar/internal/store"
)

type Deps struct {
	Repo      *store.Repository
	OIDC      *auth.OIDC
	LDAP      *ldap.Resolver
	Sessions  *auth.SessionStore
	Hub       *hub.Hub
	Logger    *slog.Logger
	PublicURL string
}

// NewRouter builds the full handler tree, wrapping it in session auth.
func NewRouter(d Deps) http.Handler {
	mux := http.NewServeMux()
	h := &handlers{Deps: d}

	// Public auth endpoints (no session required).
	mux.HandleFunc("GET /auth/login", h.login)
	mux.HandleFunc("GET /auth/callback", h.callback)
	mux.HandleFunc("POST /auth/logout", h.logout)

	// Authenticated, readonly-OK.
	mux.Handle("GET /api/me", middleware.RequireSession(http.HandlerFunc(h.me)))
	mux.Handle("GET /api/products", middleware.RequireSession(http.HandlerFunc(h.listProducts)))
	mux.Handle("GET /api/rollouts", middleware.RequireSession(http.HandlerFunc(h.listRollouts)))
	mux.Handle("GET /api/rollouts/{id}", middleware.RequireSession(http.HandlerFunc(h.getRollout)))
	mux.Handle("GET /api/locks", middleware.RequireSession(http.HandlerFunc(h.listLocks)))
	mux.Handle("GET /api/calendar.ics", middleware.RequireSession(http.HandlerFunc(h.calendar)))

	// Live-update WebSocket. RequireSession rejects anonymous callers with 401
	// before the upgrade.
	mux.Handle("GET /api/ws", middleware.RequireSession(http.HandlerFunc(h.ws)))

	// Admin only — modifications + master-data details.
	mux.Handle("GET /api/rollout-types", middleware.RequireAdmin(http.HandlerFunc(h.listRolloutTypes)))
	mux.Handle("POST /api/rollout-types", middleware.RequireAdmin(http.HandlerFunc(h.upsertRolloutType)))
	mux.Handle("POST /api/products", middleware.RequireAdmin(http.HandlerFunc(h.upsertProduct)))
	mux.Handle("POST /api/rollouts", middleware.RequireAdmin(http.HandlerFunc(h.createRollout)))
	mux.Handle("PATCH /api/rollouts/{id}", middleware.RequireAdmin(http.HandlerFunc(h.updateRollout)))
	mux.Handle("DELETE /api/rollouts/{id}", middleware.RequireAdmin(http.HandlerFunc(h.deleteRollout)))
	mux.Handle("PATCH /api/rollouts/{id}/tasks/{seq}", middleware.RequireAdmin(http.HandlerFunc(h.updateTask)))
	mux.Handle("POST /api/locks", middleware.RequireAdmin(http.HandlerFunc(h.createLock)))
	mux.Handle("PATCH /api/locks/{id}", middleware.RequireAdmin(http.HandlerFunc(h.updateLock)))
	mux.Handle("DELETE /api/locks/{id}", middleware.RequireAdmin(http.HandlerFunc(h.deleteLock)))

	// Health.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Wrap the whole tree in the session parser so every handler can see
	// the user (if any).
	return middleware.Authenticate(d.Sessions)(mux)
}
