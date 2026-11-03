import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLISHED_ROOT, trackedFiles, publishedFiles } from '../helpers/pages.mjs';

const at = (...p) => join(PUBLISHED_ROOT, ...p);
const read = (f) => readFileSync(at(f), 'utf8');
// Tracked files are text or binary assets; binary ones are skipped by the scans below.
const BINARY = /\.(woff2?|avif|webp|jpe?g|png|ico|gif|pdf|mp4)$/i;
const textFiles = () => trackedFiles().filter((f) => !BINARY.test(f) && existsSync(at(f)));

test('nojekyll exists and is empty', () => {
  assert.ok(existsSync(at('.nojekyll')), '.nojekyll is missing');
  assert.equal(statSync(at('.nojekyll')).size, 0);
});

test('no kit-urgence folder at root', () => {
  assert.ok(!existsSync(at('kit-urgence')));
});

test('private files are not tracked', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: PUBLISHED_ROOT, encoding: 'utf8' }).split('\n');
  assert.ok(!files.includes('CLAUDE.md'));
  assert.ok(!files.some((f) => f.startsWith('specs/')));
  assert.ok(!files.some((f) => f.endsWith('private-names.local.txt')));
});

test('old Vue build is gone', () => {
  const old = publishedFiles().filter((f) => /assets\/(js|css)\/(app|chunk-vendors)\./.test(f));
  assert.deepEqual(old, []);
});

test('no AI attribution', () => {
  const re = /co-authored-by|generated with|claude|anthropic|chatgpt|copilot/i;
  // This file holds the regex itself. dev/package-lock.json is third-party
  // generated content whose package names may match; it is not authored text.
  const skip = new Set(['dev/tests/static/repo.test.mjs', 'dev/package-lock.json']);
  const hits = textFiles().filter((f) => !skip.has(f) && re.test(read(f)));
  assert.deepEqual(hits, [], 'AI attribution found in files');
  const log = execFileSync('git', ['log', 'master..HEAD', '--format=%B'], {
    cwd: PUBLISHED_ROOT,
    encoding: 'utf8',
  });
  assert.ok(!re.test(log), 'AI attribution found in a commit message');
});

test('no private project names', (t) => {
  const list = at('dev', 'private-names.local.txt');
  if (!existsSync(list)) {
    console.warn('WARNING: dev/private-names.local.txt is missing, private names are not checked');
    return t.skip('private-names.local.txt missing');
  }
  const names = read('dev/private-names.local.txt')
    .split(/\r?\n/)
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  const hits = [];
  for (const f of textFiles()) {
    const text = read(f).toLowerCase();
    for (const n of names) if (text.includes(n) || f.toLowerCase().includes(n)) hits.push(`${f}: ${n}`);
  }
  assert.deepEqual(hits, []);
});

test('surname only inside the e-mail', (t) => {
  if (!existsSync(at('dev', 'site.json'))) return t.skip('dev/site.json not created yet');
  const { email } = JSON.parse(read('dev/site.json'));
  assert.ok(email, 'dev/site.json has no "email" field');
  const hits = textFiles().filter((f) => /lowinsky/i.test(read(f).split(email).join('')));
  assert.deepEqual(hits, []);
});
