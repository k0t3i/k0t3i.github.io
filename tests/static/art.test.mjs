import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DIST_ROOT, PUBLISHED_ROOT, distFiles } from '../helpers/pages.mjs';

// The static art of the wide board (src/assets/img/board-wide.svg) and the live trace layer drawn
// over it (BoardSignal.vue), checked in the source and in the output of `npm run build`.
const ART = readFileSync(join(PUBLISHED_ROOT, 'src/assets/img/board-wide.svg'), 'utf8');
const PART_IDS = ['r1', 'c1', 'led1', 'd1', 'u2', 'j1', 'j2', 'j3'];

/** Attributes of every tag named `name` in some markup. */
function tags(markup, name) {
  return [...markup.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'g'))].map(([, raw]) =>
    Object.fromEntries([...raw.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
  );
}

/** The paths drawn by BoardSignal in a built page, by class. */
function layer(file) {
  const html = readFileSync(join(DIST_ROOT, file), 'utf8');
  const svg = html.match(/<svg class="board__signal"[\s\S]*?<\/svg>/)?.[0] ?? '';
  return { svg, paths: tags(svg, 'path') };
}

const artDs = new Set(tags(ART, 'path').map((p) => p.d));

test('art is a static decorative SVG', () => {
  assert.match(ART, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1600 900">/);
  assert.doesNotMatch(ART, /<script/i);
  assert.doesNotMatch(ART, /filter/i);
  assert.doesNotMatch(ART, /<text[^>]*opacity/i);
  // Nothing fetched from elsewhere: an image used as a background loads nothing anyway.
  assert.doesNotMatch(ART, /(href|src)="(?!#)/);
  assert.doesNotMatch(ART, /<style/i);
  // Integer coordinates only, so every edge lands on the same grid as the CSS positions.
  for (const name of ['x', 'y', 'cx', 'cy', 'r', 'rx', 'width', 'height', 'stroke-width', 'font-size']) {
    for (const [, value] of ART.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))) {
      assert.match(value, /^-?\d+$/, `${name}="${value}" is not an integer`);
    }
  }
  for (const d of artDs) assert.match(d, /^(M\d+ \d+([HV]\d+|L\d+ \d+)+)+$/, `path "${d}" is not integer M/H/V/L`);
});

test('art text colors meet contrast', () => {
  const texts = tags(ART, 'text');
  assert.ok(texts.length > 0, 'the art prints some silkscreen');
  // The silkscreen and the dim silkscreen of the board: at least 4.5:1 on both masks.
  for (const t of [...texts, ...tags(ART, 'tspan')]) assert.ok(['#e8e4da', '#a29e95'].includes(t.fill), `text fill ${t.fill}`);
});

for (const file of ['index.html', 'en/index.html']) {
  test(`ambient signals follow real traces (${file})`, () => {
    const signals = layer(file).paths.filter((p) => p.class === 'signal');
    assert.equal(signals.length, 4);
    for (const s of signals) {
      assert.equal(s.pathLength, '100');
      assert.ok(artDs.has(s.d), `signal ${s.d} is not a trace of the art`);
    }
  });

  test(`one live trace per part (${file})`, () => {
    const { svg, paths } = layer(file);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.match(svg, /viewBox="0 0 1600 900"/);
    const live = paths.filter((p) => p.class === 'trace-live');
    assert.deepEqual(
      live.map((p) => p['data-part']),
      PART_IDS,
    );
    for (const p of live) {
      assert.equal(p.pathLength, '100');
      // Drawn over its own copper: the same route as a trace of the art.
      assert.ok(artDs.has(p.d), `live trace ${p['data-part']} is not a trace of the art`);
    }
  });
}

test('art ≤ 10 KB gzip', () => {
  const size = gzipSync(ART, { level: 9 }).length;
  assert.ok(size <= 10 * 1024, `${size} B gzip`);
});

test('the wide stylesheet points to the hashed art, and the page preloads it for the wide board only', () => {
  const files = distFiles();
  const art = files.filter((f) => /^assets\/board-wide-[\w-]+\.svg$/.test(f));
  assert.equal(art.length, 1, 'one hashed copy of the art');
  assert.equal(readFileSync(join(DIST_ROOT, art[0]), 'utf8'), ART);
  const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(DIST_ROOT, f), 'utf8')).join('');
  assert.ok(css.includes(`url(/${art[0]})`), 'background url of the wide board');
  for (const page of ['index.html', 'en/index.html']) {
    const html = readFileSync(join(DIST_ROOT, page), 'utf8');
    const preloads = tags(html, 'link').filter((l) => l.rel === 'preload' && l.as === 'image');
    assert.deepEqual(
      preloads.map((l) => [l.href, l.type, l.media]),
      [[`/${art[0]}`, 'image/svg+xml', '(min-width: 79rem)']],
      page,
    );
  }
  // The 404 page has no wide board.
  assert.doesNotMatch(readFileSync(join(DIST_ROOT, '404.html'), 'utf8'), /board-wide/);
});
