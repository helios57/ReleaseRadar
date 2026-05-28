export type Role = 'admin' | 'readonly';
export type StageEnv = 'non-prod' | 'prod1' | 'prod2' | string;
export type StageStatus = 'scheduled' | 'active' | 'blocked' | 'done' | 'failed';

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

export interface RolloutTypeStage {
  stage: StageEnv;
  delayHours: number;
}

export interface RolloutType {
  id: string;
  name: string;
  short: string;
  tone: 'neutral' | 'info' | 'warn' | 'danger' | 'ok';
  cascadePlan: RolloutTypeStage[];
  announce?: string;
  rules: string[];
  tasks: string[];
}

export interface RolloutStage {
  env: StageEnv;
  offset: number;
  time: string;
  duration: number;
  status: StageStatus;
}

export interface Rollout {
  id: string;
  product: string;
  typeId: string;
  title: string;
  stages: RolloutStage[];
  pair: string[];
  risks: string;
  descExt: string;
  descInt: string;
  checked: number[];
}

export interface Lock {
  id: string;
  title: string;
  description: string;
  contact: string;
  startOffset: number;
  endOffset: number;
  products: string[];
  kind: 'manual' | 'holiday';
}

export interface SessionUser {
  email: string;
  name: string;
  initials: string;
  role: Role;
  groups: string[];
}
