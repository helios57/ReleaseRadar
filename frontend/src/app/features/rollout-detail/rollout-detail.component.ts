import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';

@Component({
  selector: 'rr-rollout-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rollout(); as r) {
      <div style="padding: 16px 18px;">
        <h2>{{ r.title }}</h2>
        <p class="rr-mono rr-muted">{{ r.id }}</p>
        <p>{{ r.descExt }}</p>
        @if (session.isAdmin()) {
          <h4>Internal</h4>
          <p>{{ r.descInt }}</p>
          <h4>Risks</h4>
          <p>{{ r.risks }}</p>
        }
      </div>
    } @else {
      <div style="padding: 16px 18px;" class="rr-muted">Loading rollout…</div>
    }
  `,
})
export class RolloutDetailComponent {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  protected session = inject(SessionStore);

  protected readonly rollout = toSignal(
    this.route.paramMap.pipe(
      switchMap((p) => {
        const id = p.get('id');
        return id ? this.api.rollout(id) : of(null);
      }),
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );
}
