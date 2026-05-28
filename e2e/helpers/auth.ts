import type { Page } from '@playwright/test';

export interface KeycloakUser {
  username: string;
  password: string;
  email: string;
  storagePath: string;
  expectedRole: 'admin' | 'readonly';
}

export const ADMIN: KeycloakUser = {
  username: 'alice',
  password: 'alice-secret',
  email: 'alice@example.com',
  storagePath: 'storage/admin.json',
  expectedRole: 'admin',
};

export const READONLY: KeycloakUser = {
  username: 'bob',
  password: 'bob-secret',
  email: 'bob@example.com',
  storagePath: 'storage/readonly.json',
  expectedRole: 'readonly',
};

/**
 * Drives a Keycloak login from /auth/login back to the SPA. Caller owns
 * the page lifecycle and is responsible for `storageState`-saving.
 */
export async function login(page: Page, user: KeycloakUser): Promise<void> {
  await page.goto('/auth/login');
  // We may already be on Keycloak; if not, wait for the redirect to land.
  await page.waitForURL(/\/realms\/releaseradar\/protocol\/openid-connect\/auth/, {
    timeout: 30_000,
  });
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await Promise.all([
    page.waitForURL((url) => !url.toString().includes('/realms/'), { timeout: 30_000 }),
    page.locator('#kc-login').click(),
  ]);
}
