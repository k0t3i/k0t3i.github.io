import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DIST_ROOT } from '../helpers/pages.mjs';

// The JavaScript of the page, gzip -9, under 60 KiB (spec section 5: the weight stays compatible with
// the Lighthouse scores). A minimal guard: Task 12 sets the full budget.
const JS_BUDGET = 61_440;

test('the JavaScript of the page stays under its budget', () => {
  const assets = join(DIST_ROOT, 'assets');
  const js = readdirSync(assets).filter((f) => f.endsWith('.js'));
  assert.ok(js.length > 0, 'no JavaScript built');
  const total = js.reduce((sum, f) => sum + gzipSync(readFileSync(join(assets, f)), { level: 9 }).length, 0);
  assert.ok(total <= JS_BUDGET, `${total} B gzip -9 > ${JS_BUDGET} B`);
});
