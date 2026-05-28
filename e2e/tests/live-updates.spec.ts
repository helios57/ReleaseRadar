import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import { ADMIN, READONLY } from '../helpers/auth';

/**
 * Live-update (WebSocket) coverage. A change made by one client must appear in
 * another open client without a manual reload, and the connection indicator
 * must report a healthy channel. We also assert that an existing row's DOM node
 * survives an update (a proxy for "no flicker": Angular reuses tracked nodes
 * rather than tearing the list down and rebuilding it).
 *
 * Each test seeds its own baseline rollout via the API so it never depends on
 * seed data or the list's default filter.
 */

async function createRollout(
  request: APIRequestContext,
  prefix: string,
): Promise<{ id: string; title: string }> {
  const title = `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const res = await request.post('/api/rollouts', {
    data: {
      product: 'operator',
      typeId: 'operator-feature',
      title,
      descExt: 'live-update e2e',
      stages: [
        {
          env: 'non-prod',
          startAt: new Date(Date.now() + 3_600_000).toISOString(),
          durationNs: 3_600_000_000_000,
          status: 'scheduled',
        },
      ],
      pair: [],
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return { id: body.id, title };
}

test.describe('Live updates over WebSocket', () => {
  test('connection indicator reports Live once connected', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: READONLY.storagePath });
    const page = await ctx.newPage();
    try {
      await page.goto('/#/list');
      await expect(page.locator('[data-test="live-status"]')).toHaveText(/Live/i, {
        timeout: 15_000,
      });
    } finally {
      await ctx.close();
    }
  });

  test('a rollout created by an admin appears live in a readonly client', async ({ browser }) => {
    const admin = await browser.newContext({ storageState: ADMIN.storagePath });
    const reader = await browser.newContext({ storageState: READONLY.storagePath });
    const page = await reader.newPage();
    try {
      // Seed a known baseline row via the API, independent of seed data.
      const baseline = await createRollout(admin.request, 'live-baseline');

      await page.goto('/#/list');
      await expect(page.locator('[data-test="live-status"]')).toHaveText(/Live/i, {
        timeout: 15_000,
      });
      // The baseline row is present after the initial (catch-up) fetch.
      const baselineRow = page.locator(`[data-test="list-row-${baseline.id}"]`);
      await expect(baselineRow).toBeVisible({ timeout: 15_000 });
      const baselineHandle = await baselineRow.elementHandle();

      // Now create a SECOND rollout — it must arrive via the WS push (no reload).
      const live = await createRollout(admin.request, 'live-create');
      await expect(page.locator(`[data-test="list-row-${live.id}"]`)).toBeVisible({
        timeout: 15_000,
      });

      // No-flicker proxy: the baseline row's node is still the same attached node
      // (Angular reused it via the stable track key rather than re-creating it).
      expect(baselineHandle).not.toBeNull();
      expect(await baselineHandle!.evaluate((el) => el.isConnected)).toBe(true);
    } finally {
      await admin.close();
      await reader.close();
    }
  });

  test('a rollout deleted by an admin disappears live in a readonly client', async ({ browser }) => {
    const admin = await browser.newContext({ storageState: ADMIN.storagePath });
    const reader = await browser.newContext({ storageState: READONLY.storagePath });
    const page = await reader.newPage();
    try {
      const target = await createRollout(admin.request, 'live-delete');

      await page.goto('/#/list');
      await expect(page.locator('[data-test="live-status"]')).toHaveText(/Live/i, {
        timeout: 15_000,
      });
      const row = page.locator(`[data-test="list-row-${target.id}"]`);
      await expect(row).toBeVisible({ timeout: 15_000 });

      // Delete via API; the readonly client must drop the row with no reload.
      const del = await admin.request.delete(`/api/rollouts/${target.id}`);
      expect(del.ok()).toBe(true);
      await expect(row).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await admin.close();
      await reader.close();
    }
  });

  test('two admin clients see each other live', async ({ browser }) => {
    const a = await browser.newContext({ storageState: ADMIN.storagePath });
    const b = await browser.newContext({ storageState: ADMIN.storagePath });
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    try {
      await pageA.goto('/#/list');
      await pageB.goto('/#/list');
      await expect(pageB.locator('[data-test="live-status"]')).toHaveText(/Live/i, {
        timeout: 15_000,
      });

      const created = await createRollout(a.request, 'live-two-admin');
      await expect(pageA.locator(`[data-test="list-row-${created.id}"]`)).toBeVisible({
        timeout: 15_000,
      });
      await expect(pageB.locator(`[data-test="list-row-${created.id}"]`)).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await a.close();
      await b.close();
    }
  });
});
