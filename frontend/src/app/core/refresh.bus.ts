import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { startWith } from 'rxjs/operators';

/**
 * App-wide "data changed" signal. Data views pipe their fetch off `tick$`
 * so a single `bump()` after a successful write reloads every open view.
 */
@Injectable({ providedIn: 'root' })
export class RefreshBus {
  private readonly subject = new Subject<number>();
  private n = 0;

  /** Emits immediately (startWith) then on every bump — drive switchMap fetches off this. */
  readonly tick$ = this.subject.asObservable().pipe(startWith(0));

  bump(): void {
    this.subject.next(++this.n);
  }
}
