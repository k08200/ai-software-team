/**
 * settings.spec.ts
 *
 * E2E tests for the Settings page (/settings).
 *
 * Auth strategy:
 *   The app loads from localStorage (auth_token) and calls GET /api/auth/me
 *   to hydrate the user store. The /api/auth/* routes share a rate-limiter
 *   (20 req / 15 min). To avoid hitting that limit during test runs we stub
 *   both /api/auth/me AND /api/billing/plans before each navigation.
 *
 * Artifacts saved to /tmp/e2e-artifacts/
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ARTIFACT_DIR = '/tmp/e2e-artifacts';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

// Stable mock user returned by /api/auth/me stub
const MOCK_USER_RESPONSE = JSON.stringify({
  success: true,
  data: {
    user: {
      id: 'mem-user-2',
      email: 'test@demo.com',
      plan: 'enterprise',
      emailVerified: true,
      stripeCustomerId: null,
      runCountCurrentPeriod: 0,
      periodStart: '2026-05-17T08:09:13.568Z',
      createdAt: '2026-05-17T08:09:13.568Z',
    },
  },
});

const MOCK_PLANS_RESPONSE = JSON.stringify({
  success: true,
  data: [
    { id: 'free',       name: 'Free',       price: 0,   runsPerMonth: 10,   features: ['10 runs/month', 'Community support', 'Basic models'] },
    { id: 'starter',    name: 'Starter',    price: 9,   runsPerMonth: 50,   features: ['50 runs/month', 'Email support', 'All models'] },
    { id: 'pro',        name: 'Pro',        price: 29,  runsPerMonth: 500,  features: ['500 runs/month', 'Priority support', 'Extended thinking'] },
    { id: 'team',       name: 'Team',       price: 99,  runsPerMonth: 2000, features: ['2000 runs/month', 'Slack support', 'Custom agents'] },
    { id: 'enterprise', name: 'Enterprise', price: 499, runsPerMonth: -1,   features: ['Unlimited runs', 'Dedicated support', 'SLA + SSO'] },
  ],
});

/** Install route stubs that prevent rate-limit hits and auth redirects. */
async function stubAuthRoutes(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: MOCK_USER_RESPONSE,
    })
  );
}

async function stubBillingRoutes(page: import('@playwright/test').Page) {
  await page.route('**/api/billing/plans', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: MOCK_PLANS_RESPONSE,
    })
  );
}

// ---------------------------------------------------------------------------
// Settings E2E tests
// ---------------------------------------------------------------------------

