import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, READONLY } from '../helpers/auth';

const HOUR_NS = 3_600_000_000_000;
const DAY_NS = 24 * HOUR_NS;

function stage(env: string, startAt: string, durationHours = 2) {
  return { env, startAt, durationNs: durationHours * HOUR_NS, status: 'scheduled' };
}

async function createRollout(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
) {
  const startAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const res = await request.post('/api/rollouts', {
    data: {
      product: 'operator',
      typeId: 'operator-feature',
      title: `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      descExt: 'external',
      descInt: 'internal',
      risks: 'some risk',
      stages: [stage('non-prod', startAt)],
      pair: [],
      ...overrides,
    },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

// ---------------------------------------------------------------------------
// Requirement: Rollouts must be created, UPDATED and DELETED.
// ---------------------------------------------------------------------------
test.describe('Rollout update + delete (admin)', () => {
  test.use({ storageState: ADMIN.storagePath });

  test('PATCH updates fields and supports per-rollout task CRUD', async ({ request }) => {
    const created = await createRollout(request);
    const tasks = [...created.tasks.map((t: { description: string }) => ({ description: t.description, status: '' })),
      { description: 'custom extra task', status: '' }];

    const patch = await request.patch(`/api/rollouts/${created.id}`, {
      data: {
        title: created.title + ' (edited)',
        descExt: 'edited external',
        descInt: 'edited internal',
        risks: 'edited risk',
        stages: created.stages,
        pair: ['luc'],
        tasks,
      },
    });
    expect(patch.status()).toBe(200);

    const fresh = await (await request.get(`/api/rollouts/${created.id}`)).json();
    expect(fresh.title).toContain('(edited)');
    expect(fresh.descExt).toBe('edited external');
    expect(fresh.pair).toContain('luc');
    expect(fresh.tasks.map((t: { description: string }) => t.description)).toContain('custom extra task');
  });

  test('DELETE removes the rollout (subsequent GET is 404)', async ({ request }) => {
    const created = await createRollout(request);
    const del = await request.delete(`/api/rollouts/${created.id}`);
    expect(del.status()).toBe(204);
    const get = await request.get(`/api/rollouts/${created.id}`);
    expect(get.status()).toBe(404);
  });

  test('PATCH unknown rollout returns 404', async ({ request }) => {
    const res = await request.patch('/api/rollouts/does-not-exist', {
      data: { title: 'x', stages: [], pair: [], tasks: [] },
    });
    expect(res.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Requirement: System to create, UPDATE and DELETE rollout locks (Sperren).
// ---------------------------------------------------------------------------
test.describe('Lock update + delete (admin)', () => {
  test.use({ storageState: ADMIN.storagePath });

  test('PATCH updates a lock', async ({ request }) => {
    const now = new Date();
    const end = new Date(now.getTime() + 86400000);
    const created = await (
      await request.post('/api/locks', {
        data: {
          title: 'lock to edit',
          description: 'orig',
          startAt: now.toISOString(),
          endAt: end.toISOString(),
          products: ['all'],
          kind: 'manual',
        },
      })
    ).json();

    const patch = await request.patch(`/api/locks/${created.id}`, {
      data: {
        title: 'lock edited',
        description: 'updated description',
        startAt: now.toISOString(),
        endAt: end.toISOString(),
        products: ['operator'],
        kind: 'window',
      },
    });
    expect(patch.status()).toBe(200);

    const list = await (await request.get('/api/locks')).json();
    const found = list.find((l: { id: string }) => l.id === created.id);
    expect(found.title).toBe('lock edited');
    expect(found.kind).toBe('window');
    expect(found.products).toContain('operator');
  });

  test('DELETE removes a lock', async ({ request }) => {
    const now = new Date();
    const created = await (
      await request.post('/api/locks', {
        data: {
          title: 'lock to delete',
          startAt: now.toISOString(),
          endAt: new Date(now.getTime() + 3600000).toISOString(),
          products: ['all'],
          kind: 'manual',
        },
      })
    ).json();
    const del = await request.delete(`/api/locks/${created.id}`);
    expect(del.status()).toBe(204);
    const list = await (await request.get('/api/locks')).json();
    expect(list.some((l: { id: string }) => l.id === created.id)).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Requirement: readonly may ONLY read; modifications are 403.
// ---------------------------------------------------------------------------
test.describe('readonly cannot mutate (403)', () => {
  test.use({ storageState: READONLY.storagePath });

  test('PATCH/DELETE rollout + lock are forbidden', async ({ request }) => {
    expect((await request.patch('/api/rollouts/r-demo-1', { data: {} })).status()).toBe(403);
    expect((await request.delete('/api/rollouts/r-demo-1')).status()).toBe(403);
    expect((await request.patch('/api/locks/anything', { data: {} })).status()).toBe(403);
    expect((await request.delete('/api/locks/anything')).status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Requirement: the 9 rollout types with their announce timings, staged
// production minimums (DelayProd1/DelayProd2), and inherited tasks.
// ---------------------------------------------------------------------------
test.describe('Rollout type rules', () => {
  test.use({ storageState: ADMIN.storagePath });

  test('all nine types exist with correct delays / announce / tasks', async ({ request }) => {
    const types: any[] = await (await request.get('/api/rollout-types')).json();
    const byId = Object.fromEntries(types.map((t) => [t.id, t]));
    const ids = Object.keys(byId);
    // The nine spec'd types must all be present (other tests may add more).
    expect(ids).toEqual(
      expect.arrayContaining([
        'concentrator-mod',
        'monalesy-feature',
        'monalesy-patch',
        'operator-c-hotfix',
        'operator-feature',
        'operator-monalesy',
        'tms-ssp-c',
        'tms-ssp-c-hotfix',
        'tms-ssp-nc',
      ]),
    );

    const hasBrokerDiff = (t: any) =>
      t.tasks.some((x: string) => /broker diff/i.test(x));

    // Staggered production: prod1 ≥ 1 week, prod2 ≥ 2 weeks.
    expect(byId['operator-feature'].delayProd1Ns).toBe(7 * DAY_NS);
    expect(byId['operator-feature'].delayProd2Ns).toBe(14 * DAY_NS);
    expect(hasBrokerDiff(byId['operator-feature'])).toBeTruthy();
    expect(byId['operator-feature'].announce).toMatch(/TMS_NP.*1h/);
    expect(byId['operator-feature'].announce).toMatch(/1w.*prod1/);

    expect(byId['concentrator-mod'].delayProd1Ns).toBe(7 * DAY_NS);
    expect(byId['concentrator-mod'].delayProd2Ns).toBe(14 * DAY_NS);
    expect(byId['concentrator-mod'].announce).toMatch(/TMS_NP.*1d/);
    expect(byId['concentrator-mod'].rules.join(' ')).toMatch(/Drehbuch/);

    // Hotfix + monalesy operator: prod1 ≥ 1 day, prod2 ≥ 2 days.
    expect(byId['operator-c-hotfix'].delayProd1Ns).toBe(1 * DAY_NS);
    expect(byId['operator-c-hotfix'].delayProd2Ns).toBe(2 * DAY_NS);
    expect(byId['operator-c-hotfix'].rules.join(' ')).toMatch(/HotFix branch/);

    expect(byId['operator-monalesy'].delayProd1Ns).toBe(1 * DAY_NS);
    expect(byId['operator-monalesy'].delayProd2Ns).toBe(2 * DAY_NS);
    // monalesy operator does NOT mandate broker diff / maintenance.
    expect(hasBrokerDiff(byId['operator-monalesy'])).toBeFalsy();

    // Single-stage prod announce windows.
    expect(byId['tms-ssp-nc'].announce).toMatch(/1h/);
    expect(byId['tms-ssp-c'].announce).toMatch(/1d/);
    expect(byId['tms-ssp-c-hotfix'].announce).toMatch(/1h/);
    expect(byId['tms-ssp-c-hotfix'].rules.join(' ')).toMatch(/HotFix branch/);
    expect(byId['monalesy-feature'].announce).toMatch(/1d/);
    expect(byId['monalesy-feature'].rules.join(' ')).toMatch(/SNOW/);
    expect(byId['monalesy-patch'].announce).toMatch(/1h/);
    expect(byId['monalesy-patch'].rules.join(' ')).toMatch(/SNOW/);
  });

  test('staggered cascade: seeded operator-feature demo keeps ≥1w gaps', async ({ request }) => {
    const r = await (await request.get('/api/rollouts/r-demo-1')).json();
    const byEnv = Object.fromEntries(
      r.stages.map((s: { env: string; startAt: string }) => [s.env, new Date(s.startAt).getTime()]),
    );
    const weekMs = 7 * 24 * 3600 * 1000;
    expect(byEnv['prod1'] - byEnv['non-prod']).toBeGreaterThanOrEqual(weekMs);
    expect(byEnv['prod2'] - byEnv['prod1']).toBeGreaterThanOrEqual(weekMs);
  });
});

// ---------------------------------------------------------------------------
// Requirement: log who/when checked a task.
// ---------------------------------------------------------------------------
test.describe('Task completion logging', () => {
  test.use({ storageState: ADMIN.storagePath });

  test('completing a task records the acting admin', async ({ request }) => {
    const created = await createRollout(request);
    const patch = await request.patch(`/api/rollouts/${created.id}/tasks/0`, {
      data: { status: 'done', reason: '' },
    });
    expect(patch.status()).toBe(204);
    const fresh = await (await request.get(`/api/rollouts/${created.id}`)).json();
    expect(fresh.tasks[0].status).toBe('done');
    expect(fresh.tasks[0].by).toBeTruthy(); // actor id is logged
    expect(fresh.tasks[0].at).toBeTruthy(); // timestamp is logged
  });
});

// ---------------------------------------------------------------------------
// Requirement: CalDAV / .ics export, importable in Outlook.
// ---------------------------------------------------------------------------
test.describe('iCal export', () => {
  test.use({ storageState: ADMIN.storagePath });

  test('feed contains a VEVENT per stage with DTSTART', async ({ request }) => {
    const res = await request.get('/api/calendar.ics');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    const events = (body.match(/BEGIN:VEVENT/g) || []).length;
    expect(events).toBeGreaterThanOrEqual(3); // demo rollout alone has 3 stages
    expect(body).toContain('DTSTART');
    expect(body).toContain('operator demo');
  });
});
