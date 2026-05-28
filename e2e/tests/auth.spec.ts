import { test, expect } from '@playwright/test';
import { ADMIN, READONLY } from '../helpers/auth';

test('unauthenticated /api/me returns 401', async ({ request }) => {
  const res = await request.get('/api/me');
  expect(res.status()).toBe(401);
});

test('admin session resolves admin role', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ADMIN.storagePath });
  const res = await ctx.request.get('/api/me');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({
    email: ADMIN.email,
    role: 'admin',
  });
  expect(Array.isArray(body.groups)).toBeTruthy();
  expect(body.groups.join(',').toLowerCase()).toContain('rr-admins');
  await ctx.close();
});

test('readonly session resolves readonly role', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: READONLY.storagePath });
  const res = await ctx.request.get('/api/me');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({
    email: READONLY.email,
    role: 'readonly',
  });
  expect(body.groups.join(',').toLowerCase()).toContain('rr-readers');
  await ctx.close();
});

test('logout clears the session', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ADMIN.storagePath });
  const logoutRes = await ctx.request.post('/auth/logout');
  expect(logoutRes.status()).toBe(204);
  const me = await ctx.request.get('/api/me');
  expect(me.status()).toBe(401);
  await ctx.close();
});
