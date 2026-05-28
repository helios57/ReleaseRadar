package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/yourorg/releaseradar/internal/domain"
)

const sessionCookie = "rr_session"
const sessionMaxAge = 8 * time.Hour

type SessionStore struct {
	secret []byte
}

func NewSessionStore(secret string) *SessionStore {
	return &SessionStore{secret: []byte(secret)}
}

type Session struct {
	ID     string      `json:"id"`
	Email  string      `json:"email"`
	Name   string      `json:"name"`
	Role   domain.Role `json:"role"`
	Groups []string    `json:"groups,omitempty"`
	Exp    int64       `json:"exp"`
}

// Issue mints a signed session cookie and writes it to the response.
func (s *SessionStore) Issue(w http.ResponseWriter, sess Session, secure bool) error {
	sess.Exp = time.Now().Add(sessionMaxAge).Unix()
	raw, err := json.Marshal(sess)
	if err != nil {
		return err
	}
	body := base64.RawURLEncoding.EncodeToString(raw)
	mac := s.sign(body)
	value := body + "." + mac
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(sessionMaxAge.Seconds()),
	})
	return nil
}

// Clear evicts the session cookie.
func (s *SessionStore) Clear(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// Read parses + verifies the session cookie on the request.
func (s *SessionStore) Read(r *http.Request) (Session, error) {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return Session{}, err
	}
	parts := strings.SplitN(c.Value, ".", 2)
	if len(parts) != 2 {
		return Session{}, errors.New("malformed session")
	}
	if !hmac.Equal([]byte(s.sign(parts[0])), []byte(parts[1])) {
		return Session{}, errors.New("bad session signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Session{}, err
	}
	var sess Session
	if err := json.Unmarshal(raw, &sess); err != nil {
		return Session{}, err
	}
	if time.Now().Unix() > sess.Exp {
		return Session{}, errors.New("session expired")
	}
	return sess, nil
}

func (s *SessionStore) sign(body string) string {
	m := hmac.New(sha256.New, s.secret)
	m.Write([]byte(body))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
