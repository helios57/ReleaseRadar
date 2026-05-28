import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, READONLY } from '../helpers/auth';

async function createApiRollout(
  request: APIRequestContext,
  prefix: string,
  startAtISO?: string,
) {
  const startAt = startAtISO ?? new Date(Date.now() + 3_600_000).toISOString();
  const res = await request.post('/api/rollouts', {
    data: {
      product: 'operator',
      typeId: 'operator-feature',
      title: `${prefix} ${Date.now()}`,
      descExt: 'x',
      stages: [{ env: 'non-prod', startAt, durationNs: 3_600_000_000_000, status: 'scheduled' }],
      pair: [],
    },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

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

  test('edit a rollout (description + add task) through the detail page', async ({ page, request }) => {
    const created = await createApiRollout(request, 'ui-edit');
    await page.goto(`/#/rollout/${created.id}`);
    await page.locator('[data-test="edit-rollout"]').click();
    await page.locator('[data-test="edit-descext"]').fill('rewritten external description');
    await page.locator('[data-test="new-task"]').fill('ui added task');
    await page.locator('[data-test="add-task"]').click();
    await page.locator('[data-test="save-rollout"]').click();

    await expect(page.locator('[data-test="detail-descext"]')).toContainText(
      'rewritten external description',
      { timeout: 10_000 },
    );
    await expect(page.locator('.rr-task-label', { hasText: 'ui added task' })).toBeVisible();
  });

  test('delete a rollout through the detail page', async ({ page, request }) => {
    const created = await createApiRollout(request, 'ui-delete');
    await page.goto(`/#/rollout/${created.id}`);
    await page.locator('[data-test="delete-rollout"]').click();
    await page.locator('[data-test="confirm-delete"]').click();
    // Detail page unmounts (router navigates to the timeline) and the API 404s.
    await expect(page.locator('[data-test="rollout-detail"]')).toHaveCount(0, { timeout: 10_000 });
    const get = await request.get(`/api/rollouts/${created.id}`);
    expect(get.status()).toBe(404);
  });

  test('edit then delete a lock from the locks view', async ({ page, request }) => {
    const now = new Date();
    const created = await (
      await request.post('/api/locks', {
        data: {
          title: `ui-lock-edit ${Date.now()}`,
          startAt: now.toISOString(),
          endAt: new Date(now.getTime() + 86400000).toISOString(),
          products: ['all'],
          kind: 'manual',
        },
      })
    ).json();

    await page.goto('/#/locks');
    await page.locator(`[data-test="lock-edit-${created.id}"]`).click();
    const newTitle = `ui-lock-renamed ${Date.now()}`;
    await page.locator('[data-test="lock-title"]').fill(newTitle);
    await page.locator('[data-test="lock-submit"]').click();
    await expect(page.getByText(newTitle)).toBeVisible({ timeout: 10_000 });

    await page.locator(`[data-test="lock-delete-${created.id}"]`).click();
    await page.locator(`[data-test="lock-delete-confirm-${created.id}"]`).click();
    await expect(page.locator(`[data-test="lock-${created.id}"]`)).toHaveCount(0, { timeout: 10_000 });
  });

  test('contacts overview lists owner, brokers and SNOW requirement', async ({ page }) => {
    await page.goto('/#/contacts');
    await expect(page.locator('[data-test="contacts-view"]')).toBeVisible();
    const operatorRow = page.locator('[data-test="contact-operator"]');
    await expect(operatorRow).toBeVisible();
    await expect(operatorRow.locator('[data-test="contact-owner"]')).not.toBeEmpty();
    // micro services = no prod impact; operator = SNOW required.
    await expect(operatorRow).toContainText('SNOW change required');
  });

  test('create modal warns on Friday / Bernese-holiday scheduling', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /New rollout/ }).first().click();
    const modal = page.locator('[data-test="create-rollout-modal"]');
    await modal.locator('[data-test="rollout-type"]').selectOption('operator-feature');

    // A clean mid-week date → no advisory.
    await modal.locator('input[type="date"]').fill('2026-06-03');
    await expect(modal.locator('[data-test="schedule-warning"]')).toHaveCount(0);

    // A Friday → advisory appears (rule: no rollouts on Fridays).
    await modal.locator('input[type="date"]').fill('2026-06-05');
    await expect(modal.locator('[data-test="schedule-warning"]')).toBeVisible();
  });

  test('rollout detail shows a lock-active warning when a stage is in a lock window', async ({
    page,
    request,
  }) => {
    const startAt = new Date(Date.now() + 60 * 60 * 1000); // +1h
    const lockStart = new Date(Date.now() - 60 * 60 * 1000); // -1h
    const lockEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // +2d
    await request.post('/api/locks', {
      data: {
        title: `ui-blocking-lock ${Date.now()}`,
        description: 'master bug — do not deploy',
        startAt: lockStart.toISOString(),
        endAt: lockEnd.toISOString(),
        products: ['all'],
        kind: 'manual',
      },
    });
    const created = await createApiRollout(request, 'ui-locked', startAt.toISOString());

    await page.goto(`/#/rollout/${created.id}`);
    await expect(page.locator('[data-test="lock-banner"]')).toBeVisible({ timeout: 10_000 });
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
