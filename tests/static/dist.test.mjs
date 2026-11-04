import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inlineScriptBodies } from '../../scripts/postbuild.mjs';
import { DIST_ROOT, distFiles } from '../helpers/pages.mjs';

// These tests run on the output of `npm run build`.
const at = (...p) => join(DIST_ROOT, ...p);
const htmlFiles = () => distFiles().filter((f) => f.endsWith('.html'));

test('dist pages exist', () => {
  for (const f of ['index.html', 'en/index.html', '404.html']) assert.ok(existsSync(at(f)), `dist/${f} is missing`);
  assert.ok(existsSync(at('.nojekyll')), 'dist/.nojekyll is missing');
  assert.equal(statSync(at('.nojekyll')).size, 0);
  assert.ok(!existsSync(at('404')), 'dist/404/ must not exist');
});

test('robots, sitemap and share images are published', () => {
  for (const f of ['robots.txt', 'sitemap.xml', 'img/og-fr.jpg', 'img/og-en.jpg']) assert.ok(existsSync(at(f)), `dist/${f} is missing`);
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
    for (const body of inlineScriptBodies(html)) {
      const hash = createHash('sha256').update(body, 'utf8').digest('base64');
      assert.ok(csp.includes(`'sha256-${hash}'`), `${f}: inline script without hash in the CSP`);
    }
  }
});

test('the theme script follows the CSP on every page, then the redirect on / only, both hashed', () => {
  const files = htmlFiles();
  assert.deepEqual([...files].sort(), ['404.html', 'en/index.html', 'index.html']);
  for (const f of files) {
    const html = readFileSync(at(f), 'utf8');
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)[1];
    const after = html.slice(html.indexOf('<meta http-equiv="Content-Security-Policy"'));
    const critical = [...after.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(([, attrs]) => /\bdata-critical\b/.test(attrs));
    const expected = f === 'index.html' ? ['theme', 'redirect'] : ['theme'];
    assert.deepEqual(critical.map(([, attrs]) => attrs.match(/data-critical="([^"]*)"/)?.[1]), expected, `${f}: critical scripts`);
    // Right after the CSP, one after the other, before anything else.
    const head = critical.map(([tag]) => tag).join('');
    assert.ok(after.replace(/^<meta http-equiv="Content-Security-Policy"[^>]*>/, '').startsWith(head), `${f}: not right after the CSP`);
    const [theme, redirect] = critical.map(([, , body]) => body);
    assert.match(theme, /k0t3i\.theme/);
    assert.match(theme, /prefers-color-scheme: dark/);
    if (redirect !== undefined) assert.match(redirect, /k0t3i\.lang/);
    for (const body of [theme, redirect].filter((b) => b !== undefined)) {
      const hash = createHash('sha256').update(body, 'utf8').digest('base64');
      assert.ok(csp.includes(`'sha256-${hash}'`), `${f}: critical script without its hash`);
    }
  }
});

test('the board follows the device scheme before any choice', () => {
  for (const f of htmlFiles()) {
    const html = readFileSync(at(f), 'utf8');
    assert.match(html, /<meta name="color-scheme" content="light dark">/, `${f}: color-scheme`);
    assert.match(html, /<meta name="theme-color" content="#eceae3" media="\(prefers-color-scheme: light\)">/, `${f}: light theme-color`);
    assert.match(html, /<meta name="theme-color" content="#08090a" media="\(prefers-color-scheme: dark\)">/, `${f}: dark theme-color`);
    assert.doesNotMatch(html, /<html[^>]*data-theme/, `${f}: the prerender sets no theme`);
  }
});

test('the backdrop colour is declared on ::backdrop itself', () => {
  // Safari 17.0 to 17.3 does not inherit custom properties into ::backdrop.
  const css = distFiles().filter((f) => f.endsWith('.css')).map((f) => readFileSync(at(f), 'utf8')).join('');
  assert.match(css, /(^|[,}])::backdrop\{[^}]*--backdrop:/);
  assert.match(css, /\.sheet::backdrop\{[^}]*background:var\(--backdrop\)/);
});

test('no kit-urgence folder in dist', () => {
  assert.ok(!existsSync(at('kit-urgence')));
  assert.ok(!distFiles().some((f) => f.startsWith('kit-urgence/')));
});

test('one build date: the client bundle and the lastmod of the sitemap', () => {
  const scripts = distFiles().filter((f) => /^assets\/[^/]+\.js$/.test(f));
  const dates = new Set(scripts.flatMap((f) => [...readFileSync(at(f), 'utf8').matchAll(/["'`](\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)["'`]/g)].map(([, d]) => d)));
  assert.equal(dates.size, 1, `the build dates of the client bundle: ${[...dates].join(', ')}`);
  const [date] = dates;
  const sitemap = readFileSync(at('sitemap.xml'), 'utf8');
  const lastmods = [...sitemap.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map(([, d]) => d);
  assert.ok(lastmods.length >= 2);
  for (const d of lastmods) assert.equal(d, date.slice(0, 10));
});
