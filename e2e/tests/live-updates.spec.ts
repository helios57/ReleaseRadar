import { test, expect, type Page } from '@playwright/test';
import { ADMIN, READONLY } from '../helpers/auth';

/**
 * Live-update (WebSocket) coverage — driven the way a real user would.
 *
 * The *source* of every change is a genuine UI action performed by one user in
 * one browser context (creating a rollout through the modal, deleting it from
 * its detail page). A second user, in a separate browser context, must see the
 * effect propagate live — without a manual reload — and the connection
 * indicator must report a healthy channel. No API shortcuts are used to trigger
 * the change under test; the API is the thing whose live behaviour we're
 * verifying end-to-end.
 */

/** Create a rollout exactly as an admin would: open the modal, fill it, submit. */
async function createRolloutViaUI(page: Page, prefix: string): Promise<{ id: string; title: string }> {
  const title = `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto('/');
  await page.getByRole('button', { name: /New rollout/ }).first().click();

  const modal = page.locator('[data-test="create-rollout-modal"]');
  await expect(modal).toBeVisible();
  await modal.locator('[data-test="rollout-product"]').selectOption('operator');
  await modal.locator('[data-test="rollout-type"]').selectOption('operator-feature');
  await modal.locator('[data-test="rollout-title"]').fill(title);
  await modal.locator('[data-test="rollout-descext"]').fill('created via browser e2e');
  await modal.locator('[data-test="rollout-submit"]').click();

  // The app navigates to the new rollout's detail page; read the id from the URL.
  await page.waitForURL(/#\/rollout\/[^/]+$/, { timeout: 15_000 });
  const id = page.url().split('/rollout/')[1];
  expect(id).toBeTruthy();
  return { id, title };
}

/** Delete a rollout exactly as an admin would: from its detail page. */
async function deleteRolloutViaUI(page: Page, id: string): Promise<void> {
  await page.goto(`/#/rollout/${id}`);
  await expect(page.locator('[data-test="rollout-detail"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-test="delete-rollout"]').click();
  await page.locator('[data-test="confirm-delete"]').click();
  await expect(page.locator('[data-test="rollout-detail"]')).toHaveCount(0, { timeout: 15_000 });
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

  test('a rollout an admin creates in the UI appears live in a readonly client', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({ storageState: ADMIN.storagePath });
    const readerCtx = await browser.newContext({ storageState: READONLY.storagePath });
    const adminPage = await adminCtx.newPage();
    const readerPage = await readerCtx.newPage();
    try {
      // Reader is watching the list with a healthy live channel.
      await readerPage.goto('/#/list');
      await expect(readerPage.locator('[data-test="live-status"]')).toHaveText(/Live/i, {
        timeout: 15_000,
      });
      await expect(readerPage.locator('.rr-list-table')).toBeVisible();

      // Capture a pre-existing (seeded) row to prove it is NOT recreated when the
      // list updates — a proxy for "no flicker" (stable @for track key).
      const existingRow = readerPage.locator('[data-test^="list-row-"]').first();
      await expect(existingRow).toBeVisible();
      const existingHandle = await existingRow.elementHandle();

      // Admin creates a rollout through the modal in their own browser.
      const { id } = await createRolloutViaUI(adminPage, 'live-ui-create');

      // The reader sees it arrive via the WebSocket push — no reload. (An
      // operator-feature rollout has a 3-stage cascade → one list row per
      // stage, so scope to .first() for the strict-mode visibility check.)
      await expect(readerPage.locator(`[data-test="list-row-${id}"]`).first()).toBeVisible({
        timeout: 15_000,
      });
      // The previously-rendered row node is still the same attached node.
      expect(existingHandle).not.toBeNull();
      expect(await existingHandle!.evaluate((el) => el.isConnected)).toBe(true);
    } finally {
      await adminCtx.close();
      await readerCtx.close();
    }
  });

  test('a rollout an admin deletes in the UI disappears live in a readonly client', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({ storageState: ADMIN.storagePath });
    const readerCtx = await browser.newContext({ storageState: READONLY.storagePath });
    const adminPage = await adminCtx.newPage();
    const readerPage = await readerCtx.newPage();
    try {
      // Admin creates the rollout (UI), then the reader opens the list and sees it.
      const { id } = await createRolloutViaUI(adminPage, 'live-ui-delete');

      await readerPage.goto('/#/list');
      await expect(readerPage.locator('[data-test="live-status"]')).toHaveText(/Live/i, {
        timeout: 15_000,
      });
      // 3-stage cascade → one row per stage; .first() for the visibility check,
      // the full locator (count) to confirm every row is gone after delete.
      const rows = readerPage.locator(`[data-test="list-row-${id}"]`);
      await expect(rows.first()).toBeVisible({ timeout: 15_000 });

      // Admin deletes it from the detail page; the reader's rows vanish live.
      await deleteRolloutViaUI(adminPage, id);
      await expect(rows).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await adminCtx.close();
      await readerCtx.close();
    }
  });

  test('deleting the rollout a user is viewing shows a "deleted" state live', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({ storageState: ADMIN.storagePath });
    const readerCtx = await browser.newContext({ storageState: READONLY.storagePath });
    const adminPage = await adminCtx.newPage();
    const readerPage = await readerCtx.newPage();
    try {
      const { id } = await createRolloutViaUI(adminPage, 'live-ui-detail-delete');

      // Reader opens the rollout's detail page and the live channel is healthy.
      await readerPage.goto(`/#/rollout/${id}`);
      await expect(readerPage.locator('[data-test="rollout-detail"]')).toBeVisible({
        timeout: 15_000,
      });
      await expect(readerPage.locator('[data-test="live-status"]')).toHaveText(/Live/i, {
        timeout: 15_000,
      });

      // Admin deletes it; the reader's open detail flips to the explicit
      // "deleted" state (not stale, not a generic loading placeholder), no reload.
      await deleteRolloutViaUI(adminPage, id);
      await expect(readerPage.locator('[data-test="rollout-detail-deleted"]')).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await adminCtx.close();
      await readerCtx.close();
    }
  });

  test('an edit one user makes is reflected live in another user\'s open detail view', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({ storageState: ADMIN.storagePath });
    const readerCtx = await browser.newContext({ storageState: READONLY.storagePath });
    const adminPage = await adminCtx.newPage();
    const readerPage = await readerCtx.newPage();
    try {
      const { id } = await createRolloutViaUI(adminPage, 'live-ui-update');

      // Reader opens the detail page; the live channel is healthy.
      await readerPage.goto(`/#/rollout/${id}`);
      await expect(readerPage.locator('[data-test="detail-descext"]')).toContainText(
        'created via browser e2e',
        { timeout: 15_000 },
      );
      await expect(readerPage.locator('[data-test="live-status"]')).toHaveText(/Live/i, {
        timeout: 15_000,
      });

      // Admin edits the external description through the detail UI.
      const newText = `edited live ${Date.now()}`;
      await adminPage.goto(`/#/rollout/${id}`);
      await adminPage.locator('[data-test="edit-rollout"]').click();
      await adminPage.locator('[data-test="edit-descext"]').fill(newText);
      await adminPage.locator('[data-test="save-rollout"]').click();

      // The reader's open detail reflects the edit live — no reload.
      await expect(readerPage.locator('[data-test="detail-descext"]')).toContainText(newText, {
        timeout: 15_000,
      });
    } finally {
      await adminCtx.close();
      await readerCtx.close();
    }
  });

  test('one admin sees another admin\'s UI change live', async ({ browser }) => {
    const actorCtx = await browser.newContext({ storageState: ADMIN.storagePath });
    const observerCtx = await browser.newContext({ storageState: ADMIN.storagePath });
    const actorPage = await actorCtx.newPage();
    const observerPage = await observerCtx.newPage();
    try {
      await observerPage.goto('/#/list');
      await expect(observerPage.locator('[data-test="live-status"]')).toHaveText(/Live/i, {
        timeout: 15_000,
      });

      const { id } = await createRolloutViaUI(actorPage, 'live-ui-two-admin');
      await expect(observerPage.locator(`[data-test="list-row-${id}"]`).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await actorCtx.close();
      await observerCtx.close();
    }
  });
});
