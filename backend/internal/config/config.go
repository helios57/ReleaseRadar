package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	ListenAddr    string
	PublicURL     string
	DatabaseURL   string
	SessionSecret string
	SeedOnStart   bool
	OIDC          OIDCConfig
	LDAP          LDAPConfig
	Teams         TeamsConfig
	Notify        NotifyConfig
}

type OIDCConfig struct {
	Issuer       string
	DiscoveryURL string // overrides issuer for the discovery fetch (split-horizon DNS)
	ClientID     string
	ClientSecret string
	RedirectURL  string
	Scopes       []string
}

type LDAPConfig struct {
	URL         string
	BindDN      string
	BindPass    string
	BaseDN      string
	UserFilter  string
	GroupAttr   string // when set, read groups from this attribute on the user entry (AD memberOf style)
	GroupBaseDN string // when set, search this DN for groups containing the user
	GroupFilter string // template with %s = user DN, e.g. (&(objectClass=groupOfNames)(member=%s))
	AdminGroups []string
	ReadGroups  []string
	Timeout     time.Duration
	// InsecureSkipVerify disables TLS certificate verification for ldaps://
	// connections. Default false (verify against system roots); set
	// RR_LDAP_INSECURE_SKIP_VERIFY=true only for self-signed certs in dev/CI.
	InsecureSkipVerify bool
}

type TeamsConfig struct {
	WebhookProd    string
	WebhookNonProd string
}

type NotifyConfig struct {
	Tick time.Duration
}

func Load() (Config, error) {
	c := Config{
		ListenAddr:    env("RR_LISTEN_ADDR", ":8080"),
		PublicURL:     env("RR_PUBLIC_URL", "http://localhost:8080"),
		DatabaseURL:   env("RR_DATABASE_URL", ""),
		SessionSecret: env("RR_SESSION_SECRET", ""),
		SeedOnStart:   env("RR_SEED_ON_START", "") == "true",
		OIDC: OIDCConfig{
			Issuer:       env("RR_OIDC_ISSUER", ""),
			DiscoveryURL: env("RR_OIDC_DISCOVERY_URL", ""),
			ClientID:     env("RR_OIDC_CLIENT_ID", ""),
			ClientSecret: env("RR_OIDC_CLIENT_SECRET", ""),
			RedirectURL:  env("RR_OIDC_REDIRECT_URL", ""),
			Scopes:       splitCSV(env("RR_OIDC_SCOPES", "openid,profile,email")),
		},
		LDAP: LDAPConfig{
			URL:         env("RR_LDAP_URL", ""),
			BindDN:      env("RR_LDAP_BIND_DN", ""),
			BindPass:    env("RR_LDAP_BIND_PASS", ""),
			BaseDN:      env("RR_LDAP_BASE_DN", ""),
			UserFilter:  env("RR_LDAP_USER_FILTER", "(userPrincipalName=%s)"),
			GroupAttr:   env("RR_LDAP_GROUP_ATTR", "memberOf"),
			GroupBaseDN: env("RR_LDAP_GROUP_BASE_DN", ""),
			GroupFilter: env("RR_LDAP_GROUP_FILTER", ""),
			// DNs contain commas, so the group lists are semicolon-separated.
			AdminGroups:        splitList(env("RR_LDAP_ADMIN_GROUPS", ""), ";"),
			ReadGroups:         splitList(env("RR_LDAP_READ_GROUPS", ""), ";"),
			Timeout:            5 * time.Second,
			InsecureSkipVerify: env("RR_LDAP_INSECURE_SKIP_VERIFY", "") == "true",
		},
		Teams: TeamsConfig{
			WebhookProd:    env("RR_TEAMS_WEBHOOK_PROD", ""),
			WebhookNonProd: env("RR_TEAMS_WEBHOOK_NONPROD", ""),
		},
		Notify: NotifyConfig{
			Tick: parseDur(env("RR_NOTIFY_TICK", "30s"), 30*time.Second),
		},
	}

	if c.DatabaseURL == "" {
		return c, fmt.Errorf("RR_DATABASE_URL is required")
	}
	if c.SessionSecret == "" {
		return c, fmt.Errorf("RR_SESSION_SECRET is required")
	}
	if len(c.SessionSecret) < 16 {
		return c, fmt.Errorf("RR_SESSION_SECRET must be at least 16 characters (got %d)", len(c.SessionSecret))
	}
	return c, nil
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func parseDur(s string, fallback time.Duration) time.Duration {
	if s == "" {
		return fallback
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return fallback
	}
	return d
}

func splitCSV(s string) []string {
	return splitList(s, ",")
}

func splitList(s, sep string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, sep)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
