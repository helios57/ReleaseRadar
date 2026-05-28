import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, of, switchMap } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { RefreshBus } from '../../../core/refresh.bus';
import { SessionStore } from '../../../core/auth/session.store';
import { STAGE, formatDelay, getStage, productColor } from '../../../core/stage';
import { CascadeStage, Product, RolloutType } from '../../../core/models/rollout.models';
import { IconComponent, ICONS } from '../../../shared/ui/icon.component';
import { BadgeComponent } from '../../../shared/ui/badge.component';

type Tab = 'products' | 'types';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

@Component({
  selector: 'rr-master-data',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, BadgeComponent],
  templateUrl: './master-data-view.component.html',
})
export class MasterDataViewComponent {
  private api = inject(ApiService);
  private bus = inject(RefreshBus);
  protected session = inject(SessionStore);
  protected ICONS = ICONS;
  protected getStage = getStage;
  protected formatDelay = formatDelay;
  protected productColor = productColor;
  protected stageKeys = Object.keys(STAGE);

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected readonly tab = signal<Tab>('products');

  private readonly data = toSignal(
    this.bus.tick$.pipe(
      switchMap(() =>
        combineLatest({
          products: this.api.products().pipe(catchError(() => of<Product[]>([]))),
          types: this.api.rolloutTypes().pipe(catchError(() => of<RolloutType[]>([]))),
        }),
      ),
    ),
    { initialValue: { products: [] as Product[], types: [] as RolloutType[] } },
  );

  protected readonly products = computed(() => this.data().products);
  protected readonly types = computed(() => this.data().types);

  protected readonly productDraft = signal<Product | null>(null);
  protected readonly typeDraft = signal<RolloutType | null>(null);
  protected readonly brokerDraft = signal('');
  protected readonly ruleDraft = signal('');
  protected readonly taskDraft = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Auto-select the first product/type when data first arrives.
    effect(() => {
      const ps = this.products();
      if (ps.length && !this.productDraft()) this.productDraft.set(clone(ps[0]));
    });
    effect(() => {
      const ts = this.types();
      if (ts.length && !this.typeDraft()) this.typeDraft.set(clone(ts[0]));
    });
  }

  // ---------- selection ----------
  protected selectProduct(p: Product): void {
    this.error.set(null);
    this.productDraft.set(clone(p));
  }
  protected newProduct(): void {
    this.error.set(null);
    this.productDraft.set({ id: '', name: 'new product', owner: '', brokers: [] });
  }
  protected selectType(t: RolloutType): void {
    this.error.set(null);
    this.typeDraft.set(clone(t));
  }
  protected newType(): void {
    this.error.set(null);
    this.typeDraft.set({
      id: '',
      name: 'new rollout type',
      short: 'new',
      tone: 'neutral',
      cascadePlan: [{ stage: 'non-prod', delayHours: 0 }],
      rules: [],
      tasks: [],
    });
  }

  // ---------- product editing ----------
  protected patchProduct(patch: Partial<Product>): void {
    const d = this.productDraft();
    if (d) this.productDraft.set({ ...d, ...patch });
  }
  protected addBroker(): void {
    const v = this.brokerDraft().trim();
    const d = this.productDraft();
    if (!v || !d) return;
    this.productDraft.set({ ...d, brokers: [...(d.brokers ?? []), v] });
    this.brokerDraft.set('');
  }
  protected removeBroker(b: string): void {
    const d = this.productDraft();
    if (d) this.productDraft.set({ ...d, brokers: (d.brokers ?? []).filter((x) => x !== b) });
  }
  protected saveProduct(): void {
    const d = this.productDraft();
    if (!d || !d.name.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.upsertProduct(d).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.productDraft.set(clone(saved));
        this.bus.bump();
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(extractError(e));
      },
    });
  }

  // ---------- type editing ----------
  protected patchType(patch: Partial<RolloutType>): void {
    const d = this.typeDraft();
    if (d) this.typeDraft.set({ ...d, ...patch });
  }
  protected addRule(): void {
    const v = this.ruleDraft().trim();
    const d = this.typeDraft();
    if (!v || !d) return;
    this.typeDraft.set({ ...d, rules: [...d.rules, v] });
    this.ruleDraft.set('');
  }
  protected removeRule(i: number): void {
    const d = this.typeDraft();
    if (d) this.typeDraft.set({ ...d, rules: d.rules.filter((_, idx) => idx !== i) });
  }
  protected addTask(): void {
    const v = this.taskDraft().trim();
    const d = this.typeDraft();
    if (!v || !d) return;
    this.typeDraft.set({ ...d, tasks: [...d.tasks, v] });
    this.taskDraft.set('');
  }
  protected editTask(i: number, v: string): void {
    const d = this.typeDraft();
    if (!d) return;
    const tasks = [...d.tasks];
    tasks[i] = v;
    this.typeDraft.set({ ...d, tasks });
  }
  protected removeTask(i: number): void {
    const d = this.typeDraft();
    if (d) this.typeDraft.set({ ...d, tasks: d.tasks.filter((_, idx) => idx !== i) });
  }
  protected moveTask(i: number, dir: number): void {
    const d = this.typeDraft();
    if (!d) return;
    const j = i + dir;
    if (j < 0 || j >= d.tasks.length) return;
    const tasks = [...d.tasks];
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
    this.typeDraft.set({ ...d, tasks });
  }
  protected addStage(key: string): void {
    const d = this.typeDraft();
    if (!d) return;
    const last = d.cascadePlan[d.cascadePlan.length - 1];
    const delay = last ? (last.delayHours || 0) + 168 : 0;
    this.typeDraft.set({ ...d, cascadePlan: [...d.cascadePlan, { stage: key, delayHours: delay }] });
  }
  protected patchStage(i: number, patch: Partial<CascadeStage>): void {
    const d = this.typeDraft();
    if (!d) return;
    const cascadePlan = d.cascadePlan.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    this.typeDraft.set({ ...d, cascadePlan });
  }
  protected removeStage(i: number): void {
    const d = this.typeDraft();
    if (d) this.typeDraft.set({ ...d, cascadePlan: d.cascadePlan.filter((_, idx) => idx !== i) });
  }
  protected usedStageKeys = computed(() => new Set((this.typeDraft()?.cascadePlan ?? []).map((p) => p.stage)));
  protected unusedStageKeys = computed(() => this.stageKeys.filter((k) => !this.usedStageKeys().has(k)));

  protected saveType(): void {
    const d = this.typeDraft();
    if (!d || !d.name.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.upsertRolloutType(d).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.typeDraft.set(clone(saved));
        this.bus.bump();
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(extractError(e));
      },
    });
  }
}

function extractError(e: unknown): string {
  const err = e as { error?: unknown; message?: string };
  if (typeof err?.error === 'string' && err.error.trim()) return err.error.trim();
  return err?.message ?? 'Unexpected error';
}
