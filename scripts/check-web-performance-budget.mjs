import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const INITIAL_SCRIPT_BUDGET = 1.05 * 1024 * 1024;
export const ASSET_BUDGET = 2.25 * 1024 * 1024;
export const STARTUP_ROUTES = ['index.html', 'home.html', 'explore.html'];

/** Check actual entry scripts, including shared chunks, once each per route. */
export function inspectWebPerformance(root, routes = STARTUP_ROUTES) {
  const gzipSizes = new Map();
  const pages = routes.map((route) => {
    const indexPath = [join(root, route), join(root, '(tabs)', route)].find(existsSync);
    if (!indexPath) throw new Error(`The exported ${route} was not found.`);
    const html = readFileSync(indexPath, 'utf8');
    const scripts = [...new Set([...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((match) => {
      if (/^(?:[a-z]+:)?\/\//i.test(match[1])) throw new Error(`${route} has an unmeasured external script.`);
      const file = resolve(root, decodeURIComponent(match[1].split(/[?#]/, 1)[0].replace(/^\//, '')));
      const local = relative(root, file);
      if (local.startsWith('..') || isAbsolute(local) || !existsSync(file)) throw new Error(`${route} references a missing or nonlocal script: ${match[1]}`);
      return file;
    }))];
    if (!scripts.length) throw new Error(`No initial web scripts were found in ${route}.`);
    let bytes = 0, gzipBytes = 0;
    for (const file of scripts) {
      bytes += statSync(file).size;
      if (!gzipSizes.has(file)) gzipSizes.set(file, gzipSync(readFileSync(file), { level: 9 }).byteLength);
      gzipBytes += gzipSizes.get(file);
    }
    return { route, bytes, gzipBytes, scriptCount: scripts.length, withinBudget: gzipBytes <= INITIAL_SCRIPT_BUDGET };
  });
  const assetRoot = join(root, 'assets');
  const largestAsset = existsSync(assetRoot) ? readdirSync(assetRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => { const file = join(entry.parentPath, entry.name); return { file, bytes: statSync(file).size }; })
    .sort((left, right) => right.bytes - left.bytes)[0] : undefined;
  return { pages, largestAsset, withinBudget: pages.every((page) => page.withinBudget) && (!largestAsset || largestAsset.bytes <= ASSET_BUDGET) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const root = resolve(repositoryRoot, process.argv[2] || 'apps/together/dist');
  try {
    const report = inspectWebPerformance(root);
    for (const page of report.pages) {
      console.log(`${page.route}: ${(page.bytes / 1024 / 1024).toFixed(2)} MiB raw / ${(page.gzipBytes / 1024 / 1024).toFixed(3)} MiB gzip across ${page.scriptCount} scripts${page.withinBudget ? '' : ' — OVER BUDGET'}`);
    }
    if (report.largestAsset) console.log(`Largest asset: ${(report.largestAsset.bytes / 1024 / 1024).toFixed(2)} MiB · ${relative(root, report.largestAsset.file)}`);
    if (!report.withinBudget) {
      console.error(`Web budget exceeded: initial JS limit ${(INITIAL_SCRIPT_BUDGET / 1024 / 1024).toFixed(2)} MiB gzip per checked route; asset limit ${(ASSET_BUDGET / 1024 / 1024).toFixed(2)} MiB.`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
