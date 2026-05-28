import { test, expect } from '@playwright/test';
import { ADMIN, READONLY } from '../helpers/auth';

test('readonly cannot fetch master data (rollout types)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: READONLY.storagePath });
  const res = await ctx.request.get('/api/rollout-types');
  expect(res.status()).toBe(403);
  await ctx.close();
});

test('admin can fetch master data (rollout types)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ADMIN.storagePath });
  const res = await ctx.request.get('/api/rollout-types');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBeTruthy();
  expect(body.length).toBeGreaterThan(0);
  expect(body[0]).toHaveProperty('id');
  expect(body[0]).toHaveProperty('tasks');
  await ctx.close();
});

test('readonly cannot POST a rollout (403)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: READONLY.storagePath });
  const res = await ctx.request.post('/api/rollouts', {
    data: {
      product: 'operator',
      typeId: 'tms-ssp-nc',
      title: 'unauthorized attempt',
      stages: [],
    },
  });
  expect(res.status()).toBe(403);
  await ctx.close();
});

test('readonly cannot POST a lock (403)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: READONLY.storagePath });
  const res = await ctx.request.post('/api/locks', {
    data: { title: 'should be denied', startAt: new Date().toISOString(), endAt: new Date().toISOString() },
  });
  expect(res.status()).toBe(403);
  await ctx.close();
});

test('rollout list strips internal fields for readonly', async ({ browser }) => {
  const adminCtx = await browser.newContext({ storageState: ADMIN.storagePath });
  const roCtx = await browser.newContext({ storageState: READONLY.storagePath });

  const adminList = await (await adminCtx.request.get('/api/rollouts')).json();
  const roList = await (await roCtx.request.get('/api/rollouts')).json();

  expect(adminList.length).toBeGreaterThan(0);
  expect(adminList.length).toEqual(roList.length);

  for (const r of adminList) {
    expect(typeof r.descInt).toBe('string');
    expect(typeof r.risks).toBe('string');
  }
  for (const r of roList) {
    expect(r.descInt).toBe('');
    expect(r.risks).toBe('');
  }

  await adminCtx.close();
  await roCtx.close();
});
