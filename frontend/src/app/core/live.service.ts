import { DestroyRef, InjectionToken, Injectable, inject, signal } from '@angular/core';
import { RefreshBus } from './refresh.bus';

/**
 * Shape of a server → client live-update frame.
 * Carries no domain data — only enough to know *that* something changed and
 * to drop stale/duplicate frames via the monotonic `rev`.
 */
export interface LiveEvent {
  entity: 'rollout' | 'lock' | 'product' | 'rollout-type' | 'task';
  id: string;
  action: 'create' | 'update' | 'delete';
  rev: number;
}

/** Minimal subset of the WebSocket API we rely on — lets tests inject a fake. */
export interface LiveSocket {
  onopen: ((this: unknown, ev: unknown) => unknown) | null;
  onclose: ((this: unknown, ev: unknown) => unknown) | null;
  onerror: ((this: unknown, ev: unknown) => unknown) | null;
  onmessage: ((this: unknown, ev: { data: unknown }) => unknown) | null;
  close(): void;
}

/** Factory for sockets; default opens a real same-origin WebSocket. */
export type SocketFactory = (url: string) => LiveSocket;

/**
 * Optional DI override for the socket factory. Provide in tests to inject a
 * fake socket; defaults to a real `WebSocket` when unprovided.
 */
export const LIVE_SOCKET_FACTORY = new InjectionToken<SocketFactory>('LIVE_SOCKET_FACTORY');

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

const BACKOFF_START = 500; // ms
const BACKOFF_CAP = 8000; // ms
const DEBOUNCE_MS = 150; // collapse bursts into a single refetch
// A connection must stay open this long before we treat it as "stable" and
// reset the backoff. Without this, a server that accepts-then-immediately-drops
// would reset the backoff on every open and hammer reconnects (refetch storm).
const STABLE_AFTER_MS = 3000;

/**
 * Maintains a single WebSocket to `/api/ws` and drives `RefreshBus.bump()` on
 * every (debounced) live event, so all open data views refetch through their
 * existing role-filtered REST path. Zoneless-safe: all state lives in signals,
 * which trigger change detection on write. No `zone.js`, no `setInterval`-based
 * CD assumptions.
 */
@Injectable({ providedIn: 'root' })
export class LiveService {
  private readonly bus = inject(RefreshBus);

  private readonly _status = signal<LiveStatus>('offline');
  /** Readonly connection status for the header indicator. */
  readonly status = this._status.asReadonly();

  private readonly socketFactory: SocketFactory;

  private socket: LiveSocket | null = null;
  private connecting = false; // guards against double-connect
  private stopped = false; // set by disconnect(): stops reconnection
  private backoff = BACKOFF_START;
  private lastRev = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private bumpTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Default factory: real WebSocket. Tests provide LIVE_SOCKET_FACTORY (or
    // monkeypatch global WebSocket) to inject a controllable fake.
    const override = inject(LIVE_SOCKET_FACTORY, { optional: true });
    this.socketFactory =
      override ?? ((url: string) => new WebSocket(url) as unknown as LiveSocket);
    // Tear down the socket + all timers if this root service is ever destroyed
    // (app shutdown, HMR reload, micro-frontend unmount) so we don't stack
    // sockets across reloads.
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  /** Same-origin ws/wss URL for the proxied `/api/ws` endpoint. */
  private url(): string {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${location.host}/api/ws`;
  }

  /** Open the live channel. Safe to call once; ignored if already up/opening. */
  connect(): void {
    if (this.socket || this.connecting) return; // guard double-connect
    this.stopped = false;
    this.openSocket();
  }

  private openSocket(): void {
    this.connecting = true;
    // 'connecting' on the very first attempt; subsequent attempts keep
    // 'reconnecting' (set by onclose/onerror) so the indicator stays amber.
    if (this._status() === 'offline') this._status.set('connecting');

    // A fresh socket means a fresh server session whose revision counter may
    // have reset (in-memory atomic). Reset lastRev so a lower-than-before rev
    // isn't permanently dropped as "stale", which would silently wedge updates.
    this.lastRev = 0;

    let s: LiveSocket;
    try {
      s = this.socketFactory(this.url());
    } catch {
      this.connecting = false;
      this.scheduleReconnect();
      return;
    }
    this.socket = s;

    s.onopen = () => {
      this.connecting = false;
      this._status.set('live');
      // Only reset backoff once the connection has proven *stable*. Resetting
      // synchronously here would let an accept-then-drop server reconnect at
      // full speed forever (a refetch storm).
      if (this.stableTimer) clearTimeout(this.stableTimer);
      this.stableTimer = setTimeout(() => {
        this.stableTimer = null;
        this.backoff = BACKOFF_START;
      }, STABLE_AFTER_MS);
      // Catch-up after (re)connect: refetch once to pick up anything missed.
      // Routed through the debounce so an open immediately followed by a burst
      // of frames collapses into a single refetch (not two).
      this.scheduleBump();
    };

    s.onmessage = (ev: { data: unknown }) => {
      // Server only ever sends text JSON frames (binary frames would stringify
      // to "[object Blob]" and be ignored by the parse below).
      let msg: LiveEvent;
      try {
        msg = JSON.parse(String(ev.data)) as LiveEvent;
      } catch {
        return; // ignore malformed frames
      }
      if (typeof msg?.rev !== 'number') return;
      if (msg.rev <= this.lastRev) return; // stale/duplicate
      this.lastRev = msg.rev;
      this.scheduleBump();
    };

    s.onerror = () => this.handleDrop();
    s.onclose = () => this.handleDrop();
  }

  /** Coalesce a burst of events into one refetch ~150ms after the last one. */
  private scheduleBump(): void {
    if (this.bumpTimer) clearTimeout(this.bumpTimer);
    this.bumpTimer = setTimeout(() => {
      this.bumpTimer = null;
      this.bus.bump();
    }, DEBOUNCE_MS);
  }

  /** Socket closed or errored: mark reconnecting and schedule a retry. */
  private handleDrop(): void {
    this.connecting = false;
    this.socket = null;
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    if (this.stopped) return;
    this._status.set('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) return; // one timer at a time
    const jitter = Math.random() * this.backoff * 0.3;
    const delay = Math.min(this.backoff, BACKOFF_CAP) + jitter;
    this.backoff = Math.min(this.backoff * 2, BACKOFF_CAP);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  /** Tear down the channel and stop reconnecting (e.g. on app destroy). */
  disconnect(): void {
    this.stopped = true;
    this.connecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.bumpTimer) {
      clearTimeout(this.bumpTimer);
      this.bumpTimer = null;
    }
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this._status.set('offline');
  }
}
