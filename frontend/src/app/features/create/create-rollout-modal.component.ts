import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { DialogStore } from '../../core/dialog.store';
import { RefreshBus } from '../../core/refresh.bus';
import { cascadeStages, formatDelay, getStage } from '../../core/stage';
import { scheduleWarnings } from '../../core/schedule-rules';
import { Product, RolloutType } from '../../core/models/rollout.models';
import { IconComponent, ICONS } from '../../shared/ui/icon.component';

@Component({
  selector: 'rr-create-rollout-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="rr-modal-scrim" (click)="close()">
      <div
        class="rr-modal"
        (click)="$event.stopPropagation()"
        data-test="create-rollout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rr-create-rollout-title"
      >
        <header class="rr-modal-head">
          <div>
            <h2 id="rr-create-rollout-title">Create rollout</h2>
            <p class="rr-modal-sub">
              Inherits tasks, announcement rules, and cascade delays from the chosen RolloutType.
            </p>
          </div>
          <button class="rr-icon-btn" (click)="close()" aria-label="Close">
            <rr-icon [d]="ICONS['x']" [size]="14" />
          </button>
        </header>

        <div class="rr-modal-body">
          <div class="rr-form-grid">
            <label class="rr-field rr-field-wide">
              <span>Title</span>
              <input
                #titleInput
                data-test="rollout-title"
                placeholder="e.g. operator 24.7 — broker auth refactor"
                [value]="title()"
                (input)="title.set($any($event.target).value)"
              />
            </label>
            <label class="rr-field">
              <span>Product</span>
              <select
                data-test="rollout-product"
                [value]="productId()"
                (change)="productId.set($any($event.target).value)"
              >
                @for (p of products(); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
            </label>
            <label class="rr-field">
              <span>Rollout type</span>
              <select
                data-test="rollout-type"
                [value]="typeId()"
                (change)="typeId.set($any($event.target).value)"
              >
                @for (t of types(); track t.id) {
                  <option [value]="t.id">{{ t.name }}</option>
                }
              </select>
            </label>
            <label class="rr-field">
              <span>Start (non-prod)</span>
              <input
                type="date"
                [value]="startDate()"
                (input)="startDate.set($any($event.target).value)"
              />
            </label>
            <label class="rr-field">
              <span>Time</span>
              <input
                type="time"
                [value]="startTime()"
                (input)="startTime.set($any($event.target).value)"
              />
            </label>
            <label class="rr-field">
              <span>Duration (hours)</span>
              <input
                type="number"
                min="1"
                step="1"
                [value]="durationHours()"
                (input)="durationHours.set(+$any($event.target).value)"
              />
            </label>
          </div>

          @if (scheduleAdvisories().length) {
            <div
              class="rr-banner"
              style="border-color: rgba(245,158,11,.4); background: rgba(245,158,11,.10);"
              data-test="schedule-warning"
            >
              <rr-icon [d]="ICONS['warn']" [size]="16" />
              <div>
                <strong>Scheduling-Regel beachten.</strong>
                <p>
                  @for (a of scheduleAdvisories(); track $index) {
                    <span>{{ a }}<br /></span>
                  }
                </p>
              </div>
            </div>
          }

          @if (selectedType(); as type) {
            <div class="rr-hint">
              <div class="rr-hint-icon"><rr-icon [d]="ICONS['bolt']" [size]="14" /></div>
              <div class="rr-hint-body">
                <div class="rr-hint-title">{{ type.name }}</div>
                @if (type.announce) {
                  <div class="rr-hint-sub">{{ type.announce }}</div>
                }
                @if (preview().length > 1) {
                  <div class="rr-cascade-preview">
                    <div class="rr-cp">
                      @for (s of preview(); track $index; let i = $index) {
                        <div
                          class="rr-cp-card"
                          [style.borderColor]="getStage(s.env).border"
                          [style.background]="getStage(s.env).soft"
                        >
                          <span
                            class="rr-cp-tag"
                            [style.background]="getStage(s.env).color"
                            style="color:#0a0a0c"
                            >{{ getStage(s.env).short }}</span
                          >
                          <div>
                            <div class="rr-cp-env" [style.color]="getStage(s.env).color">
                              {{ getStage(s.env).label }}
                            </div>
                            <div class="rr-cp-date">{{ fmtStage(s.startAt) }}</div>
                          </div>
                        </div>
                        @if (i < preview().length - 1) {
                          <div class="rr-cp-arrow">
                            <span>+{{ stepDelay(type, i) }}</span>
                            <rr-icon d="M5 12h14m0 0l-4-4m4 4l-4 4" [size]="14" />
                          </div>
                        }
                      }
                    </div>
                  </div>
                }
                @if (type.rules.length) {
                  <ul class="rr-hint-rules">
                    @for (r of type.rules; track $index) {
                      <li><rr-icon [d]="ICONS['check']" [size]="11" /> {{ r }}</li>
                    }
                  </ul>
                }
              </div>
            </div>

            <div class="rr-block-head">
              <h3>Inherited tasks <span class="rr-muted">({{ type.tasks.length }})</span></h3>
            </div>
            <ul class="rr-tasks-preview">
              @for (t of type.tasks; track $index; let i = $index) {
                <li>
                  <span class="rr-mono rr-muted">{{ pad(i + 1) }}</span> {{ t }}
                </li>
              } @empty {
                <li class="rr-muted">This type has no inherited tasks.</li>
              }
            </ul>
          }

          <div class="rr-form-grid">
            <label class="rr-field rr-field-wide">
              <span>External description <em>(customer-visible)</em></span>
              <textarea
                rows="2"
                data-test="rollout-descext"
                placeholder="Customer-visible summary…"
                [value]="descExt()"
                (input)="descExt.set($any($event.target).value)"
              ></textarea>
            </label>
            <label class="rr-field rr-field-wide">
              <span>Internal description</span>
              <textarea
                rows="2"
                placeholder="Runbook links, migration notes…"
                [value]="descInt()"
                (input)="descInt.set($any($event.target).value)"
              ></textarea>
            </label>
            <label class="rr-field rr-field-wide">
              <span>Risks</span>
              <textarea
                rows="2"
                placeholder="Known risks…"
                [value]="risks()"
                (input)="risks.set($any($event.target).value)"
              ></textarea>
            </label>
            <label class="rr-field rr-field-wide">
              <span>Executed by (pair) <em>(comma-separated — optional)</em></span>
              <input
                placeholder="e.g. luc, henning"
                [value]="pairText()"
                (input)="pairText.set($any($event.target).value)"
              />
            </label>
          </div>

          @if (error()) {
            <div class="rr-banner rr-banner-danger" data-test="rollout-error">
              <rr-icon [d]="ICONS['warn']" [size]="16" />
              <div><strong>Could not create rollout.</strong><p>{{ error() }}</p></div>
            </div>
          }
        </div>

        <footer class="rr-modal-foot">
          <span class="rr-muted">An <code>.ics</code> entry is added to the team's Cal-DAV feed.</span>
          <div class="rr-modal-foot-actions">
            <button class="rr-btn rr-btn-ghost" (click)="close()">Cancel</button>
            <button
              class="rr-btn rr-btn-primary"
              data-test="rollout-submit"
              [disabled]="!canSubmit()"
              (click)="submit()"
            >
              {{ submitting() ? 'Creating…' : 'Create rollout' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  `,
})
export class CreateRolloutModalComponent {
  private api = inject(ApiService);
  private dialog = inject(DialogStore);
  private bus = inject(RefreshBus);
  private router = inject(Router);
  protected ICONS = ICONS;
  protected getStage = getStage;
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  protected readonly products = toSignal(
    this.api.products().pipe(catchError(() => of<Product[]>([]))),
    { initialValue: [] as Product[] },
  );
  protected readonly types = toSignal(
    this.api.rolloutTypes().pipe(catchError(() => of<RolloutType[]>([]))),
    { initialValue: [] as RolloutType[] },
  );

  protected readonly productId = signal('');
  protected readonly typeId = signal('');
  protected readonly title = signal('');
  protected readonly startDate = signal(defaultDate());
  protected readonly startTime = signal('10:00');
  protected readonly durationHours = signal(2);
  protected readonly descExt = signal('');
  protected readonly descInt = signal('');
  protected readonly risks = signal('');
  protected readonly pairText = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedType = computed(
    () => this.types().find((t) => t.id === this.typeId()) ?? null,
  );
  protected readonly baseISO = computed(() => `${this.startDate()}T${this.startTime()}:00`);
  protected readonly preview = computed(() =>
    cascadeStages(this.baseISO(), this.selectedType()?.cascadePlan ?? [], this.durationHours()),
  );
  protected readonly canSubmit = computed(
    () =>
      !!this.productId() &&
      !!this.typeId() &&
      this.title().trim().length > 0 &&
      !this.submitting(),
  );

  // Non-blocking advisories: no rollouts on Fridays or before Bernese holidays.
  protected readonly scheduleAdvisories = computed(() => {
    const out: string[] = [];
    const now = Date.now();
    for (const s of this.preview()) {
      const d = new Date(s.startAt);
      const meta = getStage(s.env);
      // Warn if the stage gives less than its policy minimum advance notice
      // (non-prod ≥1h, prod1 ≥1w, prod2 ≥2w).
      const leadHours = (d.getTime() - now) / 3_600_000;
      if (meta.minAdvanceHours && leadHours < meta.minAdvanceHours) {
        out.push(
          `${meta.label}: only ${Math.max(0, Math.round(leadHours))}h lead time — policy asks for ≥ ${meta.minAdvanceHours}h advance notice.`,
        );
      }
      for (const w of scheduleWarnings(d)) {
        out.push(`${meta.label}: ${w}`);
      }
    }
    return out;
  });

  constructor() {
    // Move focus into the dialog when it opens (accessibility).
    afterNextRender(() => this.titleInput()?.nativeElement.focus());
    effect(() => {
      const ps = this.products();
      if (ps.length && !this.productId()) this.productId.set(ps[0].id);
    });
    effect(() => {
      const ts = this.types();
      if (ts.length && !this.typeId()) this.typeId.set(ts[0].id);
    });
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
  protected fmtStage(iso: string): string {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }) +
      ' · ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  }
  protected stepDelay(type: RolloutType, i: number): string {
    const plan = type.cascadePlan ?? [];
    const delta = (plan[i + 1]?.delayHours ?? 0) - (plan[i]?.delayHours ?? 0);
    return formatDelay(delta);
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.error.set(null);
    const pair = this.pairText()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.api
      .createRollout({
        product: this.productId(),
        typeId: this.typeId(),
        title: this.title().trim(),
        descExt: this.descExt(),
        descInt: this.descInt(),
        risks: this.risks(),
        stages: this.preview(),
        pair,
      })
      .subscribe({
        next: (r) => {
          this.bus.bump();
          this.dialog.close();
          this.router.navigate(['/rollout', r.id]);
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

function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function extractError(e: unknown): string {
  const err = e as { error?: unknown; message?: string };
  if (typeof err?.error === 'string' && err.error.trim()) return err.error.trim();
  return err?.message ?? 'Unexpected error';
}
