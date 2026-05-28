// Package middleware composes auth + role checks for HTTP handlers.
package middleware

import (
	"context"
	"net/http"

	"github.com/yourorg/releaseradar/internal/auth"
	"github.com/yourorg/releaseradar/internal/domain"
)

type ctxKey int

const sessionKey ctxKey = 1

// WithSession returns the session attached to the request, if any.
func WithSession(r *http.Request) (auth.Session, bool) {
	s, ok := r.Context().Value(sessionKey).(auth.Session)
	return s, ok
}

// Authenticate parses the session cookie. It does NOT reject anonymous calls —
// downstream RequireRole does that. This lets the iCal feed and login routes
// run without a session.
func Authenticate(store *auth.SessionStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if sess, err := store.Read(r); err == nil {
				r = r.WithContext(context.WithValue(r.Context(), sessionKey, sess))
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireSession denies anonymous calls with 401.
func RequireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := WithSession(r); !ok {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAdmin denies non-admin sessions with 403. Readonly users hit this on
// any data-modifying endpoint or master-data fetch (per spec).
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, ok := WithSession(r)
		if !ok {
			http.Error(w, "unauthenticated", http.StatusUnauthorized)
			return
		}
		if sess.Role != domain.RoleAdmin {
			http.Error(w, "admin role required", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
