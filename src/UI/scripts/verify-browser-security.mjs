import { chromium } from '@playwright/test';

const rawOrigin = process.argv[2];
if (!rawOrigin) throw new Error('Usage: node scripts/verify-browser-security.mjs <https://origin>');
const origin = new URL(rawOrigin).origin;
const routes = ['/', '/holdings', '/budget', '/settings', '/auth/callback'];
const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (error) => failures.push(`${route}: page error: ${error.message}`));
    page.on('requestfailed', (request) => {
      if (['script', 'stylesheet'].includes(request.resourceType())) {
        failures.push(`${route}: ${request.resourceType()} failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`);
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && /content security policy|refused to/i.test(message.text())) {
        failures.push(`${route}: CSP violation: ${message.text()}`);
      }
    });

    const response = await page.goto(`${origin}${route}`, { waitUntil: 'networkidle', timeout: 30_000 });
    if (!response?.ok()) failures.push(`${route}: navigation returned ${response?.status() ?? 'no response'}`);
    await page.locator('main[role], main.auth-shell, h1').first().waitFor({ state: 'visible', timeout: 10_000 });
    const heading = await page.locator('h1').first().textContent();
    if (!heading?.trim()) failures.push(`${route}: application heading was not rendered`);
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) throw new Error(`Browser security smoke test failed:\n${failures.join('\n')}`);
console.log(`Browser security smoke test passed for ${origin}: ${routes.length} routes loaded at a mobile viewport.`);