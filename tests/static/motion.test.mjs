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
 * Awaiting a ruling of Anthony (Task 12 report): the trace of the active part on the wide board draws
 * itself from DISP1 by its dash offset, and keeps it while it fades out. The keyframes may animate the
 * dash offset (below), the transitions may not; no cheaper property draws a stroke. Each exception is
 * the rule and the property; one that no longer matches fails, so none outlives its code.
 */
const AWAITING_RULING = [
  { rule: '.trace-live, .trace-pulse', property: 'stroke-dashoffset' },
  { rule: '.board__live > [data-lit]', property: 'stroke-dashoffset' },
];

test('transitions only on cheap properties', () => {
  const CHEAP = ['opacity', 'transform', 'translate', 'scale', 'color', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke', 'display', 'overlay'];
  const awaiting = (t) => AWAITING_RULING.find((a) => a.rule === t.parents.at(-1) && a.property === t.transitioned);
  for (const t of TRANSITIONS) assert.ok(CHEAP.includes(t.transitioned) || awaiting(t), `${where(t)}: transition of ${t.transitioned}`);
  for (const a of AWAITING_RULING) assert.ok(TRANSITIONS.some((t) => awaiting(t) === a), `${a.rule} no longer transitions ${a.property}: drop its exception`);
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
