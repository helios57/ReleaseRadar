import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { SessionStore } from '../../../core/auth/session.store';
import { Product, RolloutType } from '../../../core/models/rollout.models';

@Component({
  selector: 'rr-master-data',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.role() === 'readonly') {
      <div style="padding: 16px 18px;" class="rr-muted">
        Master Data is restricted to administrators. You're signed in as
        <strong>readonly</strong>.
      </div>
    } @else {
      <div style="padding: 16px 18px;">
        <div class="rr-month-title">
          <span>Master Data</span>
          <span class="rr-month-range">{{ products().length }} products · {{ types().length }} types</span>
        </div>
        <h3 style="margin-top: 14px;">Products</h3>
        <ul>
          @for (p of products(); track p.id) {
            <li>{{ p.name }} <span class="rr-mono rr-muted">{{ p.id }}</span></li>
          }
        </ul>
        <h3 style="margin-top: 14px;">Rollout Types</h3>
        <ul>
          @for (t of types(); track t.id) {
            <li>{{ t.name }} <span class="rr-mono rr-muted">{{ t.id }}</span> — {{ t.tasks.length }} tasks</li>
          }
        </ul>
      </div>
    }
  `,
})
export class MasterDataViewComponent {
  private api = inject(ApiService);
  protected session = inject(SessionStore);
  protected readonly products = toSignal(
    this.api.products().pipe(catchError(() => of<Product[]>([]))),
    { initialValue: [] as Product[] },
  );
  protected readonly types = toSignal(
    this.api.rolloutTypes().pipe(catchError(() => of<RolloutType[]>([]))),
    { initialValue: [] as RolloutType[] },
  );
}
