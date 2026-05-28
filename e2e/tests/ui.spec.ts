import { test, expect } from '@playwright/test';
import { ADMIN, READONLY } from '../helpers/auth';

test('admin sees the New rollout button enabled', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ADMIN.storagePath });
  const page = await ctx.newPage();
  await page.goto('/');
  const btn = page.getByRole('button', { name: /new rollout/i });
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();
  await ctx.close();
});

test('readonly sees the New rollout button disabled', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: READONLY.storagePath });
  const page = await ctx.newPage();
  await page.goto('/');
  const btn = page.getByRole('button', { name: /new rollout/i });
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
  await ctx.close();
});

test('timeline page renders rollouts from the API', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ADMIN.storagePath });
  const page = await ctx.newPage();
  await page.goto('/#/timeline');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.rr-tl-tracks')).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.rr-row-title').first()).toBeVisible({ timeout: 15_000 });
  // Pills are rendered async after the rollouts signal resolves.
  await expect.poll(() => page.locator('.rr-pill').count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await ctx.close();
});
