import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DIST_ROOT, PUBLISHED_ROOT, distFiles } from '../helpers/pages.mjs';

// The two variants of the back side: the copper of the bill of materials (an inline SVG of the page)
// and the populated side (src/assets/img/back-populated.svg, an image). Both are static drawings in
// the units of the wide board, theme-neutral like its art.
const POPULATED = readFileSync(join(PUBLISHED_ROOT, 'src/assets/img/back-populated.svg'), 'utf8');

/** Attributes of every tag named `name` in some markup. */
function tags(markup, name) {
  return [...markup.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'g'))].map(([, raw]) =>
    Object.fromEntries([...raw.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
  );
}

/** A static drawing: no script, no style, no filter, nothing fetched, integer coordinates. */
function assertStaticDrawing(svg, what) {
  assert.doesNotMatch(svg, /<script/i, `${what}: script`);
  assert.doesNotMatch(svg, /filter/i, `${what}: filter`);
  assert.doesNotMatch(svg, /<style|\sstyle=/i, `${what}: style`);
  assert.doesNotMatch(svg, /(href|src)="(?!#)/, `${what}: external reference`);
  for (const name of ['x', 'y', 'cx', 'cy', 'r', 'rx', 'width', 'height', 'stroke-width', 'font-size', 'x1', 'y1', 'x2', 'y2']) {
    for (const [, value] of svg.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))) {
      assert.match(value, /^-?\d+$/, `${what}: ${name}="${value}" is not an integer`);
    }
  }
  for (const { d } of tags(svg, 'path')) {
    if (d !== undefined) assert.match(d, /^(M-?\d+ -?\d+([HV]-?\d+|L-?\d+ -?\d+|Z)*)+$/, `${what}: path "${d}" is not integer M/H/V/L`);
  }
}

test('the populated side is a static decorative SVG of the wide board', () => {
  assert.match(POPULATED, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1600 900">/);
  assertStaticDrawing(POPULATED, 'back-populated.svg');
  // Dense: many parts, each with its fine silkscreen reference.
  assert.ok(tags(POPULATED, 'use').length >= 60, 'at least 60 placed parts');
  const texts = tags(POPULATED, 'text');
  assert.ok(texts.length >= 20, 'silkscreen references');
  // Solid silkscreen colours only, the ones of the art of the front side.
  for (const t of texts) assert.ok(['#e8e4da', '#a29e95'].includes(t.fill), `text fill ${t.fill}`);
  // Theme-neutral: no colour of either mask.
  assert.doesNotMatch(POPULATED, /#0f372a|#0c0d0f|#174a39|#17191d/i);
});

test('the populated side stays light', () => {
  const size = gzipSync(POPULATED, { level: 9 }).length;
  assert.ok(size <= 12 * 1024, `${size} B gzip`);
});

test('the bill of materials build ships its copper inline, and no populated art', () => {
  for (const page of ['index.html', 'en/index.html']) {
    const html = readFileSync(join(DIST_ROOT, page), 'utf8');
    const copper = html.match(/<svg class="bom__copper"[\s\S]*?<\/svg>/)?.[0];
    assert.ok(copper, `${page}: no copper`);
    assert.match(copper, /aria-hidden="true"/);
    assert.match(copper, /focusable="false"/);
    assert.match(copper, /viewBox="0 0 1600 900"/);
    assertStaticDrawing(copper, `${page} copper`);
    assert.match(html, /<table class="bom">/);
    assert.doesNotMatch(html, /back-populated/);
  }
  // The populated component is left out of the bundle. Vite still writes the hashed file of an asset
  // imported by a module it drops: that copy is never referenced, so never loaded (task 13 removes a variant).
  const code = distFiles().filter((f) => /\.(js|css|html)$/.test(f));
  assert.deepEqual(code.filter((f) => /back-populated-[\w-]+\.svg/.test(readFileSync(join(DIST_ROOT, f), 'utf8'))), []);
});
