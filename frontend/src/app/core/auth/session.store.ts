import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../api/api.service';
import { Role, SessionUser } from '../models/rollout.models';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private api = inject(ApiService);

  readonly user = signal<SessionUser | null>(null);
  readonly loaded = signal(false);
  readonly role = computed<Role>(() => this.user()?.role ?? 'readonly');
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly canEdit = computed(() => this.isAdmin());

  load(): Promise<void> {
    return new Promise((resolve) => {
      this.api.me().subscribe({
        next: (u) => {
          this.user.set(u);
          this.loaded.set(true);
          resolve();
        },
        error: (e: HttpErrorResponse) => {
          this.user.set(null);
          this.loaded.set(true);
          if (e.status === 401) {
            // Anonymous — Shell will trigger /auth/login.
          }
          resolve();
        },
      });
    });
  }
}
