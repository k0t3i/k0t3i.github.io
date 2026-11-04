import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DIST_ROOT, PUBLISHED_ROOT, distFiles } from '../helpers/pages.mjs';

// The static art of the wide board (src/assets/img/board-wide.svg) and the live trace layer drawn
// over it (BoardSignal.vue), checked in the source and in the output of `npm run build`.
const ART = readFileSync(join(PUBLISHED_ROOT, 'src/assets/img/board-wide.svg'), 'utf8');
const PART_IDS = ['r1', 'c1', 'led1', 'd1', 'u2', 'j1', 'j2', 'j3', 'j4', 'j5'];

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

/** The points of a path of the art (M, H, V and L only), in art units. */
function points(d) {
  const out = [];
  let at = [0, 0];
  for (const [, cmd, args] of d.matchAll(/([MHVL])([^MHVL]*)/g)) {
    const n = args.trim().split(/\s+/).map(Number);
    at = cmd === 'H' ? [n[0], at[1]] : cmd === 'V' ? [at[0], n[0]] : [n[0], n[1]];
    out.push(at);
  }
  return out;
}
const segments = (pts) => pts.slice(1).map((p, i) => [pts[i], p]);
function toSegment([px, py], [[ax, ay], [bx, by]]) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function between(s, t) {
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const [a, b] = s;
  const [c, d] = t;
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(toSegment(a, t), toSegment(b, t), toSegment(c, s), toSegment(d, s));
}

test('the traces of the art never cross, and two traces that do not meet keep 8 units apart', () => {
  const traces = tags(ART, 'path')
    .filter((p) => p['stroke-width'])
    .map((p) => ({ d: p.d, pts: points(p.d) }));
  assert.ok(traces.length >= 18, `${traces.length} traces`);
  for (const [i, a] of traces.entries()) {
    for (const b of traces.slice(i + 1)) {
      let gap = Infinity;
      for (const s of segments(a.pts)) for (const t of segments(b.pts)) gap = Math.min(gap, between(s, t));
      if (gap >= 8) continue;
      // They may only meet at the end of one of them: a pad both leave from, or a test point on a trace.
      const ends = [a.pts[0], a.pts.at(-1), b.pts[0], b.pts.at(-1)];
      const meet = ends.some((e) => segments(a.pts).some((s) => toSegment(e, s) < 0.01) && segments(b.pts).some((s) => toSegment(e, s) < 0.01));
      assert.ok(gap < 0.01 && meet, `${a.d} and ${b.d}: ${gap.toFixed(1)} units apart`);
    }
  }
});

test('art text colors meet contrast', () => {
  const texts = tags(ART, 'text');
  assert.ok(texts.length > 0, 'the art prints some silkscreen');
  // The silkscreen and the dim silkscreen of the board: at least 4.5:1 on both masks.
  for (const t of [...texts, ...tags(ART, 'tspan')]) assert.ok(['#e8e4da', '#a29e95'].includes(t.fill), `text fill ${t.fill}`);
});

for (const file of ['index.html', 'en/index.html']) {
  test(`ambient signals follow real traces (${file})`, () => {
    const { paths } = layer(file);
    const signals = paths.filter((p) => p.class === 'signal');
    assert.equal(signals.length, 4);
    for (const s of signals) {
      assert.equal(s.pathLength, '100');
      assert.ok(artDs.has(s.d), `signal ${s.d} is not a trace of the art`);
    }
    // They run down the routes of R1, then LED1 (lit through R1), D1, and the power out of J5.
    const route = Object.fromEntries(paths.filter((p) => p.class === 'trace-live').map((p) => [p['data-part'], p.d]));
    assert.deepEqual(
      signals.map((s) => s.d),
      ['r1', 'led1', 'd1', 'j5'].map((id) => route[id]),
    );
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

  test(`the signal of each part runs on the route of its live trace (${file})`, () => {
    const { paths } = layer(file);
    const live = Object.fromEntries(paths.filter((p) => p.class === 'trace-live').map((p) => [p['data-part'], p.d]));
    const pulses = paths.filter((p) => p.class === 'trace-pulse');
    assert.deepEqual(
      pulses.map((p) => p['data-part']),
      PART_IDS,
    );
    for (const p of pulses) {
      assert.equal(p.pathLength, '100');
      assert.equal(p.d, live[p['data-part']], `signal ${p['data-part']}`);
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

test('the front lights its active part through one attribute, data-lit: no list of the ten parts kept by hand', () => {
  const styles = ['board', 'parts', 'wide', 'motion', 'modes', 'depth', 'back', 'sheets', 'base'].map((f) => ({
    f,
    css: readFileSync(join(PUBLISHED_ROOT, `src/styles/${f}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
  }));
  const named = new RegExp(`data-active="(${PART_IDS.join('|')})"`);
  for (const { f, css } of styles) assert.doesNotMatch(css, named, `${f}.css names a part of the front by hand`);
  // The rules that light the trace, its signal and the stub of the active part.
  const lit = (f, re) => assert.match(styles.find((s) => s.f === f)?.css ?? '', re, `${f}.css: ${re}`);
  lit('wide', /\.trace-live\[data-lit\]\s*\{/);
  lit('wide', /\.trace-pulse\[data-lit\]\s*\{/);
  lit('motion', /\.board__live > \[data-lit\]\s*\{/);
  lit('parts', /\.part\[data-lit\]\s*\{/);
});
