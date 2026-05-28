import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { Lock } from '../../../core/models/rollout.models';

@Component({
  selector: 'rr-locks-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="padding: 16px 18px;">
      <div class="rr-month-title">
        <span>Rollout Locks (Sperren)</span>
        <span class="rr-month-range">{{ locks().length }} active</span>
      </div>
      @for (l of locks(); track l.id) {
        <div class="rr-card" style="margin-top: 12px; padding: 12px;">
          <strong>{{ l.title }}</strong>
          <p class="rr-muted">{{ l.description }}</p>
        </div>
      }
    </div>
  `,
})
export class LocksViewComponent {
  private api = inject(ApiService);
  protected readonly locks = toSignal(
    this.api.locks().pipe(catchError(() => of<Lock[]>([]))),
    { initialValue: [] as Lock[] },
  );
}