test.describe('Settings Page', () => {
  // -------------------------------------------------------------------------
  // Profile tab (default view)
  // -------------------------------------------------------------------------

  test('Profile tab – content and screenshot', async ({ page }) => {
    await stubAuthRoutes(page);

    await page.goto('http://localhost:3000/settings', { waitUntil: 'domcontentloaded' });
    // Wait for auth loading spinner to resolve and page to render
    await page.waitForSelector('h1', { timeout: 10000 });

    // Page heading
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();

    // Sidebar: Profile tab should be active by default
    const profileBtn = page.locator('nav[aria-label="Settings navigation"] button', { hasText: 'Profile' });
    await expect(profileBtn).toHaveAttribute('aria-current', 'page');

    // Account Information section
    await expect(page.locator('text=Account Information')).toBeVisible();
    // Email value in the account info card (use the text-sm text-white span in the card)
    await expect(page.locator('span.text-sm.text-white:has-text("test@demo.com")')).toBeVisible();

    // Change Password section with inputs
    await expect(page.locator('text=Change Password')).toBeVisible();
    await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
    await expect(page.locator('input[autocomplete="new-password"]').first()).toBeVisible();
    await expect(page.locator('button:has-text("Update Password")')).toBeVisible();

    await page.screenshot({ path: `${ARTIFACT_DIR}/settings-profile.png`, fullPage: false });
  });

  // -------------------------------------------------------------------------
  // API Keys tab
  // -------------------------------------------------------------------------

  test('API Keys tab – content and screenshot', async ({ page }) => {
    await stubAuthRoutes(page);

    await page.goto('http://localhost:3000/settings?tab=api-keys', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });

    // Active sidebar tab
    const apiKeysBtn = page.locator('nav[aria-label="Settings navigation"] button', { hasText: 'API Keys' });
    await expect(apiKeysBtn).toHaveAttribute('aria-current', 'page');

    // Static heading and description
    await expect(page.locator('h3:has-text("API Keys")')).toBeVisible();
    await expect(page.locator('text=Use these keys to authenticate programmatic')).toBeVisible();

    // Create Key button always visible
    await expect(page.locator('button:has-text("Create Key")')).toBeVisible();

    // Wait for async API-key fetch to settle
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 10000 }
    ).catch(() => { /* no spinner present */ });

    await page.waitForTimeout(1000);

    // Assert one of three possible states is rendered
    const hasTable = await page.locator('table[aria-label="API Keys"]').count();
    const hasEmpty = await page.locator('text=No API keys yet').count();
    const hasError = await page.locator('text=Failed to retrieve API keys').count();
    expect(hasTable + hasEmpty + hasError).toBeGreaterThan(0);

    await page.screenshot({ path: `${ARTIFACT_DIR}/settings-apikeys.png`, fullPage: false });
  });

  // -------------------------------------------------------------------------
  // Billing tab
  // -------------------------------------------------------------------------

  test('Billing tab – content and screenshot', async ({ page }) => {
    await stubAuthRoutes(page);
    await stubBillingRoutes(page);

    await page.goto('http://localhost:3000/settings?tab=billing', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });

    // Active sidebar tab
    const billingBtn = page.locator('nav[aria-label="Settings navigation"] button', { hasText: 'Billing' });
    await expect(billingBtn).toHaveAttribute('aria-current', 'page');

    // Current Plan and Available Plans section headings
    await expect(page.locator('h3:has-text("Current Plan")')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('h3:has-text("Available Plans")')).toBeVisible({ timeout: 6000 });

    // Plan cards loaded (spinner gone)
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 10000 }
    ).catch(() => {});

    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACT_DIR}/settings-billing.png`, fullPage: false });
  });

  // -------------------------------------------------------------------------
  // Danger Zone tab
  // -------------------------------------------------------------------------

  test('Danger Zone tab – content and screenshot', async ({ page }) => {
    await stubAuthRoutes(page);

    await page.goto('http://localhost:3000/settings?tab=danger', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });

    // Active sidebar tab
    const dangerBtn = page.locator('nav[aria-label="Settings navigation"] button', { hasText: 'Danger Zone' });
    await expect(dangerBtn).toHaveAttribute('aria-current', 'page');

    // Warning panel
    await expect(page.locator('h3:has-text("Delete Account")')).toBeVisible();
    await expect(page.locator('text=This will permanently delete your account')).toBeVisible();
    await expect(page.locator('button:has-text("Delete Account")')).toBeVisible();

    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACT_DIR}/settings-danger.png`, fullPage: false });
  });

  // -------------------------------------------------------------------------
  // Full sequential walk — authoritative artifact-capture test
  // -------------------------------------------------------------------------

  test('Full settings walk – capture all four tab screenshots', async ({ page }) => {
    // Install all stubs upfront so no API call can trigger an auth redirect
    await stubAuthRoutes(page);
    await stubBillingRoutes(page);

    // ---- TAB 1: Profile ----
    await page.goto('http://localhost:3000/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Account Information', { timeout: 10000 });
    await page.screenshot({ path: `${ARTIFACT_DIR}/settings-profile.png`, fullPage: false });

    // ---- TAB 2: API Keys ----
    await page.goto('http://localhost:3000/settings?tab=api-keys', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h3:has-text("API Keys")', { timeout: 10000 });
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 10000 }
    ).catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACT_DIR}/settings-apikeys.png`, fullPage: false });

    // ---- TAB 3: Billing (stub prevents 401 redirect) ----
    await page.goto('http://localhost:3000/settings?tab=billing', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('h3:has-text("Current Plan")')).toBeVisible({ timeout: 8000 });
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 10000 }
    ).catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACT_DIR}/settings-billing.png`, fullPage: false });

    // ---- TAB 4: Danger Zone ----
    await page.goto('http://localhost:3000/settings?tab=danger', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h3:has-text("Delete Account")', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${ARTIFACT_DIR}/settings-danger.png`, fullPage: false });
  });
});
