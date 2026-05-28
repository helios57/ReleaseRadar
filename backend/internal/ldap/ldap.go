// Package ldap resolves a SSO-authenticated user to a role by inspecting their
// LDAP/AD group memberships. Two lookup styles are supported:
//
//   * memberOf-attribute (Active Directory): groups are read from a multi-valued
//     attribute on the user entry, configured via RR_LDAP_GROUP_ATTR.
//
//   * group-search (OpenLDAP/389DS/etc.): a second search runs against
//     RR_LDAP_GROUP_BASE_DN using RR_LDAP_GROUP_FILTER, where %s is replaced
//     by the user's DN. The group DNs that come back are treated as
//     memberships.
package ldap

import (
	"crypto/tls"
	"fmt"
	"log/slog"
	"strings"

	goldap "github.com/go-ldap/ldap/v3"

	"github.com/yourorg/releaseradar/internal/config"
	"github.com/yourorg/releaseradar/internal/domain"
)

type Resolver struct {
	cfg config.LDAPConfig
}

func NewResolver(cfg config.LDAPConfig) *Resolver {
	return &Resolver{cfg: cfg}
}

// Resolve queries LDAP for the user's group memberships and returns the
// derived role + raw group list. If LDAP isn't configured, returns
// readonly with no groups.
func (r *Resolver) Resolve(email string) (domain.Role, []string, error) {
	if r.cfg.URL == "" {
		return domain.RoleReadOnly, nil, nil
	}

	conn, err := dial(r.cfg)
	if err != nil {
		return "", nil, fmt.Errorf("ldap dial: %w", err)
	}
	defer conn.Close()
	conn.SetTimeout(r.cfg.Timeout)

	if r.cfg.BindDN != "" {
		if err := conn.Bind(r.cfg.BindDN, r.cfg.BindPass); err != nil {
			return "", nil, fmt.Errorf("ldap bind: %w", err)
		}
	}

	userDN, attrGroups, err := r.findUser(conn, email)
	if err != nil {
		return "", nil, err
	}
	if userDN == "" {
		slog.Warn("ldap user not found", "email", email)
		return domain.RoleReadOnly, nil, nil
	}

	groups := attrGroups
	if r.cfg.GroupFilter != "" {
		extra, err := r.searchGroups(conn, userDN)
		if err != nil {
			return "", nil, err
		}
		groups = append(groups, extra...)
	}

	role := classify(groups, r.cfg.AdminGroups, r.cfg.ReadGroups)
	slog.Debug("ldap resolved", "email", email, "dn", userDN, "role", role)
	return role, groups, nil
}

func (r *Resolver) findUser(conn *goldap.Conn, email string) (dn string, groups []string, err error) {
	filter := fmt.Sprintf(r.cfg.UserFilter, escape(email))
	attrs := []string{"dn"}
	if r.cfg.GroupAttr != "" {
		attrs = append(attrs, r.cfg.GroupAttr)
	}
	req := goldap.NewSearchRequest(
		r.cfg.BaseDN,
		goldap.ScopeWholeSubtree,
		goldap.NeverDerefAliases,
		1, 0, false,
		filter,
		attrs,
		nil,
	)
	res, err := conn.Search(req)
	if err != nil {
		return "", nil, fmt.Errorf("ldap user search: %w", err)
	}
	if len(res.Entries) == 0 {
		return "", nil, nil
	}
	entry := res.Entries[0]
	if r.cfg.GroupAttr != "" {
		groups = entry.GetAttributeValues(r.cfg.GroupAttr)
	}
	return entry.DN, groups, nil
}

func (r *Resolver) searchGroups(conn *goldap.Conn, userDN string) ([]string, error) {
	base := r.cfg.GroupBaseDN
	if base == "" {
		base = r.cfg.BaseDN
	}
	filter := fmt.Sprintf(r.cfg.GroupFilter, escape(userDN))
	req := goldap.NewSearchRequest(
		base,
		goldap.ScopeWholeSubtree,
		goldap.NeverDerefAliases,
		0, 0, false,
		filter,
		[]string{"dn"},
		nil,
	)
	res, err := conn.Search(req)
	if err != nil {
		return nil, fmt.Errorf("ldap group search: %w", err)
	}
	out := make([]string, 0, len(res.Entries))
	for _, e := range res.Entries {
		out = append(out, e.DN)
	}
	return out, nil
}

func classify(groups, adminGroups, readGroups []string) domain.Role {
	set := make(map[string]bool, len(groups))
	for _, g := range groups {
		set[strings.ToLower(g)] = true
	}
	for _, ag := range adminGroups {
		if set[strings.ToLower(ag)] {
			return domain.RoleAdmin
		}
	}
	for _, rg := range readGroups {
		if set[strings.ToLower(rg)] {
			return domain.RoleReadOnly
		}
	}
	return domain.RoleReadOnly
}

func dial(cfg config.LDAPConfig) (*goldap.Conn, error) {
	if strings.HasPrefix(cfg.URL, "ldaps://") {
		// Verify against system roots by default; only skip verification when
		// explicitly opted in (RR_LDAP_INSECURE_SKIP_VERIFY=true) for
		// self-signed certs in dev/CI.
		tlsCfg := &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: cfg.InsecureSkipVerify, //nolint:gosec // gated behind opt-in config
		}
		return goldap.DialURL(cfg.URL, goldap.DialWithTLSConfig(tlsCfg))
	}
	return goldap.DialURL(cfg.URL)
}

// escape protects against LDAP filter injection per RFC 4515.
func escape(s string) string {
	repl := strings.NewReplacer(
		`\`, `\5c`,
		`*`, `\2a`,
		`(`, `\28`,
		`)`, `\29`,
		"\x00", `\00`,
	)
	return repl.Replace(s)
}
