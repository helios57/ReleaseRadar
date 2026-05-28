package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yourorg/releaseradar/internal/auth"
	"github.com/yourorg/releaseradar/internal/domain"
	"github.com/yourorg/releaseradar/internal/hub"
)

// adminCookie mints a signed admin session cookie for hermetic handler tests.
func adminCookie(t *testing.T, store *auth.SessionStore) *http.Cookie {
	t.Helper()
	rec := httptest.NewRecorder()
	if err := store.Issue(rec, auth.Session{ID: "admin@example.com", Role: domain.RoleAdmin}, false); err != nil {
		t.Fatalf("issue session: %v", err)
	}
	res := rec.Result()
	for _, c := range res.Cookies() {
		if c.Name == "rr_session" {
			return c
		}
	}
	t.Fatal("no session cookie issued")
	return nil
}

// TestUpdateTaskRejectsInvalidStatus verifies an out-of-range status is
// rejected with 400 *before* any DB call (so it never surfaces as a 500 from
// the CHECK constraint). The test is hermetic: validation returns before the
// nil Repo is touched.
func TestUpdateTaskRejectsInvalidStatus(t *testing.T) {
	store := auth.NewSessionStore("test-secret")
	router := NewRouter(Deps{
		Sessions: store,
		Hub:      hub.New(),
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		// Repo intentionally nil — a valid 400 must short-circuit before use.
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/rollouts/r-1/tasks/0",
		strings.NewReader(`{"status":"bogus"}`))
	req.AddCookie(adminCookie(t, store))

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid status, got %d (body=%q)", rec.Code, rec.Body.String())
	}
}

// TestUpdateTaskRejectsMalformedBody verifies a non-JSON body yields a generic
// 400 without leaking parser internals.
func TestUpdateTaskRejectsMalformedBody(t *testing.T) {
	store := auth.NewSessionStore("test-secret")
	router := NewRouter(Deps{
		Sessions: store,
		Hub:      hub.New(),
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
	})

	req := httptest.NewRequest(http.MethodPatch, "/api/rollouts/r-1/tasks/0",
		strings.NewReader(`not json`))
	req.AddCookie(adminCookie(t, store))

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for malformed body, got %d", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, "invalid request body") {
		t.Fatalf("expected generic body message, got %q", body)
	}
}
