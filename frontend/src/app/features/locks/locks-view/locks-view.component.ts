import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { DialogStore } from '../../../core/dialog.store';
import { RefreshBus } from '../../../core/refresh.bus';
import { SessionStore } from '../../../core/auth/session.store';
import { productColor } from '../../../core/stage';
import { Lock } from '../../../core/models/rollout.models';
import { IconComponent, ICONS } from '../../../shared/ui/icon.component';
import { BadgeComponent } from '../../../shared/ui/badge.component';

@Component({
  selector: 'rr-locks-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, BadgeComponent],
  template: `
    <div style="padding: 16px 18px;">
      <div class="rr-list-toolbar">
        <div class="rr-month-title">
          <span>Rollout Locks (Sperren)</span>
          <span class="rr-month-range">{{ locks().length }} defined</span>
        </div>
        @if (canEdit()) {
          <button class="rr-btn rr-btn-danger rr-btn-sm" (click)="newLock()" data-test="new-lock">
            <rr-icon [d]="ICONS['lock']" [size]="13" /> New lock
          </button>
        }
      </div>

      @for (l of locks(); track l.id) {
        <div class="rr-card" style="margin-top: 12px; padding: 14px;" [attr.data-test]="'lock-' + l.id">
          <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;">
            <strong>{{ l.title }}</strong>
            <div style="display:flex;align-items:center;gap:8px;">
              <rr-badge [tone]="l.kind === 'holiday' ? 'info' : 'danger'">{{ l.kind }}</rr-badge>
              @if (canEdit()) {
                <button class="rr-icon-btn" [attr.data-test]="'lock-edit-' + l.id" (click)="edit(l)" title="Edit">
                  <rr-icon [d]="ICONS['code']" [size]="13" />
                </button>
                @if (confirmingId() === l.id) {
                  <button
                    class="rr-btn rr-btn-danger rr-btn-sm"
                    [attr.data-test]="'lock-delete-confirm-' + l.id"
                    (click)="confirmRemove(l)"
                  >
                    Confirm
                  </button>
                  <button class="rr-btn rr-btn-ghost rr-btn-sm" (click)="confirmingId.set(null)">
                    Cancel
                  </button>
                } @else {
                  <button
                    class="rr-icon-btn rr-md-row-x"
                    [attr.data-test]="'lock-delete-' + l.id"
                    (click)="confirmingId.set(l.id)"
                    title="Delete"
                  >
                    <rr-icon [d]="ICONS['x']" [size]="13" />
                  </button>
                }
              }
            </div>
          </div>
          <p class="rr-muted" style="margin:6px 0;">{{ l.description }}</p>
          <div class="rr-mono rr-muted" style="font-size:12px;">
            {{ fmt(l.startAt) }} → {{ fmt(l.endAt) }}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            @for (p of l.products; track p) {
              <span class="rr-chip">
                <span class="rr-chip-dot" [style.background]="productColor(p)"></span>{{ p }}
              </span>
            }
          </div>
          @if (l.contact) {
            <div class="rr-muted" style="font-size:12px;margin-top:6px;">contact: {{ l.contact }}</div>
          }
        </div>
      } @empty {
        <div class="rr-muted" style="margin-top:12px;">No locks defined.</div>
      }
    </div>
  `,
})
export class LocksViewComponent {
  private api = inject(ApiService);
  private bus = inject(RefreshBus);
  private dialog = inject(DialogStore);
  private session = inject(SessionStore);
  protected ICONS = ICONS;
  protected productColor = productColor;
  protected readonly canEdit = computed(() => this.session.canEdit());
  protected readonly confirmingId = signal<string | null>(null);

  protected readonly locks = toSignal(
    this.bus.tick$.pipe(switchMap(() => this.api.locks().pipe(catchError(() => of<Lock[]>([]))))),
    { initialValue: [] as Lock[] },
  );

  protected fmt(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  protected newLock(): void {
    this.dialog.openLock();
  }
  protected edit(l: Lock): void {
    this.dialog.openLock(l);
  }
  protected confirmRemove(l: Lock): void {
    this.api.deleteLock(l.id).subscribe({
      next: () => {
        this.confirmingId.set(null);
        this.bus.bump();
      },
      error: () => {
        // Keep the row; clear the confirm so the user can retry. The live
        // channel will reconcile if it actually succeeded server-side.
        this.confirmingId.set(null);
      },
    });
  }
}
