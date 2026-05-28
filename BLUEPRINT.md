# ReleaseRadar — Architecture Blueprint

## 1. System overview

ReleaseRadar is a deployment-orchestration and calendar dashboard. The system
brings four orthogonal capabilities together behind a single web application:

1. A **rollout master-data model** (products, rollout types with cascade plans,
   tasks) that's reusable across many concrete rollouts.
2. A **scheduling layer** for concrete rollouts and locks ("Sperren") plus an
   **iCalendar feed** so the schedule lands in everyone's Outlook.
3. **Authentication via Microsoft Entra ID** (OIDC) combined with **LDAP-group
   based authorization** — admins write, readonly users see only the timeline
   and the external description.
4. **Microsoft Teams notifications** through the modern *Workflows* webhook
   (Adaptive Cards). Notifications are scheduled in advance per the cascade
   plan (1 h / 1 d / 1 w / 2 w windows depending on the stage env).
5. **Live updates** over a WebSocket (`/api/ws`): a change made by any client
   is reflected in every other open client within ~150 ms, with no manual
   reload and no flicker. A connection-status indicator shows channel health.
   See §9.

```
┌──────────┐     OIDC      ┌──────────┐     LDAPS     ┌──────────┐
│ Browser  │ ─────────────▶│ Keycloak │               │ OpenLDAP │
└────┬─────┘               │  (IdP)   │               └────▲─────┘
     │                     └──────────┘                    │
     │  cookies (HMAC-signed)                              │
     ▼                                                     │
┌──────────────────────────────────────────────┐  group lookup
│        nginx (frontend image, :80)          │           │
│  /        → Angular SPA                      │           │
│  /api/*   → backend                          │           │
│  /auth/*  → backend                          │           │
│  /realms/*→ Keycloak                         │           │
└────────────────────┬─────────────────────────┘           │
                     ▼                                     │
              ┌───────────┐     pgx pool      ┌────────────┴───┐
              │  backend  │ ─────────────────▶│   PostgreSQL    │
              │  (Go)     │                   └─────────────────┘
              └───────────┘
                     │ webhook (Adaptive Card)
                     ▼
              ┌────────────────┐
              │  Teams         │   (mocked in tests by ./mock-teams)
              │  Workflows     │
              └────────────────┘
```

## 2. Process & deployment layout

| Service       | Image                                  | Internal port | External port |
| ------------- | -------------------------------------- | ------------- | ------------- |
| `postgres`    | `postgres:16-alpine`                   | 5432          | —             |
| `openldap`    | `osixia/openldap:1.5.0`                | 389           | —             |
| `keycloak`    | `quay.io/keycloak/keycloak:26.0`       | 8080          | — (proxied)   |
| `mock-teams`  | local build (`./mock-teams`)           | 4000          | 4000 (tests)  |
| `backend`     | local build (`./backend`)              | 8080          | — (proxied)   |
| `frontend`    | local build (`./frontend`, nginx)      | 80            | 8080          |

`frontend` is the sole public entry point. The browser only ever talks to
`http://localhost:8080`. The nginx config reverse-proxies `/api/*` and
`/auth/*` to the Go backend and `/realms/*` to Keycloak so the *same origin*
hosts the SPA, the API, and the IdP. That removes the "browser-internal vs.
container-internal hostname" hazard that normally bites OIDC dockerization.

## 3. Authentication & authorization flow

### 3.1 OIDC login (Authorization Code with PKCE-less confidential client)

```
1. Browser                                       GET  /auth/login
2. backend                  →  302               http://localhost:8080/realms/.../auth?...
3. Keycloak (login form)
4. Browser POSTs creds      →  302               http://localhost:8080/auth/callback?code=...
5. backend ─ Exchange ─→ http://keycloak:8080    (uses RR_OIDC_DISCOVERY_URL)
6. backend verifies id_token.iss == http://localhost:8080/realms/releaseradar
7. backend looks up the user's email in OpenLDAP, derives admin/readonly
8. backend issues HMAC-signed `rr_session` cookie  →  302  /
```

The split-horizon piece is handled by `go-oidc`'s `InsecureIssuerURLContext`:
discovery is fetched from the *internal* hostname (`keycloak:8080`) while the
issuer-claim validation is pinned to the *external* origin.

### 3.2 LDAP group resolution

OpenLDAP doesn't ship a `memberOf` overlay by default, so the resolver runs
a **group search** instead of reading the attribute off the user:

