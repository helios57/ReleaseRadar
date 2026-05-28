import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveService, LIVE_SOCKET_FACTORY, type LiveSocket } from './live.service';
import { RefreshBus } from './refresh.bus';

/** A controllable fake WebSocket: tests drive its callbacks directly. */
class FakeSocket implements LiveSocket {
  onopen: ((this: unknown, ev: unknown) => unknown) | null = null;
  onclose: ((this: unknown, ev: unknown) => unknown) | null = null;
  onerror: ((this: unknown, ev: unknown) => unknown) | null = null;
  onmessage: ((this: unknown, ev: { data: unknown }) => unknown) | null = null;
  closed = false;
  close(): void {
    this.closed = true;
  }
  // Test helpers
  fireOpen(): void {
    this.onopen?.call(this, {});
  }
  fireMessage(data: unknown): void {
    this.onmessage?.call(this, { data });
  }
}

describe('LiveService', () => {
  let sockets: FakeSocket[];
  let service: LiveService;
  let bus: RefreshBus;
  let bumpSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LIVE_SOCKET_FACTORY,
          useValue: () => {
            const s = new FakeSocket();
            sockets.push(s);
            return s;
          },
        },
      ],
    });
    service = TestBed.inject(LiveService);
    bus = TestBed.inject(RefreshBus);
    bumpSpy = vi.spyOn(bus, 'bump');
  });

  it('onopen sets status "live" and bumps once (catch-up, debounced)', () => {
    expect(service.status()).toBe('offline');
    service.connect();
    expect(service.status()).toBe('connecting');
    sockets[0].fireOpen();
    expect(service.status()).toBe('live');
    // Catch-up bump is debounced so it coalesces with any inbound burst.
    expect(bumpSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(bumpSpy).toHaveBeenCalledTimes(1);
  });

  it('onmessage with increasing rev schedules a single debounced bump', () => {
    service.connect();
    sockets[0].fireOpen();
    bumpSpy.mockClear(); // ignore the catch-up bump

    sockets[0].fireMessage(JSON.stringify({ entity: 'rollout', id: 'r1', action: 'create', rev: 1 }));
    sockets[0].fireMessage(JSON.stringify({ entity: 'rollout', id: 'r2', action: 'update', rev: 2 }));
    sockets[0].fireMessage(JSON.stringify({ entity: 'lock', id: 'l1', action: 'create', rev: 3 }));

    // Debounced: nothing yet.
    expect(bumpSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    // Burst collapsed into one bump.
    expect(bumpSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores stale/duplicate revs', () => {
    service.connect();
    sockets[0].fireOpen();
    bumpSpy.mockClear();

    sockets[0].fireMessage(JSON.stringify({ entity: 'rollout', id: 'r1', action: 'create', rev: 5 }));
    vi.advanceTimersByTime(150);
    expect(bumpSpy).toHaveBeenCalledTimes(1);

    // rev <= lastRev → ignored, no further bump.
    sockets[0].fireMessage(JSON.stringify({ entity: 'rollout', id: 'r1', action: 'update', rev: 5 }));
    sockets[0].fireMessage(JSON.stringify({ entity: 'rollout', id: 'r1', action: 'update', rev: 3 }));
    vi.advanceTimersByTime(150);
    expect(bumpSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed JSON frames', () => {
    service.connect();
    sockets[0].fireOpen();
    vi.advanceTimersByTime(150); // flush the catch-up bump
    bumpSpy.mockClear();

    sockets[0].fireMessage('not json at all');
    sockets[0].fireMessage('{bad'); // truncated
    sockets[0].fireMessage(JSON.stringify({ entity: 'rollout', id: 'r1', action: 'create' })); // no rev
    vi.advanceTimersByTime(150);
    expect(bumpSpy).not.toHaveBeenCalled();
  });

  it('onclose sets reconnecting and reconnects with backoff', () => {
    service.connect();
    sockets[0].fireOpen();
    expect(sockets.length).toBe(1);

    sockets[0].onclose?.call(sockets[0], {});
    expect(service.status()).toBe('reconnecting');

    // Backoff start 500ms (+ up to 30% jitter). Advance well past it.
    vi.advanceTimersByTime(700);
    expect(sockets.length).toBe(2); // a fresh socket was opened
    sockets[1].fireOpen();
    expect(service.status()).toBe('live');
  });

  it('disconnect() stops reconnection and goes offline', () => {
    service.connect();
    sockets[0].fireOpen();
    service.disconnect();
    expect(service.status()).toBe('offline');
    expect(sockets[0].closed).toBe(true);

    // No reconnect scheduled.
    vi.advanceTimersByTime(10000);
    expect(sockets.length).toBe(1);
  });

  it('connect() guards against double-connect', () => {
    service.connect();
    service.connect();
    expect(sockets.length).toBe(1);
  });

  it('resets lastRev on a fresh socket so a lower server rev is not dropped', () => {
    service.connect();
    sockets[0].fireOpen();
    sockets[0].fireMessage(JSON.stringify({ entity: 'rollout', id: 'r1', action: 'create', rev: 9 }));
    vi.advanceTimersByTime(150);
    expect(bumpSpy).toHaveBeenCalledTimes(1); // catch-up + rev:9 coalesce into one

    // Server restarts → new socket, rev counter reset to 1. Without a lastRev
    // reset this frame (1 <= 9) would be dropped forever.
    sockets[0].onclose?.call(sockets[0], {});
    vi.advanceTimersByTime(700); // backoff → reconnect opens socket[1]
    expect(sockets.length).toBe(2);
    bumpSpy.mockClear();
    sockets[1].fireOpen();
    sockets[1].fireMessage(JSON.stringify({ entity: 'rollout', id: 'r1', action: 'update', rev: 1 }));
    vi.advanceTimersByTime(150);
    // catch-up bump (open) + the rev:1 frame both land → not dropped.
    expect(bumpSpy).toHaveBeenCalledTimes(1);
  });
});
