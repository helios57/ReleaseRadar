import { Injectable, signal } from '@angular/core';

export type DialogKind = 'rollout' | 'lock' | null;

/** Tracks which global create-modal is open. Hosted once in the shell. */
@Injectable({ providedIn: 'root' })
export class DialogStore {
  readonly open = signal<DialogKind>(null);

  openRollout(): void {
    this.open.set('rollout');
  }
  openLock(): void {
    this.open.set('lock');
  }
  close(): void {
    this.open.set(null);
  }
}
