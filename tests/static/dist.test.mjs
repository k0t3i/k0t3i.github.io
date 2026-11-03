import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DIST_ROOT, distFiles } from '../helpers/pages.mjs';

// These tests run on the output of `npm run build`.
const at = (...p) => join(DIST_ROOT, ...p);
const htmlFiles = () => distFiles().filter((f) => f.endsWith('.html'));

/** Inline executable <script> bodies (application/ld+json is data, not code). */
function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs) || /type\s*=\s*["']?application\/ld\+json/i.test(attrs)) continue;
    out.push(m[2]);
  }
  return out;
}

test('dist pages exist', () => {
  for (const f of ['index.html', 'en/index.html', '404.html']) assert.ok(existsSync(at(f)), `dist/${f} is missing`);
  assert.ok(existsSync(at('.nojekyll')), 'dist/.nojekyll is missing');
  assert.equal(statSync(at('.nojekyll')).size, 0);
  assert.ok(!existsSync(at('404')), 'dist/404/ must not exist');
});

test('no inline style in prerendered html', () => {
  const files = htmlFiles();
  assert.ok(files.length >= 3);
  for (const f of files) {
    const html = readFileSync(at(f), 'utf8');
    assert.doesNotMatch(html, /\sstyle\s*=/i, `${f} has a style attribute`);
    assert.doesNotMatch(html, /<style[\s>]/i, `${f} has a <style> block`);
  }
});

test('CSP is first after charset and hashes every inline script', () => {
  for (const f of htmlFiles()) {
    const html = readFileSync(at(f), 'utf8');
    const m = html.match(/<meta charset="utf-8"\s*\/?>\s*<meta http-equiv="Content-Security-Policy" content="([^"]*)">/i);
    assert.ok(m, `${f}: the CSP meta does not directly follow <meta charset>`);
    const csp = m[1];
    assert.match(csp, /^default-src 'none'; script-src 'self'/);
    assert.match(csp, /; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests$/);
    assert.equal(html.match(/http-equiv="Content-Security-Policy"/gi).length, 1, `${f}: more than one CSP`);
    for (const body of inlineScripts(html)) {
      const hash = createHash('sha256').update(body, 'utf8').digest('base64');
      assert.ok(csp.includes(`'sha256-${hash}'`), `${f}: inline script without hash in the CSP`);
    }
  }
});

test('no kit-urgence folder in dist', () => {
  assert.ok(!existsSync(at('kit-urgence')));
  assert.ok(!distFiles().some((f) => f.startsWith('kit-urgence/')));
});
