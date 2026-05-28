package api

import (
	"context"
	"net/http"
	"net/url"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const (
	// wsPingInterval is how often the server sends a control ping to detect a
	// dead peer and to keep idle connections alive through proxies.
	wsPingInterval = 20 * time.Second
	// wsReadLimit caps inbound frames. Clients are not expected to send data;
	// this just bounds memory against a misbehaving peer.
	wsReadLimit = 4 * 1024
)

// ws upgrades the request to a WebSocket and streams live-update events. It is
// mounted behind RequireSession, so an anonymous caller is rejected with 401
// before the upgrade ever happens.
//
// Two pumps run for the connection's lifetime, sharing a context derived from
// the request: a write pump that ranges over the hub client's channel and JSON-
// encodes each event, and a read pump that drains/ignores inbound frames and
// detects close. A ping ticker probes liveness. When either pump errors (peer
// gone, ctx done, slow write) the shared context is cancelled so both exit, the
// client is unregistered, and the socket is closed — no goroutine leak.
func (h *handlers) ws(w http.ResponseWriter, r *http.Request) {
	opts := &websocket.AcceptOptions{}
	// Pin the allowed origin to the configured public host. websocket.Accept
	// already permits same-origin requests; adding the public host covers the
	// reverse-proxy case where the browser's Origin differs from the Host seen
	// by this process.
	if u, err := url.Parse(h.PublicURL); err == nil && u.Host != "" {
		opts.OriginPatterns = []string{u.Host}
	}

	conn, err := websocket.Accept(w, r, opts)
	if err != nil {
		h.Logger.Error("ws accept", "err", err)
		return
	}
	conn.SetReadLimit(wsReadLimit)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	client := h.Hub.Register()
	defer h.Hub.Unregister(client)
	defer conn.Close(websocket.StatusNormalClosure, "")

	// Read pump: drain inbound frames (we ignore content) and surface a closed
	// or broken connection by cancelling the shared context.
	go func() {
		defer cancel()
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				return
			}
		}
	}()

	// Write pump (this goroutine): fan events out to the peer and ping
	// periodically. Returns — and via defers cleans up — on any error.
	ticker := time.NewTicker(wsPingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-client.Send:
			if err := wsjson.Write(ctx, conn, ev); err != nil {
				return
			}
		case <-ticker.C:
			if err := conn.Ping(ctx); err != nil {
				return
			}
		}
	}
}
