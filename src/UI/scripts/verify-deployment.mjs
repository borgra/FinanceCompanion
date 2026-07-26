import { appendFile } from 'node:fs/promises';

const rawOrigin = process.argv[2];
if (!rawOrigin) throw new Error('Usage: node scripts/verify-deployment.mjs <https://origin>');
const origin = new URL(rawOrigin).origin;
const requiredCsp = ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "script-src 'self'", 'https://login.microsoftonline.com', 'https://ca-financec-api-dqlb7j7vkqg6w.delightfulmoss-b512a2fe.centralus.azurecontainerapps.io'];
const requiredHeaders = { 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' };

async function request(pathname) {
  return fetch(`${origin}${pathname}`, { headers: { 'cache-control': 'no-cache' }, redirect: 'manual' });
}

function assetsFromHtml(html) {
  const values = [];
  for (const match of html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["'](\/assets\/[^"']+)["'][^>]*>/gi)) values.push(match[1]);
  return [...new Set(values)];
}

const root = await request(`/?release-verification=${Date.now()}`);
if (!root.ok) throw new Error(`Homepage returned ${root.status}.`);
const rootHeaders = Object.fromEntries(root.headers.entries());
for (const [name, value] of Object.entries(requiredHeaders)) if (rootHeaders[name] !== value) throw new Error(`${name} expected ${value}, got ${rootHeaders[name] ?? 'missing'}.`);
const csp = rootHeaders['content-security-policy'] ?? '';
for (const fragment of requiredCsp) if (!csp.includes(fragment)) throw new Error(`CSP is missing: ${fragment}`);
if (csp.includes("script-src 'self' 'unsafe-inline'") || csp.includes('unsafe-eval')) throw new Error('CSP permits unsafe script execution.');
for (const feature of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()', 'serial=()', 'bluetooth=()']) {
  if (!rootHeaders['permissions-policy']?.includes(feature)) throw new Error(`Permissions-Policy is missing ${feature}.`);
}
const hstsAge = Number((rootHeaders['strict-transport-security'] ?? '').match(/max-age=(\d+)/)?.[1] ?? 0);
if (hstsAge < 31_536_000) throw new Error('HSTS max-age is less than one year.');
if (!rootHeaders['cache-control']?.includes('no-cache')) throw new Error('HTML shell is not revalidated.');

const html = await root.text();
const assets = assetsFromHtml(html);
if (assets.length === 0) throw new Error('No hashed assets were found in deployed HTML.');
for (const asset of assets) {
  const response = await request(asset);
  if (!response.ok) throw new Error(`${asset} returned ${response.status}.`);
  const type = response.headers.get('content-type') ?? '';
  if (!/(javascript|css)/i.test(type)) throw new Error(`${asset} returned unexpected content type ${type}.`);
  if ((await response.text()).length === 0) throw new Error(`${asset} is empty.`);
  if (!response.headers.get('cache-control')?.includes('immutable')) throw new Error(`${asset} is not immutable.`);
}

for (const route of ['/holdings', '/budget', '/settings', '/auth/callback']) {
  const response = await request(route);
  if (!response.ok || !/(text\/html)/i.test(response.headers.get('content-type') ?? '')) throw new Error(`${route} did not resolve to the SPA shell.`);
}

const summary = `Security deployment verification passed for ${origin}: ${assets.length} assets and four SPA routes checked.\n`;
console.log(summary.trim());
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);