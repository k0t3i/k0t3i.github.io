import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DIST_ROOT, PUBLISHED_ROOT, distFiles, trackedFiles } from '../helpers/pages.mjs';

const at = (...p) => join(PUBLISHED_ROOT, ...p);
const read = (f) => readFileSync(at(f), 'utf8');
// Tracked and built files are text or binary assets; binary ones are skipped by the scans below.
const BINARY = /\.(woff2?|avif|webp|jpe?g|png|ico|gif|pdf|mp4)$/i;
/** Text files to scan: the tracked sources and the built dist/, as { name, path } pairs. */
const textFiles = () => [
  ...trackedFiles().filter((f) => !BINARY.test(f) && existsSync(at(f))).map((f) => ({ name: f, path: at(f) })),
  ...distFiles().filter((f) => !BINARY.test(f)).map((f) => ({ name: `dist/${f}`, path: join(DIST_ROOT, f) })),
];
const textOf = (file) => readFileSync(file.path, 'utf8');

test('nojekyll exists and is empty', () => {
  assert.ok(existsSync(at('public', '.nojekyll')), 'public/.nojekyll is missing');
  assert.equal(statSync(at('public', '.nojekyll')).size, 0);
});

test('no kit-urgence folder in the sources', () => {
  assert.ok(!existsSync(at('kit-urgence')));
  assert.ok(!existsSync(at('public', 'kit-urgence')));
});

test('private files are not tracked', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: PUBLISHED_ROOT, encoding: 'utf8' }).split('\n');
  assert.ok(!files.includes('CLAUDE.md'));
  assert.ok(!files.some((f) => f.startsWith('specs/')));
  assert.ok(!files.some((f) => f.endsWith('private-names.local.txt')));
});

test('old Vue build is gone', () => {
  const old = trackedFiles().filter((f) => /^assets\/(js|css)\/(app|chunk-vendors)\./.test(f));
  assert.deepEqual(old, []);
});

test('no AI attribution', () => {
  const re = /co-authored-by|generated with|claude|anthropic|chatgpt|copilot/i;
  // This file holds the regex itself.
  const skip = new Set(['tests/static/repo.test.mjs']);
  const hits = textFiles().filter((f) => !skip.has(f.name) && re.test(textOf(f))).map((f) => f.name);
  assert.deepEqual(hits, [], 'AI attribution found in files');
  const log = execFileSync('git', ['log', 'master..HEAD', '--format=%B'], {
    cwd: PUBLISHED_ROOT,
    encoding: 'utf8',
  });
  assert.ok(!re.test(log), 'AI attribution found in a commit message');
});

test('no private project names', (t) => {
  const list = at('private-names.local.txt');
  if (!existsSync(list)) {
    console.warn('WARNING: private-names.local.txt is missing, private names are not checked');
    return t.skip('private-names.local.txt missing');
  }
  const names = read('private-names.local.txt')
    .split(/\r?\n/)
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  const hits = [];
  for (const f of textFiles()) {
    const text = textOf(f).toLowerCase();
    for (const n of names) if (text.includes(n) || f.name.toLowerCase().includes(n)) hits.push(`${f.name}: ${n}`);
  }
  assert.deepEqual(hits, []);
});

test('surname only inside the e-mail', (t) => {
  const site = 'src/content/site.json';
  if (!existsSync(at(site))) return t.skip(`${site} not created yet`);
  const { email } = JSON.parse(read(site));
  assert.ok(email, `${site} has no "email" field`);
  const hits = textFiles().filter((f) => /lowinsky/i.test(textOf(f).split(email).join(''))).map((f) => f.name);
  assert.deepEqual(hits, []);
});
