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

/** The names of the populated variant of the back face, removed in Task 8c (the word itself may be printed). */
const VARIANT = /BACK_VARIANT|dist-populated|back-populated|populatedTitle|populatedAlt/;

test('one back face: the populated variant and its second build are gone', () => {
  for (const f of ['src/components/BackPopulated.vue', 'src/assets/img/back-populated.svg']) assert.ok(!existsSync(at(f)), `${f} is still there`);
  // No variant switch, no second build, no copy of the other variant, anywhere in the sources.
  const hits = trackedFiles()
    .filter((f) => f !== 'tests/static/back.test.mjs' && !BINARY.test(f) && existsSync(at(f)))
    .filter((f) => VARIANT.test(read(f)));
  assert.deepEqual(hits, []);
  // Nothing of it in the build: no orphan drawing, no rule of the other variant in the CSS. A
  // « populated » bottom side may still be written about.
  assert.equal(VARIANT.test('a populated bottom side'), false);
  assert.deepEqual(distFiles().filter((f) => /back-populated/.test(f)), []);
  const code = distFiles().filter((f) => /\.(js|css|html)$/.test(f));
  assert.deepEqual(code.filter((f) => VARIANT.test(readFileSync(join(DIST_ROOT, f), 'utf8'))), []);
});

test('every rule of the back face is in back.css, in its own layer between wide and depth', () => {
  assert.match(read('src/styles/tokens.css'), /@layer reset, tokens, fonts, base, board, parts, sheets, wide, back, depth, motion, retro, modes;/);
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

test('the back face ships its art as a picture, loaded lazily, and its live layer inline', () => {
  const live = JSON.parse(read('src/circuit/live.json'));
  const files = distFiles();
  const art = files.filter((f) => /^assets\/board-back-(?!small-)[\w-]+\.svg$/.test(f));
  const small = files.filter((f) => /^assets\/board-back-small-[\w-]+\.svg$/.test(f));
  assert.equal(art.length, 1, 'one hashed copy of the art');
  assert.equal(small.length, 1, 'one hashed copy of the small art');
  assert.equal(readFileSync(join(DIST_ROOT, art[0]), 'utf8'), read('src/assets/img/board-back.svg'));
  assert.equal(readFileSync(join(DIST_ROOT, small[0]), 'utf8'), read('src/assets/img/board-back-small.svg'));
  for (const page of ['index.html', 'en/index.html']) {
    const html = readFileSync(join(DIST_ROOT, page), 'utf8');
    // The picture: never preloaded, fetched only when the back face is drawn.
    const picture = html.match(/<picture class="back__art">[\s\S]*?<\/picture>/)?.[0] ?? '';
    assert.ok(picture, `${page}: no picture`);
    assert.deepEqual(tags(picture, 'source').map((t) => [t.media, t.srcset]), [['(max-width: 40rem)', `/${small[0]}`]]);
    const [img] = tags(picture, 'img');
    assert.deepEqual([img?.src, img?.alt, img?.loading, img?.decoding], [`/${art[0]}`, '', 'lazy', 'async']);
    assert.ok(!tags(html, 'link').some((l) => (l.href ?? '').includes('board-back')), `${page}: the art of the back is preloaded`);
    // The live layer: a static drawing of the traces each part lights, and their signals.
    const layer = html.match(/<svg class="back__live"[\s\S]*?<\/svg>/)?.[0];
    assert.ok(layer, `${page}: no live layer`);
    assert.match(layer, /aria-hidden="true"/);
    assert.match(layer, /focusable="false"/);
    assert.match(layer, /viewBox="0 0 1600 900"/);
    assertStaticDrawing(layer, `${page} live layer`);
    const paths = tags(layer, 'path');
    const nets = paths.filter((t) => t.class === 'back-net');
    assert.deepEqual(nets.map((t) => t.d), live.nets.map((n) => n.d));
    for (const t of nets) assert.equal(t.pathLength, '100');
    assert.deepEqual(paths.filter((t) => t.class === 'back-pulse').map((t) => t.d), nets.map((t) => t.d));
    assert.match(html, /<table class="bom">/);
  }
});

/** The contents of every `:is(...)` of some CSS, nested parentheses included. */
function isLists(css) {
  const out = [];
  for (let at = css.indexOf(':is('); at >= 0; at = css.indexOf(':is(', at + 4)) {
    let depth = 0;
    for (let i = at + 3; i < css.length; i++) {
      if (css[i] === '(') depth++;
      else if (css[i] === ')' && --depth === 0) {
        out.push(css.slice(at + 4, i));
        break;
      }
    }
  }
  return out;
}

test('every list that lights a part of the back face names all eleven parts', () => {
  // The eleven parts of the bill of materials of revision 9.
  const refs = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6'].sort();
  let lists = 0;
  for (const f of ['src/styles/back.css', 'src/styles/motion.css', 'src/styles/modes.css']) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const list of isLists(css).filter((l) => l.includes('data-active="'))) {
      lists++;
      const named = [...new Set([...list.matchAll(/data-active="([A-Z]+\d+)"/g)].map(([, r]) => r))].sort();
      assert.deepEqual(named, refs, `${f}: ${list.slice(0, 80)}`);
    }
  }
  assert.ok(lists >= 4, `${lists} lists`);
});

test('the passives, the copper and the parts out of the table belong to the art: never lit, never animated', () => {
  const rules = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(rules('src/styles/motion.css'), /back__art|psv/);
  for (const list of isLists(rules('src/styles/back.css')).filter((l) => l.includes('data-active'))) assert.doesNotMatch(list, /back__art|psv/);
  // The old inline copper is gone, its tokens with it.
  for (const f of ['src/styles/back.css', 'src/styles/tokens.css', 'src/styles/modes.css']) assert.doesNotMatch(rules(f), /psv-|back__copper|back__psv/, f);
});