```
(&(objectClass=groupOfNames)(member=<userDN>))
```

The DNs returned are compared against `RR_LDAP_ADMIN_GROUPS` and
`RR_LDAP_READ_GROUPS`. Admin wins over reader. Default falls back to
readonly. Group-list checks are case-insensitive.

Microsoft Entra (real production) emits `memberOf` directly — that path is
covered too (`RR_LDAP_GROUP_ATTR=memberOf`, no group filter).

### 3.3 Enforcement matrix

|                                | admin | readonly | anonymous |
| ------------------------------ | :---: | :------: | :-------: |
| `GET /api/me`                  |  ✓    |    ✓     |   401     |
| `GET /api/products`            |  ✓    |    ✓     |   401     |
| `GET /api/rollouts`            |  ✓    |  ✓ (filtered) | 401   |
| `GET /api/rollouts/{id}`       |  ✓    |  ✓ (filtered) | 401   |
| `GET /api/locks`               |  ✓    |    ✓     |   401     |
| `GET /api/calendar.ics`        |  ✓    |    ✓     |   401     |
| `GET /api/ws` (WebSocket)      |  ✓    |    ✓     |   401     |
| `GET /api/rollout-types`       |  ✓    |  **403** |   401     |
| `POST /api/products`           |  ✓    |  **403** |   401     |
| `POST /api/rollout-types`      |  ✓    |  **403** |   401     |
| `POST /api/rollouts`           |  ✓    |  **403** |   401     |
| `PATCH/DELETE /api/rollouts/{id}` |  ✓ |  **403** |   401     |
| `PATCH /api/rollouts/{}/tasks/{}` |  ✓ |  **403** |   401     |
| `POST /api/locks`              |  ✓    |  **403** |   401     |
| `PATCH/DELETE /api/locks/{id}` |  ✓    |  **403** |   401     |

"filtered" = the server strips `descInt` and `risks` from the JSON payload
*server-side* — readonly cannot bypass this with a hand-crafted request.

## 4. Data model

```
products (id PK)
   └── rollouts (id PK, product_id FK, type_id FK)
                  ├── rollout_stages (PK rollout_id, seq)
                  ├── rollout_actors (PK rollout_id, actor_id)
                  └── rollout_tasks  (PK rollout_id, seq)

rollout_types (id PK)
   └── rollout_type_tasks (PK type_id, seq, description)

locks (id PK, products[] of allowed product IDs)

actors (id PK, email UNIQUE, role enum)

notifications (BIGSERIAL, fire_at, sent_at, ...)
```

Task inheritance: `Repository.CreateRollout` runs inside one transaction —
read the parent `rollout_types.tasks`, insert one row per task into
`rollout_tasks`. Every later mutation (`PATCH /api/rollouts/{}/tasks/{seq}`)
operates on the rollout's own task rows.

`notifications` is a write-once dispatch queue. A single goroutine
(`internal/notify`) wakes every `RR_NOTIFY_TICK` and drains rows whose
`fire_at <= now AND sent_at IS NULL`. On failure the row stays pending so the
next tick retries.

## 5. Teams webhook payload

Office 365 Connectors were retired April 2026. The backend targets the modern
**Power Automate / Workflows** webhook only:

```json
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "contentUrl": null,
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.5",
        "body": [
          { "type": "TextBlock", "size": "Large", "weight": "Bolder", "text": "…" },
          { "type": "FactSet",   "facts": [...] },
          { "type": "TextBlock", "text": "<descExt>", "wrap": true }
        ]
      }
    }
  ]
}
```

`mock-teams/server.js` validates this envelope and rejects malformed bodies
with `400`, so an accidental schema regression in `internal/teams` lights up
the e2e suite immediately.

### 5.1 Scheduling matrix

| Stage env | Advance windows scheduled                |
| --------- | ---------------------------------------- |
| non-prod  | 1 h                                      |
| prod1     | 1 w, 1 d, 1 h                            |
| prod2     | 2 w, 1 w, 1 h                            |

If the rollout is created *after* a window's natural fire-time, the fire-time
is clipped to "now+1s" so at least one notification still goes out on the
next dispatcher tick.

## 6. Frontend

- **Zoneless** Angular 21 standalone app — no `zone.js` in the bundle.
- **Signals throughout**: `signal`, `computed`, `toSignal`, `effect`,
  `afterRenderEffect` for ResizeObserver-driven layout. Streams from `HttpClient`
  are converted with `toSignal(observable, { initialValue })` so templates
  read pure signals.
