import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { RefreshBus } from '../../core/refresh.bus';
import { getStage, nsToHours } from '../../core/stage';
import { Rollout, RolloutStage, RolloutTask, RolloutType } from '../../core/models/rollout.models';
import { IconComponent, ICONS } from '../../shared/ui/icon.component';
import { BadgeComponent } from '../../shared/ui/badge.component';

@Component({
  selector: 'rr-rollout-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, BadgeComponent],
  template: `
    @if (rollout(); as r) {
      <div class="rr-detail-page" data-test="rollout-detail">
        <header class="rr-detail-head">
          <div class="rr-drawer-head-l">
            <button class="rr-detail-back" (click)="back()">
              <rr-icon [d]="ICONS['chev']" [size]="12" class="rr-rot-180" /> Back to timeline
            </button>
            <div class="rr-drawer-eyebrow">
              <span class="rr-prod-dot" [style.background]="prodColor(r.product)"></span>
              <span>{{ r.product }}</span>
              <span class="rr-sep">/</span>
              @if (type(); as t) {
                <rr-badge [tone]="t.tone">{{ t.short }}</rr-badge>
              }
              <span class="rr-sep">/</span>
              <span class="rr-mono rr-muted">{{ r.id }}</span>
            </div>
            <h2 class="rr-drawer-title">{{ r.title }}</h2>
          </div>
          <div class="rr-drawer-head-r">
            <a class="rr-btn rr-btn-ghost rr-btn-sm" href="/api/calendar.ics">
              <rr-icon [d]="ICONS['download']" [size]="13" /> .ics
            </a>
          </div>
        </header>

        <div class="rr-drawer-grid">
          <div class="rr-drawer-col">
            <section class="rr-block">
              <div class="rr-block-head"><h3>Cascade</h3></div>
              <div class="rr-stage-cards">
                @for (st of r.stages; track $index; let i = $index) {
                  @if (i > 0) {
                    <div class="rr-stage-arrow">
                      <span>+{{ stageGap(r.stages, i) }}</span>
                      <rr-icon d="M5 12h14m0 0l-4-4m4 4l-4 4" [size]="14" />
                    </div>
                  }
                  <div
                    class="rr-stage-card"
                    [style.borderColor]="meta(st.env).border"
                    [style.background]="meta(st.env).soft"
                  >
                    <div class="rr-stage-card-top">
                      <span
                        class="rr-stage-card-tag"
                        [style.background]="meta(st.env).color"
                        style="color:#0a0a0c"
                        >{{ meta(st.env).short }}</span
                      >
                      <span [style.color]="meta(st.env).color" style="font-weight:600">
                        {{ meta(st.env).label }}
                      </span>
                    </div>
                    <div class="rr-stage-card-date">
                      {{ fmtDate(st.startAt) }}<span> · {{ fmtTime(st.startAt) }}</span>
                    </div>
                    <div class="rr-stage-card-status">
                      <span class="rr-pill-dot" [class]="'is-' + st.status"></span>
                      {{ st.status }} · ~{{ hours(st.durationNs) }}h
                    </div>
                  </div>
                }
              </div>
            </section>

            <section class="rr-block">
              <div class="rr-block-head">
                <h3>Tasks @if (type(); as t) { <span class="rr-muted">(inherited from {{ t.short }})</span> }</h3>
                <div class="rr-progress-wrap">
                  <div class="rr-progress">
                    <div class="rr-progress-fill" [style.width]="completion() + '%'"></div>
                    @if (failedCount() > 0) {
                      <div class="rr-progress-fail" [style.width]="failedPct() + '%'"></div>
                    }
                  </div>
                  <span class="rr-mono">{{ completion() }}%</span>
                  @if (failedCount() > 0) {
                    <span class="rr-mono rr-fail-count">· {{ failedCount() }} failed</span>
                  }
                </div>
              </div>

              <ul class="rr-tasks">
                @for (t of r.tasks; track t.index) {
                  <li
                    class="rr-task"
                    [class.is-done]="t.status === 'done'"
                    [class.is-failed]="t.status === 'failed'"
                    [class.is-failing]="failingIndex() === t.index"
                    [attr.data-test]="'task-' + t.index"
                  >
                    <div class="rr-task-main">
                      <div class="rr-task-checks">
                        <button
                          class="rr-check rr-check-ok"
                          [class.is-on]="t.status === 'done'"
                          [disabled]="!canEdit() || busy()"
                          (click)="toggleDone(r.id, t)"
                          [attr.aria-pressed]="t.status === 'done'"
                          title="Mark done"
                          [attr.data-test]="'task-done-' + t.index"
                        >
                          @if (t.status === 'done') {
                            <rr-icon [d]="ICONS['check']" [size]="11" />
                          }
                        </button>
                        <button
                          class="rr-check rr-check-fail"
                          [class.is-on]="t.status === 'failed'"
                          [disabled]="!canEdit() || busy()"
                          (click)="onFail(r.id, t)"
                          [attr.aria-pressed]="t.status === 'failed'"
                          title="Mark failed"
                        >
                          @if (t.status === 'failed') {
                            <rr-icon [d]="ICONS['x']" [size]="11" />
                          }
                        </button>
                      </div>
                      <span class="rr-task-label">{{ t.description }}</span>
                      @if (t.status === 'done' && t.by) {
                        <span class="rr-task-log"><span>checked by {{ t.by }}</span></span>
                      } @else if (t.status === 'failed' && failingIndex() !== t.index) {
                        <span class="rr-task-log"><span>failed{{ t.by ? ' · ' + t.by : '' }}</span></span>
                      } @else if (t.status === '') {
                        <span class="rr-task-pending">pending</span>
                      }
                    </div>

                    @if (t.status === 'failed' && failingIndex() !== t.index && t.reason) {
                      <div class="rr-task-reason">
                        <rr-icon [d]="ICONS['warn']" [size]="11" />
                        <span class="rr-task-reason-text">{{ t.reason }}</span>
                        @if (canEdit()) {
                          <button class="rr-task-reason-edit" (click)="editReason(t)">edit</button>
                        }
                      </div>
                    }

                    @if (failingIndex() === t.index) {
                      <div class="rr-task-reason-form">
                        <label class="rr-field">
                          <span>Why did this step fail? <em>(required — logged on the rollout)</em></span>
                          <textarea
                            rows="2"
                            data-test="fail-reason"
                            [value]="reasonDraft()"
                            (input)="reasonDraft.set($any($event.target).value)"
                          ></textarea>
                        </label>
                        <div class="rr-task-reason-actions">
                          <button class="rr-btn rr-btn-ghost rr-btn-sm" (click)="cancelFail()">Cancel</button>
                          <button
                            class="rr-btn rr-btn-danger rr-btn-sm"
                            data-test="fail-save"
                            [disabled]="!reasonDraft().trim() || busy()"
                            (click)="saveFailure(r.id, t)"
                          >
                            Save failure
                          </button>
                        </div>
                      </div>
                    }
                  </li>
                } @empty {
                  <li class="rr-muted" style="padding:10px 4px">No tasks on this rollout.</li>
                }
              </ul>
            </section>

            <section class="rr-block">
              <div class="rr-block-head"><h3>Descriptions &amp; Risks</h3></div>
              <div class="rr-fields">
                <div class="rr-field">
                  <span>External description <em>(customer-visible)</em></span>
                  <p data-test="detail-descext">{{ r.descExt || '—' }}</p>
                </div>
                @if (isAdmin()) {
                  <div class="rr-field">
                    <span>Internal description</span>
                    <p data-test="detail-descint">{{ r.descInt || '—' }}</p>
                  </div>
                  <div class="rr-field">
                    <span>Risks</span>
                    <p>{{ r.risks || '—' }}</p>
                  </div>
                } @else {
                  <div class="rr-field rr-muted">
                    Internal description &amp; risks are restricted to administrators.
                  </div>
                }
              </div>
            </section>
          </div>

          <div class="rr-drawer-col rr-drawer-col-right">
            <section class="rr-block">
              <div class="rr-block-head"><h3>Executed by (pair)</h3></div>
              <div class="rr-pair">
                @for (id of r.pair; track id) {
                  <div class="rr-pair-card">
                    <div>
                      <div class="rr-pair-name">{{ id }}</div>
                      <div class="rr-pair-role"><span class="rr-role-pill">admin</span> · oAuth verified</div>
                    </div>
                  </div>
                } @empty {
                  <div class="rr-muted">No pair assigned.</div>
                }
              </div>
            </section>

            @if (type(); as t) {
              @if (t.rules.length) {
                <section class="rr-block">
                  <div class="rr-block-head"><h3>RolloutType rules</h3></div>
                  <ul class="rr-rules">
                    @for (rule of t.rules; track $index) {
                      <li><rr-icon [d]="ICONS['check']" [size]="12" /> {{ rule }}</li>
                    }
                  </ul>
                </section>
              }
            }
          </div>
        </div>
      </div>
    } @else {
      <div style="padding: 16px 18px;" class="rr-muted" data-test="rollout-detail-loading">
        Loading rollout…
      </div>
    }
  `,
})
export class RolloutDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private bus = inject(RefreshBus);
  protected session = inject(SessionStore);
  protected ICONS = ICONS;

  protected readonly busy = signal(false);
  protected readonly failingIndex = signal<number | null>(null);
  protected readonly reasonDraft = signal('');

  protected readonly isAdmin = computed(() => this.session.isAdmin());
  protected readonly canEdit = computed(() => this.session.canEdit());

  protected readonly rollout = toSignal(
    combineLatest([this.route.paramMap.pipe(map((p) => p.get('id'))), this.bus.tick$]).pipe(
      switchMap(([id]) => (id ? this.api.rollout(id).pipe(catchError(() => of(null))) : of(null))),
    ),
    { initialValue: null as Rollout | null },
  );

  // Types are admin-only on the backend; readonly users get an empty list (403)
  // and simply see no rules section — the rest of the page renders fine.
  private readonly types = toSignal(
    this.api.rolloutTypes().pipe(catchError(() => of<RolloutType[]>([]))),
    { initialValue: [] as RolloutType[] },
  );

  protected readonly type = computed<RolloutType | null>(() => {
    const r = this.rollout();
    if (!r) return null;
    return this.types().find((t) => t.id === r.typeId) ?? null;
  });

  protected readonly completion = computed(() => {
    const tasks = this.rollout()?.tasks ?? [];
    if (!tasks.length) return 0;
    const done = tasks.filter((t) => t.status === 'done').length;
    return Math.round((done / tasks.length) * 100);
  });
  protected readonly failedCount = computed(
    () => (this.rollout()?.tasks ?? []).filter((t) => t.status === 'failed').length,
  );
  protected readonly failedPct = computed(() => {
    const tasks = this.rollout()?.tasks ?? [];
    if (!tasks.length) return 0;
    return (this.failedCount() / tasks.length) * 100;
  });

  protected meta = getStage;
  protected prodColor(id: string): string {
    return (
      { operator: '#a78bfa', concentrator: '#5eead4', monalesy: '#fbbf24', microservices: '#fb7185' }[
        id
      ] ?? '#888'
    );
  }
  protected hours(ns: number): number {
    return Math.round(nsToHours(ns));
  }
  protected fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  }
  protected fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  protected stageGap(stages: RolloutStage[], i: number): string {
    const ms = new Date(stages[i].startAt).getTime() - new Date(stages[i - 1].startAt).getTime();
    const h = Math.round(ms / 3600000);
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    return `${d}d`;
  }

  protected toggleDone(id: string, t: RolloutTask): void {
    if (!this.canEdit()) return;
    const next = t.status === 'done' ? '' : 'done';
    this.patch(id, t.index, next, '');
  }
  protected onFail(id: string, t: RolloutTask): void {
    if (!this.canEdit()) return;
    if (t.status === 'failed') {
      this.patch(id, t.index, '', '');
      return;
    }
    this.failingIndex.set(t.index);
    this.reasonDraft.set(t.reason ?? '');
  }
  protected editReason(t: RolloutTask): void {
    this.failingIndex.set(t.index);
    this.reasonDraft.set(t.reason ?? '');
  }
  protected saveFailure(id: string, t: RolloutTask): void {
    const reason = this.reasonDraft().trim();
    if (!reason) return;
    this.patch(id, t.index, 'failed', reason);
  }
  protected cancelFail(): void {
    this.failingIndex.set(null);
    this.reasonDraft.set('');
  }

  private patch(id: string, seq: number, status: string, reason: string): void {
    this.busy.set(true);
    this.api.updateTask(id, seq, { status, reason }).subscribe({
      next: () => {
        this.busy.set(false);
        this.failingIndex.set(null);
        this.reasonDraft.set('');
        this.bus.bump();
      },
      error: () => this.busy.set(false),
    });
  }

  protected back(): void {
    this.router.navigate(['/timeline']);
  }
}
