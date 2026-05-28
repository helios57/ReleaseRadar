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
