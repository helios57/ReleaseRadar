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
}

// Hub is the goroutine-safe registry + fan-out point.
type Hub struct {
	mu      sync.Mutex
	clients map[*Client]struct{}
	rev     atomic.Int64
}

// New returns an empty Hub ready for use.
func New() *Hub {
	return &Hub{clients: make(map[*Client]struct{})}
}

// Register creates a client with a buffered send channel and adds it to the
// registry. The caller owns draining (and eventually Unregister-ing) it.
func (h *Hub) Register() *Client {
	c := &Client{Send: make(chan Event, clientBuffer)}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	return c
}

// Unregister removes a client from the registry. It is safe to call more than
// once. It does NOT close c.Send — the write pump owns the channel and exits on
// its own via context cancellation, avoiding a send-on-closed-channel race with
// a concurrent Broadcast.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
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
