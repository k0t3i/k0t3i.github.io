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

test('the back face ships its circuit inline: a static drawing, its eleven nets and their signals', () => {
  for (const page of ['index.html', 'en/index.html']) {
    const html = readFileSync(join(DIST_ROOT, page), 'utf8');
    const copper = html.match(/<svg class="back__copper"[\s\S]*?<\/svg>/)?.[0];
    assert.ok(copper, `${page}: no copper`);
    assert.match(copper, /aria-hidden="true"/);
    assert.match(copper, /focusable="false"/);
    assert.match(copper, /viewBox="0 0 1600 900"/);
    assertStaticDrawing(copper, `${page} copper`);
    const paths = tags(copper, 'path');
    const nets = paths.filter((t) => t.class === 'back-net');
    assert.deepEqual(nets.map((t) => t['data-net']), Array.from({ length: 11 }, (_, i) => `N${i + 1}`));
    for (const t of nets) assert.equal(t.pathLength, '100', `${t['data-net']} pathLength`);
    const pulses = paths.filter((t) => t.class === 'back-pulse');
    assert.deepEqual(pulses.map((t) => t.d), nets.map((t) => t.d));
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
  const refs = Array.from({ length: 11 }, (_, i) => `U${10 + i}`);
  let lists = 0;
  for (const f of ['src/styles/back.css', 'src/styles/motion.css', 'src/styles/modes.css']) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const list of isLists(css).filter((l) => l.includes('data-active="U'))) {
      lists++;
      const named = [...new Set([...list.matchAll(/data-active="(U\d+)"/g)].map(([, r]) => r))].sort();
      assert.deepEqual(named, refs, `${f}: ${list.slice(0, 80)}`);
    }
  }
  assert.ok(lists >= 4, `${lists} lists`);
});