- **Routing**: `provideRouter(routes, withHashLocation())` for clean deep
  links (e.g. `/#/rollout/r-42`).
- **HTTP**: `provideHttpClient(withFetch(), withInterceptors([authInterceptor]))`
  — the interceptor sets `withCredentials: true` so the HMAC session cookie
  travels with every call.
- **Session bootstrap**: `provideAppInitializer(() => inject(SessionStore).load())`
  blocks the first render until `/api/me` resolves, so role-gated UI never
  flashes the wrong state.
- **Design system**: a single `design.css` (88 KB, copied from the Design
  Bundle) ships unmodified. Tailwind v4 is layered on top via a separate
  entry-point CSS file and used for layout one-offs.

## 7. Test architecture

```
e2e/
 ├── playwright.config.ts        # 1 worker, retains traces, baseURL
 ├── helpers/auth.ts             # login(), user fixtures
 └── tests/
     ├── global.setup.ts         # logs alice + bob, saves storageState
     ├── auth.spec.ts            # /api/me, logout, anon 401
     ├── authorization.spec.ts   # readonly→403 matrix, field stripping, readonly GET locks/products
     ├── crud.spec.ts            # create rollout + lock, task patch
     ├── requirements.spec.ts    # rollout/lock update+delete, 9 types, task logging, iCal
     ├── calendar.spec.ts        # iCal feed + RFC 5545 fold limit
     ├── teams-notifications.spec.ts # async wait for mock-teams /received
     ├── live-updates.spec.ts    # WebSocket: live create/delete propagation, indicator, no-flicker
     ├── ui-crud.spec.ts         # SPA: create/execute/edit/delete via modals + detail
     └── ui.spec.ts              # SPA: role-gated New-rollout button, timeline render
```

The setup project runs first, logs each test user through the *real* Keycloak
form, and saves the post-login storage state. Other specs `browser.newContext`
with one of those state files so they start authenticated as the right role.

### 7.1 Watchdog ("the loop")

Two scripts cooperate:

- `scripts/wait-for-stack.sh` — one-shot polling of every healthcheck plus
  the public HTTP endpoints, exits 0 when the whole graph converges or 1 on
  timeout (with `compose logs` dumped to stderr for triage).
- `scripts/healthcheck-loop.sh` — runs *during* the e2e suite, prints a
  one-line heartbeat every 10 s, and aborts the run if it observes
  `MAX_CONSECUTIVE_FAIL=3` (default) successive failures. Surfaces a hung
  Keycloak / pgpool / network blip before the Playwright timeout window.

`scripts/e2e.sh` glues them together: `up --build` → `wait-for-stack` → start
watchdog → `npm test` → always teardown + collect logs to `./e2e-logs/`.

## 8. Configuration surface (backend)

| Env var                    | Default                  | Notes |
| -------------------------- | ------------------------ | ----- |
| `RR_LISTEN_ADDR`           | `:8080`                  |       |
| `RR_PUBLIC_URL`            | `http://localhost:8080`  | Browser-facing origin |
| `RR_DATABASE_URL`          | *(required)*             | pgx DSN |
| `RR_SESSION_SECRET`        | *(required)*             | HMAC key |
| `RR_SEED_ON_START`         | `false`                  | seed demo data if empty |
| `RR_NOTIFY_TICK`           | `30s`                    | dispatcher loop interval |
| `RR_OIDC_ISSUER`           | —                        | Token `iss` claim |
| `RR_OIDC_DISCOVERY_URL`    | = issuer                 | Override for split-horizon |
| `RR_OIDC_CLIENT_ID`        | —                        |       |
| `RR_OIDC_CLIENT_SECRET`    | —                        |       |
| `RR_OIDC_REDIRECT_URL`     | —                        |       |
| `RR_LDAP_URL`              | —                        | `ldap://` or `ldaps://` |
| `RR_LDAP_USER_FILTER`      | `(userPrincipalName=%s)` | AD-style by default |
| `RR_LDAP_GROUP_ATTR`       | `memberOf`               | AD path |
| `RR_LDAP_GROUP_FILTER`     | *(empty)*                | Set for OpenLDAP-style group search |
| `RR_LDAP_GROUP_BASE_DN`    | *(empty)*                | "" → uses base DN |
| `RR_LDAP_ADMIN_GROUPS`     | *(empty)*                | **`;`-separated** full DNs |
| `RR_LDAP_READ_GROUPS`      | *(empty)*                | **`;`-separated** full DNs |
| `RR_LDAP_INSECURE_SKIP_VERIFY` | `false`              | skip `ldaps://` cert verify — dev/CI self-signed only |
| `RR_TEAMS_WEBHOOK_PROD`    | —                        | TMS_PROD channel |
| `RR_TEAMS_WEBHOOK_NONPROD` | —                        | TMS_NP channel |

