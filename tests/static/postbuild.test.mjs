import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hoistCritical, inlineScriptBodies, inlineStyleProblems, insertCsp, robotsTxt, sitemapXml, transformHtml } from '../../scripts/postbuild.mjs';

const hashOf = (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
const CHARSET = '<meta charset="utf-8">';
const page = (head) => `<!doctype html><html><head>${CHARSET}${head}</head><body></body></html>`;

test('the CSP directly follows <meta charset>', () => {
  const html = insertCsp(page('<title>x</title>'));
  assert.match(html, /<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'/);
});

test('an existing CSP is replaced, not duplicated', () => {
  const once = insertCsp(page(''));
  assert.equal(insertCsp(once).match(/Content-Security-Policy/g).length, 1);
});

test('one hash per inline executable script', () => {
  const html = insertCsp(page('<script>var a=1</script><script>var b=2</script>'));
  const csp = html.match(/content="([^"]*)"/)[1];
  assert.ok(csp.includes(hashOf('var a=1')));
  assert.ok(csp.includes(hashOf('var b=2')));
  assert.equal(csp.match(/'sha256-/g).length, 2);
});

test('application/ld+json and external scripts get no hash', () => {
  const html = insertCsp(page('<script type="application/ld+json">{"a":1}</script><script type="module" src="/a.js"></script>'));
  assert.doesNotMatch(html, /sha256-/);
});

test('an inline script with data-src is still hashed', () => {
  const body = 'var x=1';
  assert.deepEqual(inlineScriptBodies(`<script data-src="x">${body}</script>`), [body]);
  assert.ok(insertCsp(page(`<script data-src="x">${body}</script>`)).includes(hashOf(body)));
});

test('a data-critical script moves right after the CSP', () => {
  const html = transformHtml(
    page('<link rel="stylesheet" href="/a.css"><title>x</title><script data-critical="">var go=1</script>'),
  );
  assert.match(html, /<meta http-equiv="Content-Security-Policy"[^>]*><script data-critical="">var go=1<\/script><link rel="stylesheet"/);
  assert.equal(html.match(/data-critical/g).length, 1);
  assert.ok(html.includes(hashOf('var go=1')));
});

test('the theme script goes first, then the redirect, whatever their order in the page', () => {
  const html = transformHtml(
    page(
      '<link rel="stylesheet" href="/a.css"><script data-critical="redirect">var go=1</script>' +
        '<title>x</title><script data-critical="theme">var t=1</script>',
    ),
  );
  assert.match(
    html,
    /<meta http-equiv="Content-Security-Policy"[^>]*><script data-critical="theme">var t=1<\/script><script data-critical="redirect">var go=1<\/script><link rel="stylesheet"/,
  );
  assert.equal(html.match(/data-critical/g).length, 2);
  assert.ok(html.includes(hashOf('var t=1')) && html.includes(hashOf('var go=1')));
});

test('hoistCritical leaves a page without a critical script untouched', () => {
  const html = insertCsp(page('<title>x</title>'));
  assert.equal(hoistCritical(html), html);
});

test('inline style attributes and blocks are problems', () => {
  assert.deepEqual(inlineStyleProblems('<div style="color:red"></div>'), ['has a style attribute']);
  assert.deepEqual(inlineStyleProblems('<style>a{}</style>'), ['has a <style> block']);
  assert.deepEqual(inlineStyleProblems('<div data-style="x"></div>'), []);
});

test('robots.txt allows everything and gives the absolute sitemap', () => {
  assert.equal(robotsTxt('https://example.org/'), 'User-agent: *\nAllow: /\nSitemap: https://example.org/sitemap.xml\n');
});

test('the sitemap lists both pages with their date and their three alternates', () => {
  const xml = sitemapXml('https://example.org/', '2026-11-04');
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'));
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => body);
  assert.deepEqual(urls.map((u) => u.match(/<loc>([^<]*)<\/loc>/)?.[1]), ['https://example.org/', 'https://example.org/en/']);
  for (const u of urls) {
    assert.match(u, /<lastmod>2026-11-04<\/lastmod>/);
    assert.deepEqual(
      [...u.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]*)" href="([^"]*)"\/>/g)].map(([, lang, href]) => `${lang} ${href}`),
      ['fr https://example.org/', 'en https://example.org/en/', 'x-default https://example.org/'],
    );
  }
  assert.ok(xml.endsWith('</urlset>\n'));
});

test('the sitemap escapes its URLs', () => {
  assert.match(sitemapXml('https://example.org/?a=1&b=2/', '2026-11-04'), /<loc>https:\/\/example\.org\/\?a=1&amp;b=2\/<\/loc>/);
});
