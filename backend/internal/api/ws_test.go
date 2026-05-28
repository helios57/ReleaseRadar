package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/yourorg/releaseradar/internal/auth"
	"github.com/yourorg/releaseradar/internal/hub"
)

// TestWSRequiresSession verifies the /api/ws route rejects an anonymous request
// with 401 (RequireSession), before any WebSocket upgrade is attempted. The
// test is hermetic: no DB, no OIDC, no network — just the router with a
// SessionStore and an empty Hub.
func TestWSRequiresSession(t *testing.T) {
	router := NewRouter(Deps{
		Sessions: auth.NewSessionStore("test-secret"),
		Hub:      hub.New(),
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
	})

	req := httptest.NewRequest(http.MethodGet, "/api/ws", nil)
	// A real browser upgrade carries these; include them to prove the 401 is
	// from RequireSession and not a rejected handshake.
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for anonymous /api/ws, got %d", rec.Code)
	}
}