## 9. Live updates (WebSocket)

Open clients stay in sync without polling. Every mutation broadcasts a tiny
event; each client refetches through its existing role-filtered REST path.

```
mutation handler ── hub.Broadcast(entity,id,action) ──▶ hub ──▶ each WS client
                                                                  │
client onmessage ──▶ LiveService ── debounce 150ms ──▶ RefreshBus.bump()
                                                                  │
                              existing switchMap refetch (role-filtered REST)
```

### 9.1 Wire contract

`GET /api/ws` upgrades to a WebSocket behind `RequireSession` (anonymous → 401
**before** the upgrade). The server→client frame is intentionally tiny and
carries **no domain data**:

```json
{ "entity": "rollout", "id": "r-42", "action": "create", "rev": 17 }
```

`entity ∈ {rollout, lock, product, rollout-type, task}`,
`action ∈ {create, update, delete}`, `rev` is a process-global monotonic
counter. Because the frame carries no payload, the role-based field-stripping
(`descInt`/`risks`) is preserved automatically: each client refetches via the
same REST endpoints, so a readonly user can never receive internal fields over
the socket.

### 9.2 Backend (`internal/hub` + `internal/api/ws.go`)

- **`hub`** is a goroutine-safe registry. `Broadcast` assigns the next `rev`
  (`atomic.Int64`) and does a **non-blocking** send to every client's buffered
  channel (cap 32). A client whose buffer is full is *skipped* (slow-consumer
  drop) — Broadcast never blocks the mutation path. This is safe because the
  client reconnects and triggers one catch-up refetch, and any delivered later
  event triggers a full refetch anyway.
- **`ws.go`** runs two pumps over one request-derived, cancellable context: a
  write pump (`wsjson.Write` of each event + a ~20 s server ping) and a read
  pump (drains/ignores inbound frames, detects close). Either pump erroring
  cancels the context so both exit, the client is unregistered, and the socket
  closes — no goroutine leak. The accept origin is pinned to `RR_PUBLIC_URL`.
- Every mutation handler calls `Broadcast` **after** the DB commit succeeds.

### 9.3 Frontend (`core/live.service.ts`)

- Opens a same-origin `ws(s)://…/api/ws`; exposes a `status` signal
  (`connecting | live | reconnecting | offline`) rendered by the shell-header
  indicator (`role="status"`, `aria-live`, reduced-motion-aware pulse).
- On each event (newer `rev`) it triggers a **debounced** `RefreshBus.bump()`
  (~150 ms) so a burst collapses into one refetch. On (re)connect it bumps once
  (debounced) to catch up on anything missed while disconnected.
- Reconnects with exponential backoff + jitter (0.5 s→8 s); the backoff only
  resets after the connection stays open for a stability window, so an
  accept-then-drop server can't cause a reconnect/refetch storm. `lastRev`
  resets on each fresh socket so a backend restart (rev counter back to 0)
  doesn't permanently wedge updates. Tears down via `DestroyRef`.

### 9.4 No-flicker guarantee

1. `bump()` → `switchMap` refetch; `combineLatest`/`forkJoin` only emit when
   **all** inner requests complete, and on a transient error the stream
   completes without emitting (`EMPTY`) — so `toSignal` keeps the **previous**
   value and never flashes to empty/initialValue during a refetch.
2. Every `@for` uses a **stable** `track` keyed on entity identity (rollout id,
   lock id, product id, `env@startAt` for stages) so Angular reuses DOM nodes.
3. The 150 ms debounce coalesces bursts into a single refetch.

The nginx reverse proxy exposes `/api/ws` via an exact-match `location` with
HTTP/1.1 `Upgrade` headers and a long `proxy_read_timeout`, so the socket isn't
reaped while idle (the exact match wins over the `/api/` prefix's 60 s timeout).
