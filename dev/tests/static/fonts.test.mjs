import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLISHED_ROOT } from '../helpers/pages.mjs';

const dir = (f) => join(PUBLISHED_ROOT, 'assets', 'fonts', f);
const WOFF2 = ['hanken-grotesk.woff2', 'jetbrains-mono.woff2'];
const OFL = ['OFL-HankenGrotesk.txt', 'OFL-JetBrainsMono.txt'];

test('woff2 files exist with OFL licences', () => {
  for (const f of [...WOFF2, ...OFL]) assert.ok(existsSync(dir(f)), `${f} is missing`);
});

test('each woff2 <= 30 KB, total <= 55 KB', () => {
  const sizes = WOFF2.map((f) => statSync(dir(f)).size);
  sizes.forEach((s, i) => assert.ok(s <= 30 * 1024, `${WOFF2[i]} is ${s} bytes`));
  const total = sizes.reduce((a, b) => a + b, 0);
  assert.ok(total <= 55 * 1024, `total is ${total} bytes`);
});

test('woff2 signature', () => {
  for (const f of WOFF2) assert.equal(readFileSync(dir(f)).subarray(0, 4).toString('latin1'), 'wOF2');
});
