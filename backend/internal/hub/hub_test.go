package hub

import (
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

func TestBroadcastDeliversToClient(t *testing.T) {
	h := New()
	c := h.Register()

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
	c := h.Register()

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
	c := h.Register()
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
	c := h.Register()

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

func TestConcurrentBroadcastAndRegistration(t *testing.T) {
	h := New()

	// Drainers keep a set of long-lived clients from filling up.
	stop := make(chan struct{})
	var drainers sync.WaitGroup
	for i := 0; i < 4; i++ {
		c := h.Register()
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

	// Churn: register + unregister concurrently with broadcasts.
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 200; j++ {
				c := h.Register()
				h.Broadcast("lock", "l", "create")
				h.Unregister(c)
			}
		}()
	}

	wg.Wait()
	close(stop)
	drainers.Wait()
}
