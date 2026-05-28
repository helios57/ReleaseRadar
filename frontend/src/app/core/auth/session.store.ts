import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import { Role, SessionUser } from '../models/rollout.models';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private api = inject(ApiService);

  // Internal writable state; exposed read-only so only this store mutates it.
  private readonly _user = signal<SessionUser | null>(null);
  private readonly _loaded = signal(false);
  readonly user = this._user.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly role = computed<Role>(() => this.user()?.role ?? 'readonly');
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly canEdit = computed(() => this.isAdmin());

  load(): Promise<void> {
    return new Promise((resolve) => {
      this.api.me().subscribe({
        next: (u) => {
          this._user.set(u);
          this._loaded.set(true);
          resolve();
        },
        error: () => {
          // Any failure (401 = anonymous, or transient) → no user; the shell
          // renders a "Sign in" link to /auth/login.
          this._user.set(null);
          this._loaded.set(true);
          resolve();
        },
      });
    });
  }

  /** Drop the current session (e.g. after a mid-session 401). */
  clear(): void {
    this._user.set(null);
  }
}
