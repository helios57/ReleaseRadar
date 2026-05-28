package hub

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

// recv reads one event from c.Send or fails if none arrives promptly.
func recv(t *testing.T, c *Client) Event {
	t.Helper()
	select {
	case ev := <-c.Send:
		return ev
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
		return Event{}
	}
}

// mustRegister registers a client for the test goroutine and fails if capped.
func mustRegister(t *testing.T, h *Hub, user string) *Client {
	t.Helper()
	c, ok := h.Register(user)
	if !ok {
		t.Fatalf("register %q unexpectedly at cap", user)
	}
	return c
}

func TestBroadcastDeliversToClient(t *testing.T) {
	h := New()
	c := mustRegister(t, h, "u1")

	h.Broadcast("rollout", "r-1", "create")

	ev := recv(t, c)
	if ev.Entity != "rollout" || ev.ID != "r-1" || ev.Action != "create" {
		t.Fatalf("unexpected event: %+v", ev)
	}
	if ev.Rev != 1 {
		t.Fatalf("expected first rev=1, got %d", ev.Rev)
	}
}

func TestRevIsMonotonic(t *testing.T) {
	h := New()
	c := mustRegister(t, h, "u1")

	h.Broadcast("lock", "l-1", "create")
	h.Broadcast("lock", "l-1", "update")
	h.Broadcast("lock", "l-1", "delete")

	var last int64
	for i := 0; i < 3; i++ {
		ev := recv(t, c)
		if ev.Rev <= last {
			t.Fatalf("rev not increasing: got %d after %d", ev.Rev, last)
		}
		last = ev.Rev
	}
}

func TestUnregisterStopsDelivery(t *testing.T) {
	h := New()
	c := mustRegister(t, h, "u1")
	h.Unregister(c)

	h.Broadcast("product", "p-1", "update")

	select {
	case ev := <-c.Send:
		t.Fatalf("unregistered client received event: %+v", ev)
	case <-time.After(50 * time.Millisecond):
		// expected: nothing delivered.
	}
}

func TestSlowClientIsDroppedWithoutBlocking(t *testing.T) {
	h := New()
	c := mustRegister(t, h, "u1")

	// Fill the buffer plus one extra; Broadcast must never block even though
	// nothing is draining c.Send.
	done := make(chan struct{})
	go func() {
		for i := 0; i < clientBuffer+5; i++ {
			h.Broadcast("rollout", "r-x", "update")
		}
		close(done)
	}()

	select {
	case <-done:
		// good: all broadcasts returned despite the full buffer.
	case <-time.After(time.Second):
		t.Fatal("Broadcast blocked on a slow client")
	}

	// The channel holds at most its capacity; extras were dropped.
	if got := len(c.Send); got > clientBuffer {
		t.Fatalf("buffer exceeded capacity: %d", got)
	}
}

func TestPerUserConnectionCap(t *testing.T) {
	h := New()
	clients := make([]*Client, 0, maxPerUser)
	for i := 0; i < maxPerUser; i++ {
		c, ok := h.Register("alice")
		if !ok {
			t.Fatalf("registration %d should succeed (under cap)", i)
		}
		clients = append(clients, c)
	}
	// The next one for the same user must be rejected.
	if _, ok := h.Register("alice"); ok {
		t.Fatal("registration beyond cap should be rejected")
	}
	// A different user is unaffected.
	if _, ok := h.Register("bob"); !ok {
		t.Fatal("a different user should still be able to connect")
	}
	// Freeing one slot lets alice connect again.
	h.Unregister(clients[0])
	if _, ok := h.Register("alice"); !ok {
		t.Fatal("after unregister, alice should be able to reconnect")
	}
}

func TestConcurrentBroadcastAndRegistration(t *testing.T) {
	h := New()

	// Drainers keep a set of long-lived clients from filling up.
	stop := make(chan struct{})
	var drainers sync.WaitGroup
	for i := 0; i < 4; i++ {
		c := mustRegister(t, h, fmt.Sprintf("drainer-%d", i))
		drainers.Add(1)
		go func() {
			defer drainers.Done()
			for {
				select {
				case <-c.Send:
				case <-stop:
					return
				}
			}
		}()
	}

	var wg sync.WaitGroup

	// Broadcasters.
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 200; j++ {
				h.Broadcast("rollout", "r", "update")
			}
		}()
	}

	// Churn: register + unregister concurrently with broadcasts. Each goroutine
	// uses its own user id and holds at most one connection at a time.
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			user := fmt.Sprintf("churn-%d", i)
			for j := 0; j < 200; j++ {
				c, ok := h.Register(user)
				if !ok {
					continue
				}
				h.Broadcast("lock", "l", "create")
				h.Unregister(c)
			}
		}(i)
	}

	wg.Wait()
	close(stop)
	drainers.Wait()
}
