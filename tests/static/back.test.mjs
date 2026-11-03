import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST_ROOT, PUBLISHED_ROOT, distFiles, trackedFiles } from '../helpers/pages.mjs';

// The back side of the board: one face, its copper an inline SVG of the page, in the units of the
// wide board, theme-neutral like the art of the front. Its rules live in their own stylesheet.
const at = (...p) => join(PUBLISHED_ROOT, ...p);
const read = (f) => readFileSync(at(f), 'utf8');
const BINARY = /\.(woff2?|avif|webp|jpe?g|png|ico|gif|pdf|mp4)$/i;

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

test('one back face: the populated variant and its second build are gone', () => {
  for (const f of ['src/components/BackPopulated.vue', 'src/assets/img/back-populated.svg']) assert.ok(!existsSync(at(f)), `${f} is still there`);
  // No variant switch, no second build, no copy of the other variant, anywhere in the sources.
  const variant = /BACK_VARIANT|dist-populated|back-populated|populatedTitle|populatedAlt/;
  const hits = trackedFiles()
    .filter((f) => f !== 'tests/static/back.test.mjs' && !BINARY.test(f) && existsSync(at(f)))
    .filter((f) => variant.test(read(f)));
  assert.deepEqual(hits, []);
  // Nothing of it in the build: no orphan drawing, no rule of the other variant in the CSS.
  assert.deepEqual(distFiles().filter((f) => /back-populated/.test(f)), []);
  const code = distFiles().filter((f) => /\.(js|css|html)$/.test(f));
  assert.deepEqual(code.filter((f) => /back-populated|populated/.test(readFileSync(join(DIST_ROOT, f), 'utf8'))), []);
});

test('every rule of the back face is in back.css, in its own layer between wide and depth', () => {
  assert.match(read('src/styles/tokens.css'), /@layer reset, tokens, fonts, base, board, parts, sheets, wide, back, depth, motion, modes;/);
  const back = read('src/styles/back.css');
  assert.match(back.replace(/\/\*[\s\S]*?\*\//g, '').trim(), /^@layer back \{/);
  assert.match(read('src/main.ts'), /import '\.\/styles\/wide\.css';\nimport '\.\/styles\/back\.css';\nimport '\.\/styles\/depth\.css';/);
  // The layouts of the front face no longer style the back face.
  const backSelector = /\.(back__|back-|bom)[\w-]*|\.board__face--back/;
  for (const f of ['src/styles/board.css', 'src/styles/wide.css', 'src/styles/parts.css']) {
    const rules = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(rules, backSelector, `${f} still styles the back face`);
  }
});

test('the back face ships its copper inline, a static drawing', () => {
  for (const page of ['index.html', 'en/index.html']) {
    const html = readFileSync(join(DIST_ROOT, page), 'utf8');
    const copper = html.match(/<svg class="bom__copper"[\s\S]*?<\/svg>/)?.[0];
    assert.ok(copper, `${page}: no copper`);
    assert.match(copper, /aria-hidden="true"/);
    assert.match(copper, /focusable="false"/);
    assert.match(copper, /viewBox="0 0 1600 900"/);
    assertStaticDrawing(copper, `${page} copper`);
    assert.match(html, /<table class="bom">/);
  }
});
