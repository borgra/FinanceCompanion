import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const requiredCsp = ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "script-src 'self'", 'https://login.microsoftonline.com', 'https://ca-financec-api-dqlb7j7vkqg6w.delightfulmoss-b512a2fe.centralus.azurecontainerapps.io'];
const requiredHeaders = { 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' };
const spaRoutes = ['/holdings', '/budget', '/settings', '/auth/callback'];
const defaultRetryOptions = {
  timeoutMs: 300_000,
  initialDelayMs: 5_000,
  maxDelayMs: 30_000,
  requestTimeoutMs: 30_000,
};
const hashedViteAssetPattern = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+(?:[?#].*)?$/i;

export class AssetNotFoundError extends Error {
  constructor(asset) {
    super(asset + ' returned 404.');
    this.name = 'AssetNotFoundError';
    this.asset = asset;
  }
}

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const isHashedViteAsset = (asset) => hashedViteAssetPattern.test(asset);

export function assetsFromHtml(html) {
  const values = [];
  for (const match of html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["'](\/assets\/[^"']+)["'][^>]*>/gi)) values.push(match[1]);
  return [...new Set(values)];
}

export async function verifyDeployment(rawOrigin, { requestImpl, now = Date.now, requestTimeoutMs = defaultRetryOptions.requestTimeoutMs, verificationNonce = '' } = {}) {
  const origin = new URL(rawOrigin).origin;
  const request = (pathname) => (requestImpl ?? fetch)(origin + pathname, {
    headers: { 'cache-control': 'no-cache' },
    redirect: 'manual',
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  const root = await request('/?release-verification=' + encodeURIComponent(String(now()) + '-' + verificationNonce));
  if (!root.ok) throw new Error('Homepage returned ' + root.status + '.');
  const rootHeaders = Object.fromEntries(root.headers.entries());
  for (const [name, value] of Object.entries(requiredHeaders)) {
    if (rootHeaders[name] !== value) throw new Error(name + ' expected ' + value + ', got ' + (rootHeaders[name] ?? 'missing') + '.');
  }
  const csp = rootHeaders['content-security-policy'] ?? '';
  for (const fragment of requiredCsp) if (!csp.includes(fragment)) throw new Error('CSP is missing: ' + fragment);
  if (csp.includes("script-src 'self' 'unsafe-inline'") || csp.includes('unsafe-eval')) throw new Error('CSP permits unsafe script execution.');
  for (const feature of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()', 'serial=()', 'bluetooth=()']) {
    if (!rootHeaders['permissions-policy']?.includes(feature)) throw new Error('Permissions-Policy is missing ' + feature + '.');
  }
  const hstsAge = Number((rootHeaders['strict-transport-security'] ?? '').match(/max-age=(\d+)/)?.[1] ?? 0);
  if (hstsAge < 31_536_000) throw new Error('HSTS max-age is less than one year.');
  if (!rootHeaders['cache-control']?.includes('no-cache')) throw new Error('HTML shell is not revalidated.');

  const html = await root.text();
  const assets = assetsFromHtml(html);
  if (assets.length === 0) throw new Error('No hashed assets were found in deployed HTML.');
  for (const asset of assets) {
    const response = await request(asset);
    if (response.status === 404) {
      if (isHashedViteAsset(asset)) throw new AssetNotFoundError(asset);
      throw new Error(asset + ' returned 404.');
    }
    if (!response.ok) throw new Error(asset + ' returned ' + response.status + '.');
    const type = response.headers.get('content-type') ?? '';
    if (!/(javascript|css)/i.test(type)) throw new Error(asset + ' returned unexpected content type ' + type + '.');
    if ((await response.text()).length === 0) throw new Error(asset + ' is empty.');
    if (!response.headers.get('cache-control')?.includes('immutable')) throw new Error(asset + ' is not immutable.');
  }

  for (const route of spaRoutes) {
    const response = await request(route);
    if (!response.ok || !/(text\/html)/i.test(response.headers.get('content-type') ?? '')) throw new Error(route + ' did not resolve to the SPA shell.');
  }

  return { origin, assetCount: assets.length };
}

export async function verifyWithRetry(rawOrigin, options = {}) {
  const timeoutMs = positiveInteger(options.timeoutMs, defaultRetryOptions.timeoutMs);
  const initialDelayMs = positiveInteger(options.initialDelayMs, defaultRetryOptions.initialDelayMs);
  const maxDelayMs = positiveInteger(options.maxDelayMs, defaultRetryOptions.maxDelayMs);
  const clock = options.now ?? Date.now;
  const wait = options.sleep ?? sleep;
  const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
  const startedAt = monotonicNow();
  let scheduledWaitMs = 0;
  let attempt = 0;
  let delayMs = initialDelayMs;

  while (true) {
    attempt += 1;
    try {
      const result = await verifyDeployment(rawOrigin, {
        requestImpl: options.requestImpl,
        now: clock,
        requestTimeoutMs: positiveInteger(options.requestTimeoutMs, defaultRetryOptions.requestTimeoutMs),
        verificationNonce: attempt,
      });
      return { ...result, attempts: attempt };
    } catch (error) {
      if (!(error instanceof AssetNotFoundError)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const elapsedMs = Math.max(scheduledWaitMs, monotonicNow() - startedAt);
      const remainingMs = timeoutMs - elapsedMs;
      if (remainingMs <= 0) {
        throw new Error('Deployment verification failed after ' + attempt + ' attempt(s) over ' + timeoutMs + 'ms: ' + message, { cause: error });
      }
      const waitMs = Math.min(delayMs, remainingMs);
      console.warn('Deployment verification attempt ' + attempt + ' failed: ' + message + '. Retrying in ' + waitMs + 'ms.');
      await wait(waitMs);
      scheduledWaitMs += waitMs;
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
}

const rawOrigin = process.argv[2];
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!rawOrigin) throw new Error('Usage: node scripts/verify-deployment.mjs <https://origin>');
  const result = await verifyWithRetry(rawOrigin, {
    timeoutMs: positiveInteger(process.env.DEPLOYMENT_VERIFY_TIMEOUT_MS, defaultRetryOptions.timeoutMs),
    initialDelayMs: positiveInteger(process.env.DEPLOYMENT_VERIFY_INITIAL_DELAY_MS, defaultRetryOptions.initialDelayMs),
    maxDelayMs: positiveInteger(process.env.DEPLOYMENT_VERIFY_MAX_DELAY_MS, defaultRetryOptions.maxDelayMs),
    requestTimeoutMs: positiveInteger(process.env.DEPLOYMENT_VERIFY_REQUEST_TIMEOUT_MS, defaultRetryOptions.requestTimeoutMs),
  });
  const summary = 'Security deployment verification passed for ' + result.origin + ': ' + result.assetCount + ' assets and four SPA routes checked.\n';
  console.log(summary.trim());
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
