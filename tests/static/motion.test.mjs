import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLISHED_ROOT } from '../helpers/pages.mjs';
import { parseCss, splitTopLevel } from '../helpers/css.mjs';

// The motion of the page, read in its sources: src/styles/*.css and the <style> blocks of the .vue
// files. Cheap motion only (what the compositor or a repaint of a few pixels can do), and none of it
// with reduced motion.

const SRC = join(PUBLISHED_ROOT, 'src');
const read = (file) => readFileSync(join(SRC, file), 'utf8');
const files = readdirSync(SRC, { recursive: true }).map((f) => f.split('\\').join('/'));
const SHEETS = [
  ...files.filter((f) => /^styles\/[^/]+\.css$/.test(f)).map((f) => ({ name: `src/${f}`, css: read(f) })),
  ...files
    .filter((f) => f.endsWith('.vue'))
    .flatMap((f) => [...read(f).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(([, css]) => ({ name: `src/${f}`, css }))),
];

const PARSED = SHEETS.map(({ name, css }) => ({ name, ...parseCss(css) }));
const DECLARATIONS = PARSED.flatMap(({ name, declarations }) => declarations.map((d) => ({ ...d, file: name })));
const BLOCKS = PARSED.flatMap(({ name, blocks }) => blocks.map((b) => ({ ...b, file: name })));

const where = ({ file, parents, property, prelude }) => `${file}: ${[...parents, property ?? prelude].join(' > ')}`;

const NO_PREFERENCE = /^@media\b(?!.*\bnot\b).*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/;
const welcome = (parents) => parents.some((p) => NO_PREFERENCE.test(p));
const inKeyframes = (parents) => parents.some((p) => /^@(-webkit-)?keyframes\b/.test(p));

const TIME = /^-?[\d.]+m?s$/;
const EASING = /^(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$|^(cubic-bezier|steps|linear)\(/;
const NOT_A_PROPERTY = new Set(['allow-discrete', 'normal']);

/** The transitions of the stylesheets, one per transitioned property: `transition: none` has none. */
const TRANSITIONS = DECLARATIONS.filter((d) => d.property === 'transition' || d.property === 'transition-property').flatMap((d) => {
  const items = splitTopLevel(d.value.toLowerCase());
  const properties =
    d.property === 'transition-property'
      ? items
      : // The property of an item is its word that is no duration, no easing, no keyword; none at all is `all`.
        items.map((item) => splitTopLevel(item, ' ').find((t) => !TIME.test(t) && !EASING.test(t) && !NOT_A_PROPERTY.has(t)) ?? 'all');
  return properties.filter((p) => p !== 'none').map((transitioned) => ({ ...d, transitioned }));
});

test('no transition: all', () => {
  assert.ok(TRANSITIONS.length > 0, 'no transition found: the reader of the stylesheets is broken');
  for (const t of TRANSITIONS) assert.notEqual(t.transitioned, 'all', `${where(t)}: transition of every property`);
});

/**
 * stroke-dashoffset repaints a stroke, as fill and stroke do: the trace of the active part on the wide
 * board draws itself from DISP1 by its dash offset, and keeps it while it fades out (motion.css).
 */
test('transitions only on cheap properties', () => {
  const CHEAP = ['opacity', 'transform', 'translate', 'scale', 'color', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke', 'stroke-dashoffset', 'display', 'overlay'];
  for (const t of TRANSITIONS) assert.ok(CHEAP.includes(t.transitioned), `${where(t)}: transition of ${t.transitioned}`);
});

test('keyframes only on opacity, transform, translate, stroke-dashoffset', () => {
  const ANIMATED = ['opacity', 'transform', 'translate', 'stroke-dashoffset'];
  const frames = DECLARATIONS.filter((d) => inKeyframes(d.parents));
  assert.ok(frames.length > 0, 'no keyframe found: the reader of the stylesheets is broken');
  // animation-timing-function in a keyframe is the easing up to the next one: it animates nothing.
  for (const d of frames) {
    if (d.property === 'animation-timing-function') continue;
    assert.ok(ANIMATED.includes(d.property), `${where(d)}: keyframes of ${d.property}`);
  }
});

test('every animation and transition under prefers-reduced-motion: no-preference', () => {
  const motion = DECLARATIONS.filter(
    (d) =>
      (/^(animation|transition)(-|$)/.test(d.property) && d.value.toLowerCase() !== 'none') ||
      (d.property === 'scroll-behavior' && d.value.toLowerCase() === 'smooth'),
  );
  assert.ok(motion.length > 0, 'no animation found: the reader of the stylesheets is broken');
  for (const d of motion) assert.ok(welcome(d.parents), `${where(d)}: outside prefers-reduced-motion: no-preference`);
  // The keyframes, the start of a transition (@starting-style) and the view transitions between pages too.
  const blocks = BLOCKS.filter(({ prelude }) => /^@(-webkit-)?keyframes\b|^@starting-style\b|^@view-transition\b|::view-transition/.test(prelude));
  assert.ok(blocks.length > 0);
  for (const b of blocks) assert.ok(welcome(b.parents), `${where(b)}: outside prefers-reduced-motion: no-preference`);
});

/** The keyframes of an animation: each offset (0 to 1) with its declarations. */
function keyframes(name) {
  const frames = DECLARATIONS.filter((d) => d.parents.some((p) => p === `@keyframes ${name}`));
  return frames.flatMap((d) => {
    const selector = d.parents.at(-1);
    return splitTopLevel(selector).map((s) => ({ at: s === 'from' ? 0 : s === 'to' ? 1 : parseFloat(s) / 100, property: d.property, value: d.value }));
  });
}

/** The animation shorthand of a selector in the stylesheets: its name and its duration, in seconds. */
function animationOf(selector) {
  const d = DECLARATIONS.find((x) => x.property === 'animation' && x.parents.at(-1) === selector);
  assert.ok(d, `no animation on ${selector}`);
  const items = splitTopLevel(d.value, ' ');
  const duration = items.find((t) => TIME.test(t)) ?? '';
  return { name: items[0], seconds: parseFloat(duration) / (duration.endsWith('ms') ? 1000 : 1), declaration: d };
}

test('the wave of the page: a pass of about 3 s, every 20 s, its band and its dots moved as one', () => {
  // Revision 8: a soft band of lit dots crosses the mat now and then. The band moves; the dots in it
  // move back as much, so they stay on the grid of the mat (two transforms, composited).
  const band = animationOf('.mat__wave');
  const dots = animationOf('.mat__wave::before');
  for (const a of [band, dots]) {
    assert.equal(a.seconds, 20, `${a.name}: one pass every 20 s`);
    assert.ok(welcome(a.declaration.parents), `${a.name}: outside prefers-reduced-motion: no-preference`);
    assert.match(a.declaration.value, /\binfinite\b/);
  }
  // The same timing for both: the dots never slide on the mat.
  assert.equal(band.declaration.value.replace(band.name, ''), dots.declaration.value.replace(dots.name, ''));
  const [b, d] = [keyframes(band.name), keyframes(dots.name)];
  assert.ok(b.length >= 2 && b.every((f) => f.property === 'transform'), `${band.name}: transform only`);
  assert.deepEqual(
    d.map((f) => f.at),
    b.map((f) => f.at),
  );
  // Each offset of the dots undoes the one of the band: translateX(v) against translateX(-v).
  const amount = (v) => v.replace(/^translateX\((-?)(.*)\)$/, (_, sign, x) => (sign ? x : `-${x}`));
  for (const [i, f] of b.entries()) assert.equal(amount(f.value), d[i]?.value.replace(/^translateX\((.*)\)$/, '$1'), `offset ${f.at}`);
  // It moves between two offsets only, 3 s of the 20 s; the rest of the time it is off the page.
  const values = [...new Set(b.map((f) => f.value))];
  assert.equal(values.length, 2);
  const leaves = Math.max(...b.filter((f) => f.value === values[0]).map((f) => f.at));
  const arrives = Math.min(...b.filter((f) => f.value === values[1]).map((f) => f.at));
  assert.ok(Math.abs((arrives - leaves) * band.seconds - 3) < 0.25, `a pass of ${((arrives - leaves) * band.seconds).toFixed(2)} s`);
});

test('the glow of the page writes registered properties that are not inherited', () => {
  // A frame of the glow (useGlow.ts) restyles the glow alone, never the document under it.
  const properties = BLOCKS.filter((b) => /^@property --glow-/.test(b.prelude)).map((b) => b.prelude.replace('@property ', ''));
  assert.deepEqual(properties.sort(), ['--glow-x', '--glow-y']);
  for (const name of properties) {
    const inherits = DECLARATIONS.find((d) => d.property === 'inherits' && d.parents.at(-1) === `@property ${name}`);
    assert.equal(inherits?.value, 'false', `${name} inherits`);
  }
});

test('the mat, its wave and its glow go with more contrast and in forced colours', () => {
  for (const media of ['@media (prefers-contrast: more)', '@media (forced-colors: active)']) {
    const off = DECLARATIONS.filter((d) => d.parents.includes(media) && d.property === 'display' && d.value === 'none' && /(^|,\s*)\.mat(\s*,|$)/.test(d.parents.at(-1) ?? ''));
    assert.equal(off.length, 1, `${media}: .mat { display: none }`);
  }
});

test('the retro mode of the mini-game: a layer of its own after motion and before modes, on data-retro only', () => {
  // More contrast and forced colours still win over it (revision 8).
  assert.match(read('styles/tokens.css'), /@layer [^;]*\bmotion, retro, modes;/);
  assert.match(read('styles/retro.css').replace(/\/\*[\s\S]*?\*\//g, '').trim(), /^@layer retro \{/);
  assert.match(read('main.ts'), /import '\.\/styles\/motion\.css';\nimport '\.\/styles\/retro\.css';\nimport '\.\/styles\/modes\.css';/);
  // Every rule of it asks for data-retro on <html>: nothing of it shows outside the game.
  const rules = BLOCKS.filter((b) => b.file === 'src/styles/retro.css' && !b.prelude.startsWith('@'));
  assert.ok(rules.length >= 3);
  for (const r of rules) for (const s of splitTopLevel(r.prelude)) assert.match(s, /^:root\[data-retro\]/, s);
});
