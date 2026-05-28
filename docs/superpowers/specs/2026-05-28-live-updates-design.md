# ReleaseRadar — Live Updates (WebSocket) Design

**Date:** 2026-05-28
**Status:** Approved for implementation

## Goal

Open clients reflect each other's changes **live**, on every data surface
(rollouts, locks, products, rollout-types, tasks), without manual reload and
**without flicker**. A small connection-status indicator tells the user whether
the live channel is healthy. No per-change toasts.

## Non-goals

- No granular client-side cache patching. We reuse the existing refetch path.
- No change to the Teams notification path, OIDC, or LDAP authz.
- No new auth model: the WS endpoint reuses the existing session cookie + role.

## Architecture

```
mutation handler ──hub.Broadcast(Event)──▶ hub ──fan-out──▶ each WS client
                                                              │
client receives Event ──▶ LiveService ──debounce 150ms──▶ RefreshBus.bump()
                                                              │
                          existing switchMap refetch (role-filtered REST)
```

The event carries **no domain data** — only `entity`, `id`, `action`, `rev`.
Clients refetch through the existing role-filtered REST endpoints, so
`descInt`/`risks` stripping for readonly users is preserved automatically and
there is exactly one source of truth for payload shape.

## Wire contract (the parallel-agent boundary)

**Endpoint:** `GET /api/ws` — upgrades to WebSocket. Requires a valid
`rr_session` (wrapped in `RequireSession`; anonymous → `401` before upgrade).

**Server → client message** (JSON text frame):

```json
{ "entity": "rollout", "id": "r-42", "action": "create", "rev": 17 }
```

| Field    | Type   | Values                                                        |
| -------- | ------ | ------------------------------------------------------------- |
| `entity` | string | `rollout` \| `lock` \| `product` \| `rollout-type` \| `task`  |
| `id`     | string | entity id (`task` → parent rollout id)                        |
| `action` | string | `create` \| `update` \| `delete`                              |
| `rev`    | number | monotonic, process-global, increases on every broadcast       |

**Client → server:** none required. The server ignores inbound frames except
pong. The server sends a control ping every ~20s; a client that fails to pong
within the read deadline is dropped.

**Connection lifecycle:** on connect the server sends nothing special; the
client triggers one refetch on (re)connect to catch anything missed while
disconnected. `rev` lets the client drop stale/duplicate events.

## Backend (`internal/hub` + ws handler)

- **`internal/hub`**: goroutine-safe registry. `Register() *Client`,
  `Unregister(*Client)`, `Broadcast(Event)`. Each `Client` owns a buffered
  send channel (`chan Event`, cap ~32). Broadcast does a non-blocking send;
  if a client's buffer is full it is dropped (slow-consumer protection) — the
  client reconnects and refetches, so no data is lost. `rev` is an
  `atomic.Int64` incremented per broadcast.
- **ws handler** (`GET /api/ws`): `coder/websocket` Accept; spawn a write pump
  reading the client channel → `wsjson.Write`, and a read pump that drains
  inbound frames / detects close; server ping ticker ~20s; context cancellation
  + `Unregister` on disconnect. Origin check pinned to `PublicURL`.
- **Broadcasts**: `createRollout`/`updateRollout`/`deleteRollout`/`updateTask`,
  `createLock`/`updateLock`/`deleteLock`, `upsertProduct`, `upsertRolloutType`
  each call `hub.Broadcast(...)` **after** the successful DB commit. `Deps`
  gains `Hub *hub.Hub`; `main.go` constructs it.
- **Tests** (first backend tests in the repo): hub register/broadcast/
  unregister, buffered-drop of a slow client, concurrent broadcast race
  (run with `-race`), and ws handler returns `401` without a session.

## Frontend (`core/live.service.ts`)

- Opens `new WebSocket((location.protocol==='https:'?'wss':'ws')+'//'+host+'/api/ws')`.
- `status` signal: `'connecting' | 'live' | 'reconnecting' | 'offline'`.
- On message: parse, drop if `rev <= lastRev`, else `scheduleBump()`
  (debounced ~150ms `RefreshBus.bump()`).
- On open: set `live`, reset backoff, `RefreshBus.bump()` once (catch-up).
- On close/error: set `reconnecting`, reconnect with exponential backoff
  (e.g. 0.5s → 8s, ±jitter). Stops cleanly on app destroy.
- Started from `provideAppInitializer` after session load (only connect when
  authenticated). Zoneless-safe: all state via signals, no `zone.js`.
- **Connection indicator**: small dot + label in the shell header bound to
  `status` (green "Live", amber "Reconnecting…", grey "Offline").

## No-flicker strategy (hard requirement)

1. `bump()` → `switchMap` refetch → `combineLatest` only emits when **all**
   inner requests complete, so `toSignal` keeps the **previous** value during
   the in-flight window — no flash to empty/initialValue.
2. Every `@for` uses a **stable** `track` key (entity id), so Angular reuses
   existing DOM nodes and only mutates changed cells.
3. Debounce collapses bursts into a single refetch.
4. Audit task: confirm each view (timeline, list, locks, master-data,
   contacts, rollout-detail, shell) satisfies 1+2; fix any that reset to an
   empty/initial value on refetch or lack stable track keys.

## nginx

Add a dedicated `location = /api/ws` (before `location /api/`) with
`proxy_http_version 1.1`, `Upgrade`/`Connection` headers, and a long
`proxy_read_timeout` so idle WS connections aren't reaped.

## e2e

- `live-updates.spec.ts`: alice (admin) + bob (readonly) contexts. bob opens
  the list; alice creates a rollout via API/UI; assert bob's list shows the new
  rollout **without reload** and the indicator reads "Live". Assert a
  pre-existing row's element stays attached across the update (no teardown =
  no flicker proxy). A reconnect assertion: indicator recovers to "Live".

## Verification gate

`go build ./... && go vet ./... && go test -race ./...`; frontend build +
unit tests; full `./scripts/e2e.sh` green.
