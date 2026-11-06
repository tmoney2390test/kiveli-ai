import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { ASSET_BUDGET, INITIAL_SCRIPT_BUDGET, inspectWebPerformance } from './check-web-performance-budget.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kivelli-web-budget-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.match(root, /kivelli-web-budget-/);
    rmSync(root, { recursive: true, force: true });
  });
  writeFileSync(join(root, 'shared.js'), 'const shared = true;');
  for (const route of ['index.html', 'home.html', 'explore.html']) writeFileSync(join(root, route), '<script src="/shared.js"></script>');
  return root;
}

test('counts shared chunks once per page and checks Home and Explore as well as entry', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, 'home.html'), '<script src="/shared.js"></script><script src="/shared.js"></script>');
  const report = inspectWebPerformance(root);
  assert.equal(report.withinBudget, true);
  assert.equal(report.pages.length, 3);
  assert.equal(report.pages[1].scriptCount, 1);
  assert.equal(report.pages[0].gzipBytes, report.pages[1].gzipBytes);
});

test('fails incomplete exports instead of silently undercounting missing chunks', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, 'explore.html'), '<script src="/missing.js"></script>');
  assert.throws(() => inspectWebPerformance(root), /missing/);
  writeFileSync(join(root, 'explore.html'), '<script src="https://cdn.invalid/app.js"></script>');
  assert.throws(() => inspectWebPerformance(root), /unmeasured external/);
});

test('fails a Home-only regression even when the landing page still fits', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, 'large.js'), randomBytes(Math.ceil(INITIAL_SCRIPT_BUDGET) + 4096));
  writeFileSync(join(root, 'home.html'), '<script src="/shared.js"></script><script src="/large.js"></script>');
  const report = inspectWebPerformance(root);
  assert.equal(report.pages[0].withinBudget, true);
  assert.equal(report.pages[1].withinBudget, false);
  assert.equal(report.withinBudget, false);
});

test('continues to reject oversized assets', (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'oversized.png'), Buffer.alloc(ASSET_BUDGET + 1));
  assert.equal(inspectWebPerformance(root).withinBudget, false);
});
