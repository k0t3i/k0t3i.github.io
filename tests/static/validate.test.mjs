import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PUBLISHED_ROOT } from '../helpers/pages.mjs';

// scripts/validate.mjs validates the build folder the other scripts use: DIST_DIR, else dist/.

test('validate reads DIST_DIR, as the build and the server do', (t) => {
  const empty = mkdtempSync(join(tmpdir(), 'k0t3i-validate-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, [join(PUBLISHED_ROOT, 'scripts', 'validate.mjs')], { encoding: 'utf8', env: { ...process.env, DIST_DIR: empty }, timeout: 60_000 });
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /contains no HTML page/);
  assert.ok(r.stderr.includes(empty), r.stderr);
});
