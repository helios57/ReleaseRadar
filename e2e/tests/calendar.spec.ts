import { test, expect } from '@playwright/test';
import { ADMIN, READONLY } from '../helpers/auth';

test('admin can fetch the iCal feed', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ADMIN.storagePath });
  const res = await ctx.request.get('/api/calendar.ics');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/calendar');
  const body = await res.text();
  expect(body).toContain('BEGIN:VCALENDAR');
  expect(body).toContain('PRODID:-//ReleaseRadar//EN');
  expect(body).toContain('BEGIN:VEVENT');
  expect(body).toContain('END:VCALENDAR');
  await ctx.close();
});

test('readonly can also fetch the iCal feed (per spec)', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: READONLY.storagePath });
  const res = await ctx.request.get('/api/calendar.ics');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/BEGIN:VCALENDAR[\s\S]*END:VCALENDAR/);
  await ctx.close();
});

test('iCal lines stay within RFC 5545 fold limit', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ADMIN.storagePath });
  const body = await (await ctx.request.get('/api/calendar.ics')).text();
  const lines = body.split(/\r?\n/);
  for (const l of lines) {
    expect(l.length).toBeLessThanOrEqual(75);
  }
  await ctx.close();
});
