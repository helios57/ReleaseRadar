import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'rr-docs-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="padding: 16px 18px;">
      <div class="rr-month-title">
        <span>API &amp; iCal</span>
        <span class="rr-month-range">Public reference</span>
      </div>
      <ul>
        <li><code>GET /api/products</code></li>
        <li><code>GET /api/rollout-types</code></li>
        <li><code>GET /api/rollouts</code></li>
        <li><code>POST /api/rollouts</code> (admin only)</li>
        <li><code>GET /api/locks</code></li>
        <li><code>POST /api/locks</code> (admin only)</li>
        <li><code>GET /api/calendar.ics</code> — subscribe in Outlook</li>
        <li><code>GET /auth/login</code> — start Microsoft SSO</li>
      </ul>
    </div>
  `,
})
export class DocsViewComponent {}
