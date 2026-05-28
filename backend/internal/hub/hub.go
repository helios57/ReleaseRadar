// Package hub implements an in-process fan-out for live-update events.
//
// A single Hub holds the set of connected WebSocket clients. Mutation handlers
// call Broadcast after a successful DB commit; the Hub assigns the event a
// monotonic, process-global revision and pushes it to every client's buffered
// send channel.
//
// Slow-consumer policy: the send is NON-BLOCKING. If a client's buffer is full
// (it can't keep up, or its write pump is wedged) the event is simply dropped
// for that client — Broadcast never blocks on a slow reader and the mutation
// path stays fast. This is safe because events carry no domain payload: a
// client that misses events reconnects and triggers one catch-up refetch, so
// no data is lost (see the live-updates design doc). The Hub is goroutine-safe;
// a mutex guards the client registry and an atomic counter drives rev.
package hub

import (
	"sync"
	"sync/atomic"
)

// clientBuffer is the per-client send-channel capacity. A small buffer absorbs
// short bursts; once it fills the client is treated as slow and events are
// dropped for it (it will reconnect + refetch).
const clientBuffer = 32

// maxPerUser caps concurrent live connections per authenticated user so a
// single session can't exhaust goroutines/memory (each socket costs two
// goroutines + a buffered channel) or inflate the Broadcast fan-out cost.
const maxPerUser = 8

// Event is the server→client live-update message. It carries no domain data —
// only enough for a client to decide whether and what to refetch.
type Event struct {
	Entity string `json:"entity"`
	ID     string `json:"id"`
	Action string `json:"action"`
	Rev    int64  `json:"rev"`
}

// Client is a single connected consumer. The ws handler ranges over Send in a
// write pump; the Hub pushes events onto it non-blockingly.
type Client struct {
	Send chan Event
	user string
}

// Hub is the goroutine-safe registry + fan-out point.
type Hub struct {
	mu      sync.Mutex
	clients map[*Client]struct{}
	counts  map[string]int // live connection count per user id (cap enforcement)
	rev     atomic.Int64
}

// New returns an empty Hub ready for use.
func New() *Hub {
	return &Hub{clients: make(map[*Client]struct{}), counts: make(map[string]int)}
}

// Register creates a client for the given user and adds it to the registry.
// It returns ok=false (and no client) if the user is already at maxPerUser
// connections, so the caller can reject the upgrade. The caller owns draining
// (and eventually Unregister-ing) the returned client.
func (h *Hub) Register(userID string) (*Client, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.counts[userID] >= maxPerUser {
		return nil, false
	}
	c := &Client{Send: make(chan Event, clientBuffer), user: userID}
	h.clients[c] = struct{}{}
	h.counts[userID]++
	return c, true
}

// Unregister removes a client from the registry. It is safe to call more than
// once. It does NOT close c.Send — the write pump owns the channel and exits on
// its own via context cancellation, avoiding a send-on-closed-channel race with
// a concurrent Broadcast.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c]; !ok {
		return // already removed; keep counts correct on double-unregister
	}
	delete(h.clients, c)
	if h.counts[c.user]--; h.counts[c.user] <= 0 {
		delete(h.counts, c.user)
	}
}

// Broadcast assigns the next revision and delivers the event to every currently
// registered client with a non-blocking send. Slow clients (full buffer) are
// skipped — see the package doc for why that's safe.
func (h *Hub) Broadcast(entity, id, action string) {
	ev := Event{
		Entity: entity,
		ID:     id,
		Action: action,
		Rev:    h.rev.Add(1),
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		select {
		case c.Send <- ev:
		default:
			// Buffer full: drop for this slow client; it reconnects + refetches.
		}
	}
}
