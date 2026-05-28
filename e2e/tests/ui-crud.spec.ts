import { test, expect } from '@playwright/test';
import { ADMIN, READONLY } from '../helpers/auth';

test.describe('UI — admin create + execute flows', () => {
  test.use({ storageState: ADMIN.storagePath });

  test('create a rollout through the modal and land on its detail page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /New rollout/ }).first().click();

    const modal = page.locator('[data-test="create-rollout-modal"]');
    await expect(modal).toBeVisible();

    const title = `ui-e2e rollout ${Date.now()}`;
    await modal.locator('[data-test="rollout-product"]').selectOption('operator');
    await modal.locator('[data-test="rollout-type"]').selectOption('operator-feature');
    await modal.locator('[data-test="rollout-title"]').fill(title);
    await modal.locator('[data-test="rollout-descext"]').fill('created via browser e2e');
    await modal.locator('[data-test="rollout-submit"]').click();

    const detail = page.locator('[data-test="rollout-detail"]');
    await expect(detail).toBeVisible({ timeout: 15_000 });
    await expect(detail).toContainText(title);
    // Tasks are inherited from the operator-feature type.
    await expect(page.locator('.rr-task').first()).toBeVisible();
  });

  test('complete the first task on a freshly created rollout', async ({ page, request }) => {
    const startAt = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request.post('/api/rollouts', {
      data: {
        product: 'operator',
        typeId: 'operator-feature',
        title: `ui-task target ${Date.now()}`,
        descExt: 'x',
        stages: [{ env: 'non-prod', startAt, durationNs: 3_600_000_000_000, status: 'scheduled' }],
        pair: [],
      },
    });
    expect(res.status()).toBe(201);
    const { id } = await res.json();

    await page.goto(`/#/rollout/${id}`);
    const doneBtn = page.locator('[data-test="task-done-0"]');
    await expect(doneBtn).toBeVisible();
    await expect(doneBtn).toBeEnabled();
    await doneBtn.click();

    // After the PATCH + reload, the task row should be marked done.
    await expect(page.locator('[data-test="task-0"]')).toHaveClass(/is-done/, { timeout: 10_000 });
  });

  test('record a failure reason on a task', async ({ page, request }) => {
    const startAt = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request.post('/api/rollouts', {
      data: {
        product: 'operator',
        typeId: 'operator-feature',
        title: `ui-fail target ${Date.now()}`,
        descExt: 'x',
        stages: [{ env: 'non-prod', startAt, durationNs: 3_600_000_000_000, status: 'scheduled' }],
        pair: [],
      },
    });
    const { id } = await res.json();

    await page.goto(`/#/rollout/${id}`);
    // The second check button in task 0's row is "mark failed".
    await page.locator('[data-test="task-0"] .rr-check-fail').click();
    await page.locator('[data-test="fail-reason"]').fill('broker diff drift on zeus-02');
    await page.locator('[data-test="fail-save"]').click();

    await expect(page.locator('[data-test="task-0"]')).toHaveClass(/is-failed/, { timeout: 10_000 });
    await expect(page.locator('[data-test="task-0"]')).toContainText('broker diff drift on zeus-02');
  });

  test('create a lock through the modal', async ({ page }) => {
    await page.goto('/#/locks');
    await page.locator('[data-test="new-lock"]').click();

    const modal = page.locator('[data-test="create-lock-modal"]');
    await expect(modal).toBeVisible();

    const title = `ui-lock ${Date.now()}`;
    await modal.locator('[data-test="lock-title"]').fill(title);
    await modal.locator('[data-test="lock-submit"]').click();

    await expect(modal).toBeHidden();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });

  test('create a rollout type in master data', async ({ page }) => {
    await page.goto('/#/data');
    await page.getByRole('button', { name: 'Rollout Types' }).click();
    await page.locator('[data-test="md-new-type"]').click();

    const name = `ui-type-${Date.now()}`;
    await page.locator('[data-test="md-type-name"]').fill(name);
    await page.locator('[data-test="md-task-draft"]').fill('ui task one');
    await page.locator('[data-test="md-add-task"]').click();
    await page.locator('[data-test="md-save-type"]').click();

    await expect(page.locator('.rr-md-list-name', { hasText: name })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('list view filters render without crashing', async ({ page }) => {
    await page.goto('/#/list');
    await expect(page.locator('.rr-list-table')).toBeVisible();
    await page.getByRole('button', { name: /Scheduled/ }).click();
    await expect(page.locator('.rr-list-table')).toBeVisible();
  });
});

test.describe('UI — readonly gating', () => {
  test.use({ storageState: READONLY.storagePath });

  test('readonly sees a disabled New rollout button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /New rollout/ }).first()).toBeDisabled();
  });

  test('readonly master data shows the restricted message', async ({ page }) => {
    await page.goto('/#/data');
    await expect(page.getByText(/restricted to administrators/)).toBeVisible();
  });
});
