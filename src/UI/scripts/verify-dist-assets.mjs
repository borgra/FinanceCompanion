import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(uiRoot, 'dist');
const indexPath = path.join(distRoot, 'index.html');
const configPath = path.join(distRoot, 'staticwebapp.config.json');
const expectedCspFragments = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  'https://login.microsoftonline.com',
  'https://ca-financec-api-dqlb7j7vkqg6w.delightfulmoss-b512a2fe.centralus.azurecontainerapps.io',
];

function localAssets(html) {
  const targets = [];
  for (const match of html.matchAll(/<script[^>]+\bsrc=["']([^"']+)["'][^>]*>/gi)) targets.push(match[1]);
  for (const match of html.matchAll(/<link[^>]+\brel=["']stylesheet["'][^>]+\bhref=["']([^"']+)["'][^>]*>/gi)) targets.push(match[1]);
  return [...new Set(targets.filter((target) => target.startsWith('/')))];
}

async function assertFile(target) {
  const relative = decodeURIComponent(target.slice(1));
  const resolved = path.resolve(distRoot, relative);
  if (!resolved.startsWith(`${distRoot}${path.sep}`)) throw new Error(`Asset escapes dist: ${target}`);
  await access(resolved);
  if ((await stat(resolved)).size === 0) throw new Error(`Asset is empty: ${target}`);
}

const html = await readFile(indexPath, 'utf8');
if (html.includes('/src/main.tsx')) throw new Error('Production index.html references Vite development source.');
const assets = localAssets(html);
if (assets.length === 0) throw new Error('No local JavaScript or stylesheet assets were found in index.html.');
await Promise.all(assets.map(assertFile));

const config = JSON.parse(await readFile(configPath, 'utf8'));
const headers = config.globalHeaders ?? {};
for (const fragment of expectedCspFragments) {
  if (!headers['Content-Security-Policy']?.includes(fragment)) throw new Error(`CSP is missing: ${fragment}`);
}
if (headers['Content-Security-Policy'].includes("script-src 'self' 'unsafe-inline'")) throw new Error('CSP must not permit inline scripts.');
if (headers['X-Frame-Options'] !== 'DENY') throw new Error('X-Frame-Options must be DENY.');
for (const feature of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()', 'serial=()', 'bluetooth=()']) {
  if (!headers['Permissions-Policy']?.includes(feature)) throw new Error(`Permissions-Policy is missing ${feature}.`);
}
if (headers['Strict-Transport-Security'] !== 'max-age=31536000') throw new Error('HSTS must use the approved conservative policy.');
if (config.navigationFallback?.rewrite !== '/index.html' || !config.navigationFallback.exclude?.includes('/assets/*')) throw new Error('SPA fallback must rewrite to index.html and exclude immutable assets.');
const assetRoute = config.routes?.find((route) => route.route === '/assets/*');
if (assetRoute?.headers?.['Cache-Control'] !== 'public, max-age=31536000, immutable') throw new Error('Assets must have an immutable cache policy.');
if (headers['Cache-Control'] !== 'no-cache, max-age=0, must-revalidate') throw new Error('The HTML shell and navigation fallback must revalidate.');

console.log(`Verified ${assets.length} local HTML-referenced asset(s) and Static Web Apps security configuration.`);