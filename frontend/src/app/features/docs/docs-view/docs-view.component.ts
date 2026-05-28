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
        <li><code>GET /api/me</code></li>
        <li><code>GET /api/products</code> · <code>POST /api/products</code> (admin)</li>
        <li><code>GET /api/rollout-types</code> · <code>POST /api/rollout-types</code> (admin)</li>
        <li><code>GET /api/rollouts</code> · <code>GET /api/rollouts/:id</code></li>
        <li><code>POST /api/rollouts</code> (admin)</li>
        <li><code>PATCH /api/rollouts/:id</code> · <code>DELETE /api/rollouts/:id</code> (admin)</li>
        <li><code>PATCH /api/rollouts/:id/tasks/:seq</code> (admin) — check off a task</li>
        <li><code>GET /api/locks</code> · <code>POST /api/locks</code> (admin)</li>
        <li><code>PATCH /api/locks/:id</code> · <code>DELETE /api/locks/:id</code> (admin)</li>
        <li><code>GET /api/calendar.ics</code> — subscribe / import in Outlook (CalDAV)</li>
        <li><code>GET /auth/login</code> — start Microsoft Entra SSO</li>
      </ul>
    </div>
  `,
})
export class DocsViewComponent {}
