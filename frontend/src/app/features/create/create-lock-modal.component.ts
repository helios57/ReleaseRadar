import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { DialogStore } from '../../core/dialog.store';
import { RefreshBus } from '../../core/refresh.bus';
import { productColor } from '../../core/stage';
import { Product } from '../../core/models/rollout.models';
import { IconComponent, ICONS } from '../../shared/ui/icon.component';

type LockKind = 'manual' | 'holiday' | 'window';

@Component({
  selector: 'rr-create-lock-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="rr-modal-scrim" (click)="close()">
      <div class="rr-modal rr-modal-sm" (click)="$event.stopPropagation()" data-test="create-lock-modal">
        <header class="rr-modal-head">
          <div>
            <h2>Create rollout lock (Sperre)</h2>
            <p class="rr-modal-sub">Blocked time range — no rollouts should be scheduled or executed.</p>
          </div>
          <button class="rr-icon-btn" (click)="close()" aria-label="Close">
            <rr-icon [d]="ICONS['x']" [size]="14" />
          </button>
        </header>

        <div class="rr-modal-body">
          <div class="rr-seg rr-seg-lg">
            @for (o of kinds; track o.id) {
              <button
                class="rr-seg-item"
                [class.is-active]="kind() === o.id"
                (click)="kind.set(o.id)"
              >
                {{ o.label }}
              </button>
            }
          </div>

          <div class="rr-form-grid">
            <label class="rr-field">
              <span>Start</span>
              <input
                type="datetime-local"
                [value]="start()"
                (input)="start.set($any($event.target).value)"
              />
            </label>
            <label class="rr-field">
              <span>End</span>
              <input
                type="datetime-local"
                [value]="end()"
                (input)="end.set($any($event.target).value)"
              />
            </label>
            <label class="rr-field rr-field-wide">
              <span>Title</span>
              <input
                data-test="lock-title"
                placeholder="e.g. Master Branch Bug #4029"
                [value]="title()"
                (input)="title.set($any($event.target).value)"
              />
            </label>
            <label class="rr-field rr-field-wide">
              <span>Description</span>
              <textarea
                rows="2"
                placeholder="Why is this a lock? What needs to clear before it's lifted?"
                [value]="description()"
                (input)="description.set($any($event.target).value)"
              ></textarea>
            </label>
            <label class="rr-field rr-field-wide">
              <span>Customer / contact</span>
              <input
                placeholder="Luc B. — #tms-platform"
                [value]="contact()"
                (input)="contact.set($any($event.target).value)"
              />
            </label>
            <div class="rr-field rr-field-wide">
              <span>Affected products</span>
              <div class="rr-prod-pickers">
                <button
                  class="rr-prod-pick"
                  [class.is-on]="products().includes('all')"
                  (click)="selectAll()"
                >
                  all
                </button>
                @for (p of allProducts(); track p.id) {
                  <button
                    class="rr-prod-pick"
                    [class.is-on]="products().includes(p.id)"
                    (click)="toggleProduct(p.id)"
                  >
                    <span class="rr-prod-dot" [style.background]="productColor(p.id)"></span>
                    {{ p.name }}
                  </button>
                }
              </div>
            </div>
          </div>

          @if (error()) {
            <div class="rr-banner rr-banner-danger" data-test="lock-error">
              <rr-icon [d]="ICONS['warn']" [size]="16" />
              <div><strong>Could not create lock.</strong><p>{{ error() }}</p></div>
            </div>
          }
        </div>

        <footer class="rr-modal-foot">
          <span class="rr-muted">Locks show in the timeline as red striped columns.</span>
          <div class="rr-modal-foot-actions">
            <button class="rr-btn rr-btn-ghost" (click)="close()">Cancel</button>
            <button
              class="rr-btn rr-btn-danger"
              data-test="lock-submit"
              [disabled]="!canSubmit()"
              (click)="submit()"
            >
              {{ submitting() ? 'Creating…' : 'Create lock' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  `,
})
export class CreateLockModalComponent {
  private api = inject(ApiService);
  private dialog = inject(DialogStore);
  private bus = inject(RefreshBus);
  protected ICONS = ICONS;
  protected productColor = productColor;

  protected readonly kinds: { id: LockKind; label: string }[] = [
    { id: 'manual', label: 'Manual (master bug)' },
    { id: 'holiday', label: 'Holiday' },
    { id: 'window', label: 'Custom window' },
  ];

  protected readonly allProducts = toSignal(
    this.api.products().pipe(catchError(() => of<Product[]>([]))),
    { initialValue: [] as Product[] },
  );

  protected readonly kind = signal<LockKind>('manual');
  protected readonly start = signal(defaultStart());
  protected readonly end = signal(defaultEnd());
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly contact = signal('');
  protected readonly products = signal<string[]>(['all']);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(
    () =>
      this.title().trim().length > 0 &&
      !!this.start() &&
      !!this.end() &&
      this.products().length > 0 &&
      !this.submitting(),
  );

  protected selectAll(): void {
    this.products.set(['all']);
  }
  protected toggleProduct(id: string): void {
    this.products.update((cur) => {
      if (cur.includes('all')) return [id];
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.error.set(null);
    this.api
      .createLock({
        title: this.title().trim(),
        description: this.description(),
        contact: this.contact(),
        startAt: new Date(this.start()).toISOString(),
        endAt: new Date(this.end()).toISOString(),
        products: this.products(),
        kind: this.kind(),
      })
      .subscribe({
        next: () => {
          this.bus.bump();
          this.dialog.close();
        },
        error: (e) => {
          this.submitting.set(false);
          this.error.set(extractError(e));
        },
      });
  }

  protected close(): void {
    this.dialog.close();
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function localInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return localInput(d);
}
function defaultEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setMinutes(0, 0, 0);
  return localInput(d);
}
function extractError(e: unknown): string {
  const err = e as { error?: unknown; message?: string };
  if (typeof err?.error === 'string' && err.error.trim()) return err.error.trim();
  return err?.message ?? 'Unexpected error';
}
