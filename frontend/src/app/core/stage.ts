export interface StageMeta {
  label: string;
  short: string;
  color: string;
  soft: string;
  border: string;
  announceChannel: 'TMS_NP' | 'TMS_PROD';
  minAdvanceHours: number;
}

export const STAGE: Record<string, StageMeta> = {
  'non-prod': {
    label: 'non-prod',
    short: 'NP',
    color: '#a78bfa',
    soft: 'rgba(167,139,250,.15)',
    border: 'rgba(167,139,250,.55)',
    announceChannel: 'TMS_NP',
    minAdvanceHours: 1,
  },
  prod1: {
    label: 'prod1 · Frankfurt',
    short: 'P1',
    color: '#5eead4',
    soft: 'rgba(94,234,212,.12)',
    border: 'rgba(94,234,212,.5)',
    announceChannel: 'TMS_PROD',
    minAdvanceHours: 168,
  },
  prod2: {
    label: 'prod2 · Zeus',
    short: 'P2',
    color: '#fbbf24',
    soft: 'rgba(251,191,36,.12)',
    border: 'rgba(251,191,36,.5)',
    announceChannel: 'TMS_PROD',
    minAdvanceHours: 336,
  },
};

export function getStage(key: string): StageMeta {
  return (
    STAGE[key] ?? {
      label: key,
      short: (key || '??').slice(0, 2).toUpperCase(),
      color: '#94a3b8',
      soft: 'rgba(148,163,184,.12)',
      border: 'rgba(148,163,184,.5)',
      announceChannel: 'TMS_PROD',
      minAdvanceHours: 24,
    }
  );
}

export function productColor(id: string): string {
  return (
    ({
      operator: '#a78bfa',
      concentrator: '#5eead4',
      monalesy: '#fbbf24',
      microservices: '#fb7185',
    } as Record<string, string>)[id] ?? '#888'
  );
}

export function formatDelay(hours: number): string {
  const h = Number(hours) || 0;
  if (h === 0) return '0h';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  if (!r) return `${d}d`;
  return `${d}d ${r}h`;
}

const MS_PER_DAY = 86400000;
const NS_PER_HOUR = 3_600_000_000_000;

export function hoursToNs(hours: number): number {
  return Math.round((Number(hours) || 0) * NS_PER_HOUR);
}
export function nsToHours(ns: number): number {
  return (Number(ns) || 0) / NS_PER_HOUR;
}

export interface PlannedStage {
  env: string;
  startAt: string;
  durationNs: number;
  status: 'scheduled';
}

/**
 * Expands a RolloutType cascade plan into concrete dated stages. The first
 * entry anchors at `baseISO`; each subsequent entry is offset by its
 * delayHours. An empty plan yields a single non-prod stage at the anchor.
 */
export function cascadeStages(
  baseISO: string,
  plan: { stage: string; delayHours: number }[],
  durationHours: number,
): PlannedStage[] {
  const base = new Date(baseISO).getTime();
  const durationNs = hoursToNs(durationHours);
  const entries = plan && plan.length ? plan : [{ stage: 'non-prod', delayHours: 0 }];
  return entries.map((p) => ({
    env: p.stage,
    startAt: new Date(base + (p.delayHours || 0) * 3600000).toISOString(),
    durationNs,
    status: 'scheduled' as const,
  }));
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}
