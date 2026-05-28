import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { RefreshBus } from '../../core/refresh.bus';
import { productColor } from '../../core/stage';
import { Product } from '../../core/models/rollout.models';
import { BadgeComponent } from '../../shared/ui/badge.component';

@Component({
  selector: 'rr-contacts-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  template: `
    <div style="padding: 16px 18px;" data-test="contacts-view">
      <div class="rr-month-title">
        <span>Release Contacts &amp; Approvals</span>
        <span class="rr-month-range">{{ products().length }} products</span>
      </div>
      <p class="rr-muted" style="margin: 6px 0 14px;">
        Wer für welches Produkt / welche Broker kontaktiert werden muss (SNOW changes + Releases),
        um eine Release-Freigabe + Window zu erhalten.
      </p>

      <table class="rr-list-table">
        <thead>
          <tr>
            <th style="width:160px">Product</th>
            <th style="width:180px">Release approval</th>
            <th>Brokers</th>
            <th style="width:160px">SNOW change</th>
          </tr>
        </thead>
        <tbody>
          @for (p of products(); track p.id) {
            <tr [attr.data-test]="'contact-' + p.id">
              <td>
                <div class="rr-list-product">
                  <span class="rr-prod-dot" [style.background]="productColor(p.id)"></span>
                  <span>{{ p.name }}</span>
                </div>
              </td>
              <td data-test="contact-owner">{{ p.owner || '—' }}</td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  @for (b of p.brokers || []; track b) {
                    <span class="rr-chip"><code>{{ b }}</code></span>
                  } @empty {
                    <span class="rr-muted">—</span>
                  }
                </div>
              </td>
              <td>
                @if (snowRequired(p)) {
                  <rr-badge tone="warn" [dot]="true">SNOW change required</rr-badge>
                } @else {
                  <rr-badge tone="ok" [dot]="true">no prod impact</rr-badge>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="rr-list-empty">No products.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ContactsViewComponent {
  private api = inject(ApiService);
  private bus = inject(RefreshBus);
  protected productColor = productColor;

  // Refetch off tick$ so live product changes appear without reload.
  // switchMap keeps the previous list during the in-flight window (no flash to
  // empty); track key is the stable product id.
  protected readonly products = toSignal(
    this.bus.tick$.pipe(
      switchMap(() => this.api.products().pipe(catchError(() => of<Product[]>([])))),
    ),
    { initialValue: [] as Product[] },
  );

  // Per spec: a micro-services bug "kann keinen Einfluss auf die Produktion
  // haben" → no SNOW change; everything else touches prod and needs one.
  protected snowRequired(p: Product): boolean {
    return p.id !== 'microservices';
  }
}
