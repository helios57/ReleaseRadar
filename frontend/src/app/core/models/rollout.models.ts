export type Role = 'admin' | 'readonly';
export type StageEnv = 'non-prod' | 'prod1' | 'prod2' | string;
export type StageStatus = 'scheduled' | 'active' | 'blocked' | 'done' | 'failed';
export type TaskStatus = '' | 'done' | 'failed';

export interface Actor {
  id: string;
  name: string;
  initials: string;
  hue: number;
  role: Role;
}

export interface Product {
  id: string;
  name: string;
  owner?: string;
  brokers?: string[];
}

export interface CascadeStage {
  stage: StageEnv;
  delayHours: number;
}

export interface RolloutType {
  id: string;
  name: string;
  short: string;
  tone: 'neutral' | 'info' | 'warn' | 'danger' | 'ok';
  delayProd1Ns?: number;
  delayProd2Ns?: number;
  cascadePlan: CascadeStage[];
  announce?: string;
  rules: string[];
  tasks: string[];
}

/** Concrete dated entry; matches the Go wire format (absolute start + ns duration). */
export interface RolloutStage {
  env: StageEnv;
  startAt: string;
  durationNs: number;
  status: StageStatus;
}

export interface RolloutTask {
  index: number;
  description: string;
  status: TaskStatus;
  reason?: string;
  by?: string;
  at?: string;
}

export interface Rollout {
  id: string;
  product: string;
  typeId: string;
  title: string;
  descExt: string;
  descInt: string;
  risks: string;
  stages: RolloutStage[];
  // The API may return `null` for an empty pair (Go nil-slice marshaling), so
  // consumers must guard with `?? []`. Backend also normalizes to `[]`.
  pair: string[] | null;
  tasks: RolloutTask[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface Lock {
  id: string;
  title: string;
  description: string;
  contact: string;
  startAt: string;
  endAt: string;
  products: string[];
  kind: 'manual' | 'holiday' | 'window';
}

export interface SessionUser {
  email: string;
  name: string;
  initials: string;
  role: Role;
  groups: string[];
}
