import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { addDays, dateKey, getStage, productColor } from '../../../core/stage';
import { Lock, Rollout, RolloutType } from '../../../core/models/rollout.models';
import { IconComponent, ICONS } from '../../../shared/ui/icon.component';
import { BadgeComponent } from '../../../shared/ui/badge.component';

const DAY_W = 56;
const ROW_H = 64;
const LABEL_W = 280;

@Component({
  selector: 'rr-timeline-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, BadgeComponent],
  templateUrl: './timeline-view.component.html',
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class TimelineViewComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  protected ICONS = ICONS;

  protected DAY_W = DAY_W;
  protected ROW_H = ROW_H;
  protected LABEL_W = LABEL_W;

  protected readonly wrapper = viewChild<ElementRef<HTMLElement>>('wrapper');

  protected readonly offset = signal(-3);
  protected readonly days = signal(28);
  protected readonly today = signal(new Date());

  private data = toSignal(
    forkJoin({
      rollouts: this.api.rollouts().pipe(catchError(() => of<Rollout[]>([]))),
      locks: this.api.locks().pipe(catchError(() => of<Lock[]>([]))),
      types: this.api.rolloutTypes().pipe(catchError(() => of<RolloutType[]>([]))),
    }),
    { initialValue: { rollouts: [], locks: [], types: [] } },
  );

  protected rollouts = computed(() => this.data().rollouts);
  protected locks = computed(() => this.data().locks);
  protected typeMap = computed(() => {
    const m = new Map<string, RolloutType>();
    for (const t of this.data().types) m.set(t.id, t);
    return m;
  });

  protected start = computed(() => addDays(this.today(), this.offset()));
  protected trackWidth = computed(() => this.days() * DAY_W);
  protected todayIdx = computed(() => {
    const start = this.start();
    return Math.floor((this.today().getTime() - start.getTime()) / 86400000);
  });

  protected dayColumns = computed(() => {
    const cols: Array<{
      i: number;
      date: Date;
      weekday: string;
      day: string;
      month: string | null;
      isToday: boolean;
      isWeekend: boolean;
      isFriday: boolean;
    }> = [];
    const start = this.start();
    for (let i = 0; i < this.days(); i++) {
      const d = addDays(start, i);
      const isToday = dateKey(d) === dateKey(this.today());
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isFriday = dow === 5;
      const showMonth = i === 0 || d.getDate() === 1 || dow === 1;
      cols.push({
        i,
        date: d,
        weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
        day: d.toLocaleDateString('en-GB', { day: '2-digit' }),
        month: showMonth ? d.toLocaleDateString('en-GB', { month: 'short' }) : null,
        isToday,
        isWeekend,
        isFriday,
      });
    }
    return cols;
  });

  protected timelineRows = computed(() => {
    const start = this.start();
    return this.rollouts().map((r) => {
      const placed = r.stages.map((st) => {
        // st.offset is the React mock's days-from-TODAY. In the real API
        // we'll have absolute `startAt`. Support both.
        let date: Date;
        if ((st as any).offset !== undefined) {
          date = addDays(this.today(), (st as any).offset);
        } else if ((st as any).startAt) {
          date = new Date((st as any).startAt);
        } else {
          date = this.today();
        }
        const idx = Math.floor((date.getTime() - start.getTime()) / 86400000);
        return { stage: st, idx, meta: getStage(st.env) };
      });
      return { rollout: r, placed };
    });
  });

  protected lockOverlays = computed(() => {
    const start = this.start();
    return this.locks().map((l) => {
      const ls = (l as any).startAt
        ? new Date((l as any).startAt)
        : addDays(this.today(), (l as any).startOffset ?? 0);
      const le = (l as any).endAt
        ? new Date((l as any).endAt)
        : addDays(this.today(), (l as any).endOffset ?? 0);
      const startDelta = Math.floor((ls.getTime() - start.getTime()) / 86400000);
      const endDelta = Math.floor((le.getTime() - start.getTime()) / 86400000);
      return {
        lock: l,
        left: startDelta * DAY_W,
        width: (endDelta - startDelta + 1) * DAY_W,
      };
    });
  });

  protected totalHeight = computed(() => this.rollouts().length * ROW_H);

  constructor() {
    // Auto-fit the day count to the available wrapper width.
    afterRenderEffect(() => {
      const el = this.wrapper()?.nativeElement;
      if (!el) return;
      const compute = () => {
        const avail = el.clientWidth - LABEL_W - 2;
        const n = Math.max(7, Math.floor(avail / DAY_W));
        if (n !== this.days()) this.days.set(n);
      };
      compute();
      const ro = new ResizeObserver(compute);
      ro.observe(el);
      // ResizeObserver cleanup is automatic when host detaches.
    });
  }

  protected stepWeek(delta: number): void {
    this.offset.update((o) => o + delta);
  }

  protected resetToToday(): void {
    this.offset.set(-3);
  }

  protected openRollout(id: string): void {
    this.router.navigate(['/rollout', id]);
  }

  protected pillLeft(idx: number): number {
    return idx * DAY_W + 4;
  }
  protected pillWidth(durationHours: number): number {
    return Math.max(28, ((durationHours || 1) / 24) * DAY_W - 8);
  }
  protected pillStyle(idx: number, meta: ReturnType<typeof getStage>) {
    return {
      background: `linear-gradient(180deg, ${meta.soft}, rgba(0,0,0,0))`,
      borderColor: meta.border,
      color: meta.color,
    };
  }
  protected cascadeStyle(fromIdx: number, toIdx: number, color: string) {
    const left = fromIdx * DAY_W + DAY_W / 2 + 16;
    const right = toIdx * DAY_W + DAY_W / 2 - 16;
    const w = right - left;
    if (w <= 0) return null;
    return {
      left: `${left}px`,
      width: `${w}px`,
      top: `${ROW_H / 2 - 1}px`,
      color,
    };
  }
  protected stageDurationHours(s: any): number {
    if (typeof s.durationNs === 'number') return s.durationNs / 3_600_000_000_000;
    if (typeof s.duration === 'number') return s.duration; // legacy mock-data path
    return 1;
  }
  protected stageTime(s: any): string {
    if (s.time) return s.time;
    if (s.startAt) {
      return new Date(s.startAt).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return '--:--';
  }
  protected productColor = productColor;
  protected formatMonthLabel = (d: Date) =>
    d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  protected formatRange = () => {
    const s = this.start();
    const e = addDays(s, this.days() - 1);
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return `${fmt(s)} → ${fmt(e)}`;
  };
}
