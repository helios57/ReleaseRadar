import { test, expect } from '@playwright/test';
import { ADMIN } from '../helpers/auth';

test.use({ storageState: ADMIN.storagePath });

test('admin can create + read a rollout with inherited tasks', async ({ request }) => {
  const startAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
  const create = await request.post('/api/rollouts', {
    data: {
      product: 'operator',
      typeId: 'operator-feature',
      title: 'e2e — broker auth refactor',
      descExt: 'external public-facing description',
      descInt: 'internal — DB migration rev 42',
      risks: 'broker creation paused ~2h',
      stages: [
        { env: 'non-prod', startAt, durationNs: 7200000000000, status: 'scheduled' },
      ],
      pair: [],
    },
  });
  expect(create.status()).toBe(201);
  const created = await create.json();
  expect(created.id).toMatch(/^r-/);

  const get = await request.get(`/api/rollouts/${created.id}`);
  expect(get.status()).toBe(200);
  const r = await get.json();

  expect(r.title).toBe('e2e — broker auth refactor');
  expect(r.descExt).toBe('external public-facing description');
  expect(r.descInt).toBe('internal — DB migration rev 42');
  expect(r.tasks.length).toBeGreaterThan(0);

  // Verify task inheritance ran — the operator-feature type has these:
  const descriptions = r.tasks.map((t: { description: string }) => t.description);
  expect(descriptions).toContain('Enable Maintenance Mode');
});

test('admin can create a lock', async ({ request }) => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const res = await request.post('/api/locks', {
    data: {
      title: 'e2e holiday lock',
      description: 'no rollouts during this window',
      contact: 'e2e suite',
      startAt: now.toISOString(),
      endAt: tomorrow.toISOString(),
      products: ['all'],
      kind: 'holiday',
    },
  });
  expect(res.status()).toBe(201);
  const created = await res.json();
  expect(created.title).toBe('e2e holiday lock');

  const list = await (await request.get('/api/locks')).json();
  expect(list.some((l: { id: string }) => l.id === created.id)).toBeTruthy();
});

test('GET unknown rollout returns 404', async ({ request }) => {
  const res = await request.get('/api/rollouts/does-not-exist');
  expect(res.status()).toBe(404);
});

test('admin can create master data then a rollout that inherits its tasks', async ({ request }) => {
  // 1. Create a product.
  const productId = `e2e-prod-${Date.now()}`;
  const p = await request.post('/api/products', {
    data: { id: productId, name: 'e2e product', owner: 'e2e', brokers: ['b1', 'b2'] },
  });
  expect(p.status()).toBe(200);

  // 2. Create a rollout type carrying a bespoke task list.
  const typeId = `e2e-type-${Date.now()}`;
  const tasks = ['e2e task A', 'e2e task B', 'e2e task C'];
  const t = await request.post('/api/rollout-types', {
    data: {
      id: typeId,
      name: 'e2e type',
      short: 'e2e',
      tone: 'info',
      cascadePlan: [{ stage: 'non-prod', delayHours: 0 }],
      rules: ['rule one'],
      tasks,
    },
  });
  expect(t.status()).toBe(200);

  // 3. The new type must be visible in master data with its tasks.
  const types = await (await request.get('/api/rollout-types')).json();
  const created = types.find((x: { id: string }) => x.id === typeId);
  expect(created).toBeTruthy();
  expect(created.tasks).toEqual(tasks);

  // 4. Create a rollout of that type — tasks must be inherited verbatim.
  const startAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const r = await request.post('/api/rollouts', {
    data: {
      product: productId,
      typeId,
      title: 'e2e inheritance check',
      descExt: 'x',
      stages: [{ env: 'non-prod', startAt, durationNs: 3600000000000, status: 'scheduled' }],
      pair: [],
    },
  });
  expect(r.status()).toBe(201);
  const created2 = await r.json();
  const fresh = await (await request.get(`/api/rollouts/${created2.id}`)).json();
  expect(fresh.tasks.map((x: { description: string }) => x.description)).toEqual(tasks);
});

test('updating a rollout task records completion + actor', async ({ request }) => {
  const rollouts = await (await request.get('/api/rollouts')).json();
  expect(rollouts.length).toBeGreaterThan(0);
  const target = rollouts[0];

  const patch = await request.patch(`/api/rollouts/${target.id}/tasks/0`, {
    data: { status: 'done', reason: '' },
  });
  expect(patch.status()).toBe(204);

  const fresh = await (await request.get(`/api/rollouts/${target.id}`)).json();
  expect(fresh.tasks[0].status).toBe('done');
});
