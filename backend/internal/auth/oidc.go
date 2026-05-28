// Package auth handles Microsoft Entra ID OIDC login and session cookies.
package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/yourorg/releaseradar/internal/config"
	"github.com/yourorg/releaseradar/internal/domain"
)

type OIDC struct {
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	oauth    *oauth2.Config
}

// NewOIDC connects to the OIDC issuer.
//
// When DiscoveryURL is set (typical in docker setups where the issuer URL is
// browser-facing but the backend reaches the IdP via a different hostname),
// discovery is fetched from DiscoveryURL while token issuer-claim verification
// remains pinned to cfg.Issuer.
func NewOIDC(ctx context.Context, cfg config.OIDCConfig) (*OIDC, error) {
	if cfg.Issuer == "" || cfg.ClientID == "" {
		// Dev mode without configured SSO — return a stub that always errors.
		return &OIDC{}, nil
	}
	discoveryURL := cfg.DiscoveryURL
	if discoveryURL == "" {
		discoveryURL = cfg.Issuer
	}
	if discoveryURL != cfg.Issuer {
		ctx = oidc.InsecureIssuerURLContext(ctx, cfg.Issuer)
	}
	provider, err := oidc.NewProvider(ctx, discoveryURL)
	if err != nil {
		return nil, fmt.Errorf("oidc discovery: %w", err)
	}
	endpoint := provider.Endpoint()
	verifier := provider.Verifier(&oidc.Config{ClientID: cfg.ClientID})
	// Split-horizon DNS: the browser must keep using the public AuthURL, but
	// every backend→IdP call (token exchange, JWKS refresh) needs to resolve
	// to the *internal* hostname. We rewrite TokenURL on the oauth2 endpoint
	// and build a separate verifier that fetches JWKS from the internal URL.
	if discoveryURL != cfg.Issuer {
		endpoint.TokenURL = strings.Replace(endpoint.TokenURL, cfg.Issuer, discoveryURL, 1)
		var discovery struct {
			JWKSURL string `json:"jwks_uri"`
		}
		if err := provider.Claims(&discovery); err != nil {
			return nil, fmt.Errorf("decode discovery claims: %w", err)
		}
		internalJWKS := strings.Replace(discovery.JWKSURL, cfg.Issuer, discoveryURL, 1)
		keySet := oidc.NewRemoteKeySet(context.Background(), internalJWKS)
		verifier = oidc.NewVerifier(cfg.Issuer, keySet, &oidc.Config{ClientID: cfg.ClientID})
	}
	o := &OIDC{
		provider: provider,
		verifier: verifier,
		oauth: &oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURL,
			Endpoint:     endpoint,
			Scopes:       cfg.Scopes,
		},
	}
	return o, nil
}

func (o *OIDC) Enabled() bool { return o.provider != nil }

// AuthCodeURL produces the redirect target the browser uses to start the
// login flow.
func (o *OIDC) AuthCodeURL(state, nonce string) string {
	return o.oauth.AuthCodeURL(state,
		oauth2.SetAuthURLParam("nonce", nonce),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	)
}

type Claims struct {
	Subject           string `json:"sub"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
}

// Exchange swaps a code for an ID token and returns the verified claims.
//
// expectedNonce is the value stored in the rr_oidc_nonce cookie at login time;
// it MUST match the id_token's nonce claim (replay defense). An empty
// expectedNonce is treated as a hard failure so a missing/cleared cookie can
// never bypass the check.
func (o *OIDC) Exchange(ctx context.Context, code, expectedNonce string) (Claims, error) {
	if expectedNonce == "" {
		return Claims{}, errors.New("missing nonce")
	}
	tok, err := o.oauth.Exchange(ctx, code)
	if err != nil {
		return Claims{}, fmt.Errorf("oauth exchange: %w", err)
	}
	raw, ok := tok.Extra("id_token").(string)
	if !ok {
		return Claims{}, errors.New("missing id_token")
	}
	idTok, err := o.verifier.Verify(ctx, raw)
	if err != nil {
		return Claims{}, fmt.Errorf("verify id_token: %w", err)
	}
	if idTok.Nonce != expectedNonce {
		return Claims{}, errors.New("nonce mismatch")
	}
	var c Claims
	if err := idTok.Claims(&c); err != nil {
		return Claims{}, fmt.Errorf("decode claims: %w", err)
	}
	if c.Email == "" {
		c.Email = c.PreferredUsername
	}
	return c, nil
}

// ActorFromClaims fills the parts of domain.Actor we can derive from OIDC
// alone. The role assignment is done elsewhere using LDAP groups.
func ActorFromClaims(c Claims) domain.Actor {
	name := c.Name
	if name == "" {
		name = c.Email
	}
	return domain.Actor{
		ID:       strings.ToLower(c.Email),
		Email:    c.Email,
		Name:     name,
		Initials: initialsOf(name),
		Hue:      hueOf(c.Email),
		Role:     domain.RoleReadOnly,
	}
}

func initialsOf(name string) string {
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

func hueOf(s string) int {
	h := 0
	for _, r := range s {
		h = (h*31 + int(r)) % 360
	}
	if h < 0 {
		h += 360
	}
	return h
}

// RandomState generates a high-entropy URL-safe nonce.
func RandomState() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return hex.EncodeToString([]byte(time.Now().String()))
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// WriteOIDCCookies sets short-lived state + nonce cookies before redirect.
func WriteOIDCCookies(w http.ResponseWriter, state, nonce string, secure bool) {
	common := http.Cookie{
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   300,
	}
	c1 := common
	c1.Name = "rr_oidc_state"
	c1.Value = state
	c2 := common
	c2.Name = "rr_oidc_nonce"
	c2.Value = nonce
	http.SetCookie(w, &c1)
	http.SetCookie(w, &c2)
}

// ClearOIDCCookies evicts the transient state + nonce cookies. Called on
// callback regardless of outcome so a stale nonce can't be replayed.
func ClearOIDCCookies(w http.ResponseWriter, secure bool) {
	for _, name := range []string{"rr_oidc_state", "rr_oidc_nonce"} {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})
	}
}
