import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { RefreshBus } from '../../core/refresh.bus';
import { getStage, nsToHours, productColor } from '../../core/stage';
import { scheduleWarnings } from '../../core/schedule-rules';
import {
  Lock,
  Rollout,
  RolloutStage,
  RolloutTask,
  RolloutType,
} from '../../core/models/rollout.models';
import { IconComponent, ICONS } from '../../shared/ui/icon.component';
import { BadgeComponent } from '../../shared/ui/badge.component';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

@Component({
  selector: 'rr-rollout-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, BadgeComponent],
  templateUrl: './rollout-detail.component.html',
})
export class RolloutDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private bus = inject(RefreshBus);
  protected session = inject(SessionStore);
  protected ICONS = ICONS;
  protected meta = getStage;
  protected prodColor = productColor;

  protected readonly busy = signal(false);
  protected readonly failingIndex = signal<number | null>(null);
  protected readonly reasonDraft = signal('');
  protected readonly editing = signal(false);
  protected readonly draft = signal<Rollout | null>(null);
  protected readonly newTaskDraft = signal('');
  protected readonly confirmingDelete = signal(false);

  protected readonly isAdmin = computed(() => this.session.isAdmin());
  protected readonly canEdit = computed(() => this.session.canEdit());

  private readonly id$ = this.route.paramMap.pipe(map((p) => p.get('id')));

  protected readonly rollout = toSignal(
    combineLatest([this.id$, this.bus.tick$]).pipe(
      switchMap(([id]) => (id ? this.api.rollout(id).pipe(catchError(() => of(null))) : of(null))),
    ),
    { initialValue: null as Rollout | null },
  );

  private readonly types = toSignal(
    this.api.rolloutTypes().pipe(catchError(() => of<RolloutType[]>([]))),
    { initialValue: [] as RolloutType[] },
  );
  private readonly allLocks = toSignal(
    this.bus.tick$.pipe(switchMap(() => this.api.locks().pipe(catchError(() => of<Lock[]>([]))))),
    { initialValue: [] as Lock[] },
  );

  protected readonly type = computed<RolloutType | null>(() => {
    const r = this.rollout();
    if (!r) return null;
    return this.types().find((t) => t.id === r.typeId) ?? null;
  });

  // Locks whose window overlaps any stage of this rollout for its product.
  protected readonly blockingLocks = computed<Lock[]>(() => {
    const r = this.rollout();
    if (!r) return [];
    return this.allLocks().filter((l) => {
      const matchesProduct = l.products.includes('all') || l.products.includes(r.product);
      if (!matchesProduct) return false;
      const ls = new Date(l.startAt).getTime();
      const le = new Date(l.endAt).getTime();
      return r.stages.some((st) => {
        const t = new Date(st.startAt).getTime();
        return t >= ls && t <= le;
      });
    });
  });

  protected readonly lockTitles = computed(() =>
    this.blockingLocks()
      .map((l) => l.title)
      .join(' • '),
  );

  protected readonly scheduleAdvisories = computed<string[]>(() => {
    const r = this.rollout();
    if (!r) return [];
    const out: string[] = [];
    for (const st of r.stages) {
      for (const w of scheduleWarnings(new Date(st.startAt))) {
        out.push(`${getStage(st.env).label}: ${w}`);
      }
    }
    return out;
  });

  protected readonly completion = computed(() => {
    const tasks = this.rollout()?.tasks ?? [];
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100);
  });
  protected readonly failedCount = computed(
    () => (this.rollout()?.tasks ?? []).filter((t) => t.status === 'failed').length,
  );
  protected readonly failedPct = computed(() => {
    const tasks = this.rollout()?.tasks ?? [];
    if (!tasks.length) return 0;
    return (this.failedCount() / tasks.length) * 100;
  });

  // ---------- formatting ----------
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
    return `${Math.round(h / 24)}d`;
  }

  // ---------- task execution (view mode) ----------
  protected toggleDone(id: string, t: RolloutTask): void {
    if (!this.canEdit()) return;
    this.patch(id, t.index, t.status === 'done' ? '' : 'done', '');
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

  // ---------- edit mode (configure rollout + tasks) ----------
  protected enterEdit(): void {
    const r = this.rollout();
    if (!r) return;
    this.draft.set(clone(r));
    this.editing.set(true);
  }
  protected cancelEdit(): void {
    this.editing.set(false);
    this.draft.set(null);
    this.newTaskDraft.set('');
  }
  protected patchDraft(patch: Partial<Rollout>): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, ...patch });
  }
  protected pairText(): string {
    return (this.draft()?.pair ?? []).join(', ');
  }
  protected setPair(v: string): void {
    this.patchDraft({ pair: v.split(',').map((s) => s.trim()).filter(Boolean) });
  }
  protected addDraftTask(): void {
    const v = this.newTaskDraft().trim();
    const d = this.draft();
    if (!v || !d) return;
    const tasks = [...d.tasks, { index: d.tasks.length, description: v, status: '' as const }];
    this.draft.set({ ...d, tasks });
    this.newTaskDraft.set('');
  }
  protected editDraftTask(i: number, v: string): void {
    const d = this.draft();
    if (!d) return;
    const tasks = d.tasks.map((t, idx) => (idx === i ? { ...t, description: v } : t));
    this.draft.set({ ...d, tasks });
  }
  protected removeDraftTask(i: number): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, tasks: d.tasks.filter((_, idx) => idx !== i) });
  }
  protected moveDraftTask(i: number, dir: number): void {
    const d = this.draft();
    if (!d) return;
    const j = i + dir;
    if (j < 0 || j >= d.tasks.length) return;
    const tasks = [...d.tasks];
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
    this.draft.set({ ...d, tasks });
  }
  protected save(): void {
    const d = this.draft();
    if (!d) return;
    this.busy.set(true);
    this.api
      .updateRollout(d.id, {
        title: d.title,
        descExt: d.descExt,
        descInt: d.descInt,
        risks: d.risks,
        stages: d.stages,
        pair: d.pair,
        tasks: d.tasks,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.editing.set(false);
          this.draft.set(null);
          this.bus.bump();
        },
        error: () => this.busy.set(false),
      });
  }

  // ---------- delete ----------
  protected requestDelete(): void {
    this.confirmingDelete.set(true);
  }
  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
  }
  protected confirmDelete(id: string): void {
    this.busy.set(true);
    this.api.deleteRollout(id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmingDelete.set(false);
        this.bus.bump();
        this.router.navigate(['/timeline']);
      },
      error: () => this.busy.set(false),
    });
  }

  protected back(): void {
    this.router.navigate(['/timeline']);
  }
}
