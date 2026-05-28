import { Injectable, signal } from '@angular/core';
import { Lock } from './models/rollout.models';

export type DialogKind = 'rollout' | 'lock' | null;

/** Tracks which global create/edit modal is open. Hosted once in the shell. */
@Injectable({ providedIn: 'root' })
export class DialogStore {
  readonly open = signal<DialogKind>(null);
  /** When set, the lock modal edits this lock instead of creating a new one. */
  readonly lockEdit = signal<Lock | null>(null);

  openRollout(): void {
    this.open.set('rollout');
  }
  openLock(lock?: Lock): void {
    this.lockEdit.set(lock ?? null);
    this.open.set('lock');
  }
  close(): void {
    this.open.set(null);
    this.lockEdit.set(null);
  }
}
