# ReleaseRadar

Deployment-orchestration + calendar dashboard with Microsoft Entra SSO, LDAP
group-based authorization, Microsoft Teams (Workflows) notifications, and an
iCalendar feed for Outlook subscriptions.

* **Backend:** Go (module directive `go 1.25.0`; the enhanced method+wildcard
  `net/http` routing from 1.22+ is used directly). pgx + standard
  `database/sql`. No web framework. WebSocket via `github.com/coder/websocket`.
* **Frontend:** Angular 21 zoneless standalone app, Signals + Signal Forms,
  Tailwind v4, Vitest as the default test runner.
* **Auth:** OIDC via Microsoft Entra ID (in production) or **Keycloak** (in
  the docker stack). LDAP-group → role resolution; works with AD's
  `memberOf` attribute *and* OpenLDAP-style group search.
* **Notifications:** Microsoft Teams **Workflows** (Power Automate) webhooks
  with Adaptive Cards. The legacy Office 365 Connectors path is *not*
  supported (retired April 2026).
* **CalDAV:** read-only iCalendar feed at `GET /api/calendar.ics`; readonly
  users are explicitly allowed to subscribe.
* **Live updates:** a WebSocket at `GET /api/ws` pushes tiny change events so
  every open client refetches and stays in sync within ~150 ms — no reload, no
  flicker. A header indicator shows channel health. See **BLUEPRINT.md §9**.

See **[BLUEPRINT.md](./BLUEPRINT.md)** for the architecture deep-dive (login
flow, data model, scheduler, test architecture).

## Repository layout

```
backend/                Go service (cmd, internal/{api,auth,calendar,config,
                        domain,hub,ldap,middleware,notify,store,teams})
                        — hub = in-process WebSocket fan-out for live updates
frontend/               Angular 21 SPA + nginx Dockerfile + reverse-proxy conf
mock-teams/             Tiny Node webhook receiver used by e2e tests
infra/
  keycloak/             releaseradar-realm.json — imported on first boot
  ldap/                 LDIF bootstrap (users + groups)
e2e/                    Playwright suite
scripts/
  e2e.sh                Top-level orchestrator (up → wait → test → teardown)
  wait-for-stack.sh     One-shot readiness probe across every service
  healthcheck-loop.sh   Watchdog that aborts if 3 consecutive probes fail
docker-compose.yml      Full stack: postgres + openldap + keycloak +
                        mock-teams + backend + nginx frontend
BLUEPRINT.md            Architecture / data flow / threat model
```

## Quickstart — full e2e in one shot

```bash
./scripts/e2e.sh
```

That builds every image, brings the stack up, waits for healthchecks to
converge, starts the watchdog, installs Playwright, runs every spec, and
tears the stack down with logs collected into `./e2e-logs/`.

## Manual stack bring-up

```bash
docker compose up --build -d
scripts/wait-for-stack.sh 300

# In another shell — keep a heartbeat going so a hung Keycloak shows up:
scripts/healthcheck-loop.sh 10
```

Public endpoints (everything served from the nginx in the `frontend` image):

| URL                                                | Purpose             |
| -------------------------------------------------- | ------------------- |
| `http://localhost:8080/`                           | Angular SPA         |
| `http://localhost:8080/api/...`                    | Go backend          |
| `http://localhost:8080/auth/login`                 | Start OIDC flow     |
| `http://localhost:8080/realms/releaseradar/...`    | Keycloak (proxied)  |
| `http://localhost:8080/api/calendar.ics`           | iCalendar feed      |
| `http://localhost:4000/received`                   | Mock-teams payloads |

Test users (passwords match the username for convenience):

| User  | Email                | LDAP group   | Role     |
| ----- | -------------------- | ------------ | -------- |
| alice | alice@example.com    | rr-admins    | admin    |
| bob   | bob@example.com      | rr-readers   | readonly |

## E2E suite

```bash
cd e2e
npm install
npx playwright install --with-deps chromium
npm test
```

Specs (see `e2e/tests/`):

| Spec                            | What it pins down                                     |
| ------------------------------- | ----------------------------------------------------- |
| `global.setup.ts`               | Real Keycloak login for alice + bob, storageState saved |
| `auth.spec.ts`                  | anonymous → 401, role mapping, logout clears session  |
| `authorization.spec.ts`         | readonly → 403 matrix, internal-field stripping, readonly GET locks/products |
| `crud.spec.ts`                  | Create rollout + lock, task inheritance, task PATCH   |
| `requirements.spec.ts`          | Rollout/lock update+delete, 9 rollout types, task logging, iCal |
| `calendar.spec.ts`              | iCal feed for both roles + RFC 5545 fold limit        |
| `teams-notifications.spec.ts`   | Async dispatch to mock-teams, Adaptive Card envelope  |
| `live-updates.spec.ts`          | WebSocket: live create/delete propagation, "Live" indicator, no-flicker |
| `ui-crud.spec.ts`               | SPA: create/execute/edit/delete via modals + detail page |
| `ui.spec.ts`                    | SPA: New-rollout button gated on role, timeline render |

## Running outside docker

### Backend

```bash
cd backend
export RR_DATABASE_URL=postgres://user:pass@localhost:5432/releaseradar?sslmode=disable
export RR_SESSION_SECRET=$(openssl rand -hex 32)
export RR_OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
export RR_OIDC_CLIENT_ID=<app-id>
export RR_OIDC_CLIENT_SECRET=<client-secret>
export RR_OIDC_REDIRECT_URL=http://localhost:8080/auth/callback
export RR_LDAP_URL=ldaps://corp.example.com
export RR_LDAP_BIND_DN="CN=svc,OU=Service,DC=corp,DC=example,DC=com"
export RR_LDAP_BIND_PASS=...
export RR_LDAP_BASE_DN="DC=corp,DC=example,DC=com"
export RR_LDAP_ADMIN_GROUPS="CN=ReleaseRadar Admins,..."
export RR_LDAP_READ_GROUPS="CN=ReleaseRadar Readers,..."
export RR_TEAMS_WEBHOOK_PROD=https://...azure.com/.../workflows/triggers/...
export RR_TEAMS_WEBHOOK_NONPROD=https://...
go run ./cmd/server
```

The complete env-var surface is documented in **BLUEPRINT.md §8**.

### Frontend

```bash
cd frontend
npm start
```

For non-docker dev you need a reverse-proxy (or Vite/Angular proxy config)
that forwards `/api/*` and `/auth/*` to the backend.

## Roles

LDAP group memberships → role:

* `admin` — full CRUD on rollouts, locks, master data; sees `descInt` +
  `risks`.
* `readonly` — only timeline/list/calendar; every mutating endpoint and
  every master-data fetch returns `403`; the API server-side strips
  `descInt` and `risks` from rollout payloads.

## Teams payload

Modern Workflows webhooks expect:

```json
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "contentUrl": null,
      "content": { "type": "AdaptiveCard", "version": "1.5", "body": [...] }
    }
  ]
}
```

Advance-warning schedule per stage env:

| Env       | Windows scheduled       |
| --------- | ----------------------- |
| non-prod  | 1 h                     |
| prod1     | 1 w / 1 d / 1 h         |
| prod2     | 2 w / 1 w / 1 h         |
