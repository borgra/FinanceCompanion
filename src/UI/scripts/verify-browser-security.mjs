import { chromium } from '@playwright/test';

const rawOrigin = process.argv[2];
if (!rawOrigin) throw new Error('Usage: node scripts/verify-browser-security.mjs <https://origin>');
const origin = new URL(rawOrigin).origin;
const routes = ['/', '/holdings', '/budget', '/settings', '/auth/callback'];
const navigationAttempts = 3;
const navigationTimeoutMs = 30_000;
const applicationReadyTimeoutMs = 10_000;
const retryDelayMs = 2_000;
const browser = await chromium.launch({ headless: true });
const failures = [];
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const errorMessage = (error) => error instanceof Error ? error.message : String(error);

try {
  for (const route of routes) {
    let routePassed = false;

    for (let attempt = 1; attempt <= navigationAttempts; attempt += 1) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const attemptFailures = [];
      page.on('pageerror', (error) => attemptFailures.push(`${route}: page error: ${error.message}`));
      page.on('requestfailed', (request) => {
        if (['script', 'stylesheet'].includes(request.resourceType())) {
          attemptFailures.push(`${route}: ${request.resourceType()} failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`);
        }
      });
      page.on('console', (message) => {
        if (message.type() === 'error' && /content security policy|refused to/i.test(message.text())) {
          attemptFailures.push(`${route}: CSP violation: ${message.text()}`);
        }
      });

      try {
        const response = await page.goto(`${origin}${route}`, {
          waitUntil: 'domcontentloaded',
          timeout: navigationTimeoutMs,
        });
        if (!response?.ok()) throw new Error(`navigation returned ${response?.status() ?? 'no response'}`);

        const heading = page.locator('h1').first();
        await heading.waitFor({ state: 'visible', timeout: applicationReadyTimeoutMs });
        if (!(await heading.textContent())?.trim()) throw new Error('application heading was not rendered');

        failures.push(...attemptFailures);
        routePassed = true;
        break;
      } catch (error) {
        const attemptFailure = `${route}: attempt ${attempt}/${navigationAttempts} failed: ${errorMessage(error)}`;
        if (attempt === navigationAttempts) {
          failures.push(attemptFailure, ...attemptFailures);
        } else {
          console.warn(`${attemptFailure}; retrying after ${retryDelayMs * attempt}ms.`);
        }
      } finally {
        await page.close();
      }

      if (!routePassed && attempt < navigationAttempts) await delay(retryDelayMs * attempt);
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) throw new Error(`Browser security smoke test failed:\n${failures.join('\n')}`);
console.log(`Browser security smoke test passed for ${origin}: ${routes.length} routes loaded at a mobile viewport.`);