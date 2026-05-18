import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear localStorage to force fresh login
    await context.clearCookies();
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('should load dashboard after login', async ({ page }) => {
    // Navigate to login
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });

    // Wait for login form
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });

    // Fill login credentials
    await page.fill('input[type="email"]', 'test@demo.com');
    await page.fill('input[type="password"]', 'Test1234');

    // Click Sign in button
    const signInButton = page.locator('button:has-text("Sign in")');
    await signInButton.click();

    // Wait for dashboard navigation
    await page.waitForTimeout(2000);

    // Verify we're on dashboard
    expect(page.url()).toContain('/dashboard');

    // Verify dashboard header
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    await expect(page.locator('text=/Welcome back/i')).toBeVisible();
  });

  test('should display all 4 stat cards with correct values', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]');

    await page.fill('input[type="email"]', 'test@demo.com');
    await page.fill('input[type="password"]', 'Test1234');

    const signInButton = page.locator('button:has-text("Sign in")');
    await signInButton.click();

    await page.waitForTimeout(2000);

    // Extract stat card values
    const stats = await page.evaluate(() => {
      const result: Record<string, { value: string; subtitle: string }> = {};

      const allText = document.body.innerText;
      const lines = allText.split('\n').map(l => l.trim()).filter(l => l);

      const labels = [
        'RUNS THIS MONTH',
        'TOTAL TOKENS',
        'COST ESTIMATE',
        'QUOTA REMAINING'
      ];

      labels.forEach(label => {
        const idx = lines.findIndex(l => l === label);
        if (idx >= 0 && idx < lines.length - 1) {
          const value = lines[idx + 1];
          const subtitle = lines[idx + 2] || '';

          result[label] = {
            value,
            subtitle
          };
        }
      });

      return result;
    });

    // Verify all 4 cards are present
    expect(Object.keys(stats)).toHaveLength(4);

    // Verify RUNS THIS MONTH card
    expect(stats['RUNS THIS MONTH']).toBeDefined();
    expect(stats['RUNS THIS MONTH'].value).toBe('0');
    expect(stats['RUNS THIS MONTH'].subtitle).toBe('of unlimited');

    // Verify TOTAL TOKENS card
    expect(stats['TOTAL TOKENS']).toBeDefined();
    expect(stats['TOTAL TOKENS'].value).toBe('0');
    expect(stats['TOTAL TOKENS'].subtitle).toBe('across all runs');

    // Verify COST ESTIMATE card
    expect(stats['COST ESTIMATE']).toBeDefined();
    expect(stats['COST ESTIMATE'].value).toBe('<$0.01');
    expect(stats['COST ESTIMATE'].subtitle).toBe('approx. this month');

    // Verify QUOTA REMAINING card
    expect(stats['QUOTA REMAINING']).toBeDefined();
    expect(stats['QUOTA REMAINING'].value).toBe('Unlimited');
    expect(stats['QUOTA REMAINING'].subtitle).toBe('runs available');
  });

  test('should not display NaN or undefined values', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]');

    await page.fill('input[type="email"]', 'test@demo.com');
    await page.fill('input[type="password"]', 'Test1234');

    const signInButton = page.locator('button:has-text("Sign in")');
    await signInButton.click();

    await page.waitForTimeout(2000);

    // Check page content for NaN or undefined
    const pageText = await page.textContent('body');

    expect(pageText).not.toContain('NaN');
    expect(pageText).not.toContain('undefined');

    // Double check with locators
    const nanCount = await page.locator('text=/NaN/').count();
    const undefCount = await page.locator('text=/undefined/').count();

    expect(nanCount).toBe(0);
    expect(undefCount).toBe(0);
  });

  test('should display Recent Runs table', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]');

    await page.fill('input[type="email"]', 'test@demo.com');
    await page.fill('input[type="password"]', 'Test1234');

    const signInButton = page.locator('button:has-text("Sign in")');
    await signInButton.click();

    await page.waitForTimeout(2000);

    // Verify Recent Runs section
    await expect(page.locator('text=Recent Runs')).toBeVisible();

    const hasTable = await page.locator('table[aria-label="Recent runs"]').count();
    if (hasTable > 0) {
      // Verify table headers
      await expect(page.locator('th:has-text("IDEA")')).toBeVisible();
      await expect(page.locator('th:has-text("STATUS")')).toBeVisible();
      await expect(page.locator('th:has-text("Tokens")')).toBeVisible();
      await expect(page.locator('th:has-text("DATE")')).toBeVisible();
    } else {
      await expect(page.locator('text=No runs yet')).toBeVisible();
      await expect(page.locator('button:has-text("Start your first pipeline")')).toBeVisible();
    }
  });
});
