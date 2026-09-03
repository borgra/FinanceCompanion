import { describe, expect, it, vi } from 'vitest';
import { verifyWithRetry } from './verify-deployment.mjs';

const html = '<!doctype html><script src="/assets/index-Bb-0b7Gg.js"></script>';
const securityHeaders = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' https://login.microsoftonline.com https://ca-financec-api-dqlb7j7vkqg6w.delightfulmoss-b512a2fe.centralus.azurecontainerapps.io",
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
  'strict-transport-security': 'max-age=31536000',
  'cache-control': 'no-cache',
};

function response(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

function successfulRequest(assetResponse: () => Response, pageHtml = html, assetPath = '/assets/index-Bb-0b7Gg.js') {
  return vi.fn(async (url: string) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/') return response(pageHtml, 200, securityHeaders);
    if (pathname === assetPath) return assetResponse();
    return response('<html></html>', 200, { 'content-type': 'text/html' });
  });
}

describe('deployment verification retries', () => {
  it('refetches the homepage and recovers when a referenced asset returns 404', async () => {
    let assetRequests = 0;
    const requestImpl = successfulRequest(() => {
      assetRequests += 1;
      return assetRequests === 1
        ? response('', 404)
        : response('console.log("ok")', 200, {
            'content-type': 'text/javascript',
            'cache-control': 'public, immutable',
          });
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await verifyWithRetry('https://example.test', {
      requestImpl,
      sleep,
      timeoutMs: 100,
      initialDelayMs: 10,
      maxDelayMs: 10,
      now: () => 0,
    });

    expect(result).toMatchObject({ assetCount: 1, attempts: 2 });
    const homepageUrls = requestImpl.mock.calls
      .map(([url]) => url)
      .filter((url) => new URL(url).pathname === '/');
    expect(homepageUrls).toHaveLength(2);
    expect(homepageUrls[0]).not.toBe(homepageUrls[1]);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('fails clearly after the bounded retry window when the asset remains 404', async () => {
    let elapsed = 0;
    const requestImpl = successfulRequest(() => response('', 404));
    const sleep = vi.fn(async (milliseconds: number) => {
      elapsed += milliseconds;
    });

    await expect(
      verifyWithRetry('https://example.test', {
        requestImpl,
        sleep,
        timeoutMs: 25,
        initialDelayMs: 10,
        maxDelayMs: 10,
        now: () => elapsed,
      }),
    ).rejects.toThrow('Deployment verification failed after 4 attempt(s) over 25ms: /assets/index-Bb-0b7Gg.js returned 404.');

    expect(requestImpl.mock.calls.filter(([url]) => new URL(url).pathname === '/')).toHaveLength(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('exhausts retries with a fixed injected clock instead of waiting forever', async () => {
    const requestImpl = successfulRequest(() => response('', 404));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      verifyWithRetry('https://example.test', {
        requestImpl,
        sleep,
        timeoutMs: 5,
        initialDelayMs: 1,
        maxDelayMs: 1,
        now: () => 0,
      }),
    ).rejects.toThrow(/Deployment verification failed after \d+ attempt\(s\) over 5ms/);

    expect(requestImpl.mock.calls.filter(([url]) => new URL(url).pathname === '/').length).toBeLessThanOrEqual(6);
  });

  it('fails immediately for a non-hashed asset 404 without waiting or retrying', async () => {
    const nonHashedHtml = '<!doctype html><script src="/assets/app.js"></script>';
    const requestImpl = successfulRequest(() => response('', 404), nonHashedHtml, '/assets/app.js');
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      verifyWithRetry('https://example.test', {
        requestImpl,
        sleep,
        timeoutMs: 100,
        initialDelayMs: 10,
        now: () => 0,
      }),
    ).rejects.toThrow('/assets/app.js returned 404.');

    expect(requestImpl.mock.calls.filter(([url]) => new URL(url).pathname === '/')).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails immediately for a security-header failure without waiting or retrying', async () => {
    const requestImpl = vi.fn(async () => response(html));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      verifyWithRetry('https://example.test', {
        requestImpl,
        sleep,
        timeoutMs: 100,
        initialDelayMs: 10,
        now: () => 0,
      }),
    ).rejects.toThrow('x-frame-options expected DENY');

    expect(requestImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
