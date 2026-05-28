import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, of, switchMap } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { DialogStore } from '../../../core/dialog.store';
import { RefreshBus } from '../../../core/refresh.bus';
import { SessionStore } from '../../../core/auth/session.store';
import { dateKey, getStage, nsToHours, productColor } from '../../../core/stage';
import { Product, Rollout, RolloutStage, StageStatus } from '../../../core/models/rollout.models';
import { BadgeComponent } from '../../../shared/ui/badge.component';
import { IconComponent, ICONS } from '../../../shared/ui/icon.component';

interface Row {
  key: string;
  rollout: Rollout;
  stage: RolloutStage;
  date: Date;
}
interface Group {
  key: string;
  date: Date;
  rows: Row[];
}

const STATUS_TONE: Record<StageStatus, 'neutral' | 'info' | 'warn' | 'danger' | 'ok'> = {
  scheduled: 'info',
  active: 'ok',
  blocked: 'danger',
  done: 'neutral',
  failed: 'danger',
};

@Component({
  selector: 'rr-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, IconComponent],
  template: `
    <div class="rr-list">
      <div class="rr-list-toolbar">
        <div class="rr-list-toolbar-l">
          <div class="rr-month-title">
            <span>Rollouts</span>
            <span class="rr-month-range">
              {{ filteredRows().length }} of {{ rows().length }} stages · sorted by date
            </span>
          </div>
        </div>
        <div class="rr-list-toolbar-r">
          <a class="rr-btn rr-btn-ghost rr-btn-sm" href="/api/calendar.ics">
            <rr-icon [d]="ICONS['download']" [size]="13" /> Export iCal
          </a>
          @if (canEdit()) {
            <button class="rr-btn rr-btn-primary rr-btn-sm" (click)="newRollout()">
              <rr-icon [d]="ICONS['plus']" [size]="13" /> New rollout
            </button>
          }
        </div>
      </div>

      <div class="rr-list-filters">
        <div class="rr-list-filter">
          <span class="rr-list-filter-label">Window</span>
          <div class="rr-seg">
            @for (w of windows; track w.id) {
              <button
                class="rr-seg-item"
                [class.is-active]="windowFilter() === w.id"
                (click)="windowFilter.set(w.id)"
              >
                {{ w.label }}
              </button>
            }
          </div>
        </div>

        <div class="rr-list-filter">
          <span class="rr-list-filter-label">Status</span>
          <div class="rr-seg">
            @for (s of statuses; track s.id) {
              <button
                class="rr-seg-item"
                [class.is-active]="statusFilter() === s.id"
                (click)="statusFilter.set(s.id)"
              >
                {{ s.label }} <span class="rr-list-pill">{{ count(s.id) }}</span>
              </button>
            }
          </div>
        </div>

        <div class="rr-list-filter">
          <span class="rr-list-filter-label">Product</span>
          <select
            class="rr-list-select"
            [value]="productFilter()"
            (change)="productFilter.set($any($event.target).value)"
          >
            <option value="all">All products</option>
            @for (p of products(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>
      </div>

      <div class="rr-list-scroll">
        <table class="rr-list-table">
          <thead>
            <tr>
              <th style="width:130px">Date · Time</th>
              <th style="width:120px">Stage</th>
              <th>Rollout</th>
              <th style="width:130px">Product</th>
              <th style="width:120px">Status</th>
              <th style="width:50px" aria-label="open"></th>
            </tr>
          </thead>
          <tbody>
            @for (g of groups(); track g.key) {
              <tr
                class="rr-list-daterow"
                [class.is-today]="isToday(g.date)"
                [class.is-past]="isPast(g.date)"
              >
                <td colspan="6">
                  <span class="rr-list-dateday">
                    {{ g.date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }) }}
                  </span>
                  <span class="rr-list-daterel">{{ relDay(g.date) }}</span>
                  <span class="rr-list-datecount">{{ g.rows.length }} stage{{ g.rows.length > 1 ? 's' : '' }}</span>
                </td>
              </tr>
              @for (r of g.rows; track r.key) {
                <tr class="rr-list-row" (click)="open(r.rollout.id)" [attr.data-test]="'list-row-' + r.rollout.id">
                  <td>
                    <div class="rr-list-time">{{ fmtTime(r.stage.startAt) }}</div>
                    <div class="rr-list-date-sub">
                      {{ r.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) }}
                      <span class="rr-list-window">+{{ hours(r.stage.durationNs) }}h</span>
                    </div>
                  </td>
                  <td>
                    <span
                      class="rr-list-stage"
                      [style.background]="meta(r.stage.env).soft"
                      [style.color]="meta(r.stage.env).color"
                      [style.borderColor]="meta(r.stage.env).border"
                    >
                      <span class="rr-list-stage-tag" [style.background]="meta(r.stage.env).color"></span>
                      {{ meta(r.stage.env).label.split(' · ')[0] }}
                    </span>
                  </td>
                  <td>
                    <div class="rr-list-title">{{ r.rollout.title }}</div>
                    <div class="rr-list-id rr-mono rr-muted">{{ r.rollout.id }}</div>
                  </td>
                  <td>
                    <div class="rr-list-product">
                      <span class="rr-prod-dot" [style.background]="prodColor(r.rollout.product)"></span>
                      <span class="rr-mono">{{ r.rollout.product }}</span>
                    </div>
                  </td>
                  <td><rr-badge [tone]="statusTone(r.stage.status)" [dot]="true">{{ r.stage.status }}</rr-badge></td>
                  <td>
                    <button class="rr-icon-btn" (click)="$event.stopPropagation(); open(r.rollout.id)" title="Open">
                      <rr-icon [d]="ICONS['chev']" [size]="14" />
                    </button>
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="6" class="rr-list-empty">No rollouts match the current filters.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ListViewComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  private bus = inject(RefreshBus);
  private dialog = inject(DialogStore);
  private session = inject(SessionStore);
  protected ICONS = ICONS;
  protected meta = getStage;
  protected prodColor = productColor;

  protected readonly canEdit = computed(() => this.session.canEdit());

  protected readonly windows = [
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'all', label: 'All' },
    { id: 'past', label: 'Past' },
  ] as const;
  protected readonly statuses = [
    { id: 'all', label: 'All' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'active', label: 'In flight' },
    { id: 'blocked', label: 'Blocked' },
    { id: 'done', label: 'Done' },
  ] as const;

  protected readonly windowFilter = signal<'upcoming' | 'all' | 'past'>('all');
  protected readonly statusFilter = signal<string>('all');
  protected readonly productFilter = signal<string>('all');

  private readonly data = toSignal(
    this.bus.tick$.pipe(
      switchMap(() =>
        combineLatest({
          rollouts: this.api.rollouts().pipe(catchError(() => of<Rollout[]>([]))),
          products: this.api.products().pipe(catchError(() => of<Product[]>([]))),
        }),
      ),
    ),
    { initialValue: { rollouts: [] as Rollout[], products: [] as Product[] } },
  );

  protected readonly products = computed(() => this.data().products);

  protected readonly rows = computed<Row[]>(() => {
    const out: Row[] = [];
    for (const r of this.data().rollouts) {
      r.stages.forEach((st, idx) => {
        out.push({ key: `${r.id}-${idx}`, rollout: r, stage: st, date: new Date(st.startAt) });
      });
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  });

  protected readonly filteredRows = computed<Row[]>(() => {
    const now = Date.now();
    return this.rows().filter((r) => {
      if (this.statusFilter() !== 'all' && r.stage.status !== this.statusFilter()) return false;
      if (this.productFilter() !== 'all' && r.rollout.product !== this.productFilter()) return false;
      const future = r.date.getTime() >= now;
      if (this.windowFilter() === 'upcoming' && !future) return false;
      if (this.windowFilter() === 'past' && future) return false;
      return true;
    });
  });

  protected readonly groups = computed<Group[]>(() => {
    const g: Group[] = [];
    let last: string | null = null;
    for (const r of this.filteredRows()) {
      const k = dateKey(r.date);
      if (k !== last) {
        g.push({ key: k, date: r.date, rows: [] });
        last = k;
      }
      g[g.length - 1].rows.push(r);
    }
    return g;
  });

  protected count(id: string): number {
    if (id === 'all') return this.rows().length;
    return this.rows().filter((r) => r.stage.status === id).length;
  }
  protected statusTone(s: StageStatus): 'neutral' | 'info' | 'warn' | 'danger' | 'ok' {
    return STATUS_TONE[s] ?? 'neutral';
  }
  protected hours(ns: number): number {
    return Math.round(nsToHours(ns));
  }
  protected fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  protected isToday(d: Date): boolean {
    return dateKey(d) === dateKey(new Date());
  }
  protected isPast(d: Date): boolean {
    return d.getTime() < Date.now() && !this.isToday(d);
  }
  protected relDay(d: Date): string {
    const diff = Math.round((d.getTime() - Date.now()) / 86400000);
    if (this.isToday(d)) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff > 0 && diff < 7) return `in ${diff} days`;
    if (diff < 0 && diff > -7) return `${Math.abs(diff)} days ago`;
    if (diff >= 7) return `in ${Math.ceil(diff / 7)} week${diff >= 14 ? 's' : ''}`;
    return `${Math.ceil(Math.abs(diff) / 7)} week${diff <= -14 ? 's' : ''} ago`;
  }

  protected open(id: string): void {
    this.router.navigate(['/rollout', id]);
  }
  protected newRollout(): void {
    this.dialog.openRollout();
  }
}
