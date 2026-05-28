package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yourorg/releaseradar/internal/auth"
	"github.com/yourorg/releaseradar/internal/hub"
)

// TestCreateLockValidation verifies invalid lock payloads are rejected with 400
// *before* any DB call (so they never surface as a 500 from the CHECK
// constraint). Hermetic: validation short-circuits before the nil Repo is used.
func TestCreateLockValidation(t *testing.T) {
	store := auth.NewSessionStore("test-secret")
	router := NewRouter(Deps{
		Sessions: store,
		Hub:      hub.New(),
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	cookie := adminCookie(t, store)

	cases := []struct {
		name string
		body string
	}{
		{"missing title", `{"startAt":"2026-06-01T00:00:00Z","endAt":"2026-06-02T00:00:00Z","kind":"manual"}`},
		{"end before start", `{"title":"x","startAt":"2026-06-02T00:00:00Z","endAt":"2026-06-01T00:00:00Z","kind":"manual"}`},
		{"equal start/end", `{"title":"x","startAt":"2026-06-01T00:00:00Z","endAt":"2026-06-01T00:00:00Z","kind":"manual"}`},
		{"bad kind", `{"title":"x","startAt":"2026-06-01T00:00:00Z","endAt":"2026-06-02T00:00:00Z","kind":"bogus"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/locks", strings.NewReader(tc.body))
			req.AddCookie(cookie)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d (body=%q)", rec.Code, rec.Body.String())
			}
		})
	}
}
