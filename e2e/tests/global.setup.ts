import { test as setup, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { ADMIN, READONLY, login } from '../helpers/auth';

setup('mkdir storage', async () => {
  await mkdir('storage', { recursive: true });
});

setup('login admin', async ({ page }) => {
  await login(page, ADMIN);
  const me = await page.request.get('/api/me');
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.role).toBe('admin');
  expect(body.email).toBe(ADMIN.email);
  await page.context().storageState({ path: ADMIN.storagePath });
});

setup('login readonly', async ({ page }) => {
  await login(page, READONLY);
  const me = await page.request.get('/api/me');
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.role).toBe('readonly');
  expect(body.email).toBe(READONLY.email);
  await page.context().storageState({ path: READONLY.storagePath });
});
