/**
 * auth.setup.ts
 *
 * Runs once before all settings tests.
 * Logs in and saves localStorage + cookies to a file so individual tests
 * can reuse the session without re-authenticating.
 */
import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = '/tmp/e2e-artifacts/auth-state.json';

setup('authenticate', async ({ page }) => {
  // Ensure artifact directory exists
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  await page.fill('input[type="email"]', 'test@demo.com');
  await page.fill('input[type="password"]', 'Test1234');

  const signInBtn = page.locator('button:has-text("Sign in")');
  await signInBtn.click();

  // Wait for successful navigation away from login
  await page.waitForURL(/\/(dashboard|settings)/, { timeout: 15000 });

  // Confirm we are authenticated
  await expect(page.locator('text=test@demo.com').first()).toBeVisible({ timeout: 8000 });

  // Save the storage state (localStorage + cookies)
  await page.context().storageState({ path: AUTH_FILE });

  console.log(`[auth.setup] Auth state saved to ${AUTH_FILE}`);
});
