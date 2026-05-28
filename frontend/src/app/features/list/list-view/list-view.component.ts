import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { Rollout } from '../../../core/models/rollout.models';
import { BadgeComponent } from '../../../shared/ui/badge.component';

@Component({
  selector: 'rr-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  template: `
    <div class="rr-list">
      <div class="rr-list-toolbar">
        <div class="rr-list-toolbar-l">
          <div class="rr-month-title">
            <span>Rollouts</span>
            <span class="rr-month-range">{{ rollouts().length }} total</span>
          </div>
        </div>
      </div>
      <div class="rr-list-scroll">
        <table class="rr-list-table">
          <thead>
            <tr>
              <th>Rollout</th>
              <th>Product</th>
              <th>Type</th>
              <th>Stages</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rollouts(); track r.id) {
              <tr class="rr-list-row">
                <td>
                  <div class="rr-list-title">{{ r.title }}</div>
                  <div class="rr-list-id rr-mono rr-muted">{{ r.id }}</div>
                </td>
                <td><span class="rr-mono">{{ r.product }}</span></td>
                <td><rr-badge tone="info">{{ r.typeId }}</rr-badge></td>
                <td>{{ r.stages.length }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="rr-list-empty">No rollouts yet.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ListViewComponent {
  private api = inject(ApiService);
  protected readonly rollouts = toSignal(
    this.api.rollouts().pipe(catchError(() => of<Rollout[]>([]))),
    { initialValue: [] as Rollout[] },
  );
}
