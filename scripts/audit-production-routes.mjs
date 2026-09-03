import { readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultOrigin = 'https://kivelli.app';
const defaultDist = resolve('apps/together/dist');

export function routeFromHtmlPath(distDirectory, filePath) {
  let route = relative(distDirectory, filePath).split(sep).join('/').replace(/\.html$/, '');
  if (route === 'index') return '/';
  if (route.startsWith('+') || route.startsWith('_') || route.includes('[')) return null;
  route = route.replace(/^\(tabs\)\//, '');
  return `/${route}`.replace(/\/{2,}/g, '/');
}

export function criticalAssetPaths(html) {
  const paths = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const path = match[1];
    if (path?.startsWith('/_expo/static/') && /\.(?:js|css)(?:\?|$)/.test(path)) paths.add(path);
  }
  return [...paths];
}

export function routeResponseIssue(response,requestedRoute){
  if(!response.ok)return`HTTP ${response.status}`;
  const requested=normalizeAuditPath(requestedRoute),received=normalizeAuditPath(new URL(response.url).pathname);
  if(response.redirected||received!==requested)return`unexpected navigation to ${received}`;
  const contentType=response.headers.get('content-type')??'';
  if(!contentType.includes('text/html'))return`expected HTML, received ${contentType||'unknown content type'}`;
  return null;
}

async function collectHtmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectHtmlFiles(path));
    else if (entry.isFile() && extname(entry.name) === '.html') files.push(path);
  }
  return files;
}

async function fetchWithTimeout(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'user-agent': 'KivelleProductionAudit/1.0' } });
  } finally {
    clearTimeout(timer);
  }
}

async function pooled(items, concurrency, action) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await action(items[index], index);
    }
  }));
  return results;
}

async function main() {
  const originArgument = process.argv.find((value) => value.startsWith('--origin='));
  const distArgument = process.argv.find((value) => value.startsWith('--dist='));
  const origin = new URL(originArgument?.slice('--origin='.length) || defaultOrigin).origin;
  const distDirectory = resolve(distArgument?.slice('--dist='.length) || defaultDist);
  const htmlFiles = await collectHtmlFiles(distDirectory);
  const routes = [...new Set(htmlFiles.map((file) => routeFromHtmlPath(distDirectory, file)).filter(Boolean))].sort();
  const localHtml = await Promise.all(htmlFiles.map((file) => readFile(file, 'utf8')));
  const assets = [...new Set(localHtml.flatMap(criticalAssetPaths))].sort();
  const failures = [];

  await pooled(routes, 12, async (route) => {
    try {
      const response = await fetchWithTimeout(`${origin}${route}`);
      const issue=routeResponseIssue(response,route);
      const body = await response.text();
      if(issue)failures.push(`${route}: ${issue}`);
      else if (!body.includes('id="root"') || !body.includes('/_expo/static/js/web/')) failures.push(`${route}: incomplete application shell`);
    } catch (error) {
      failures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  await pooled(assets, 12, async (asset) => {
    try {
      const response = await fetchWithTimeout(`${origin}${asset}`);
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) failures.push(`${asset}: HTTP ${response.status}`);
      else if (asset.includes('.js') && !/javascript|ecmascript/.test(contentType)) failures.push(`${asset}: expected JavaScript, received ${contentType || 'unknown content type'}`);
      else if (asset.includes('.css') && !contentType.includes('text/css')) failures.push(`${asset}: expected CSS, received ${contentType || 'unknown content type'}`);
    } catch (error) {
      failures.push(`${asset}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  if (failures.length) {
    console.error(`Production route audit failed (${failures.length}):\n${failures.join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Production route audit passed: ${routes.length} page routes and ${assets.length} critical assets at ${origin}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

function normalizeAuditPath(value){const path=value.split(/[?#]/,1)[0]||'/';return path.length>1?path.replace(/\/+$/,''):path;}
