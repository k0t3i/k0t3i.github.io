import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLISHED_ROOT } from '../helpers/pages.mjs';
import { imageSize } from '../helpers/image-size.mjs';

const at = (...p) => join(PUBLISHED_ROOT, ...p);
const img = (f) => at('public', 'img', f);

test('avatar is a square PNG between 16 and 64 px with alpha', () => {
  const buf = readFileSync(img('avatar.png'));
  const info = imageSize(buf);
  assert.equal(info.type, 'png');
  assert.equal(info.width, info.height);
  assert.ok(info.width >= 16 && info.width <= 64, `size ${info.width}`);
  assert.equal(info.alpha, true);
  assert.ok(buf.length <= 6 * 1024, `${buf.length} bytes`);
});

test('kit images exist in 3 formats x 2 widths', () => {
  for (const w of [380, 760]) {
    for (const ext of ['avif', 'webp', 'jpg']) {
      assert.ok(existsSync(img(`kit-urgence-${w}.${ext}`)), `kit-urgence-${w}.${ext} is missing`);
    }
  }
  const small = imageSize(readFileSync(img('kit-urgence-380.jpg')));
  const large = imageSize(readFileSync(img('kit-urgence-760.jpg')));
  assert.deepEqual([small.type, small.width, small.height], ['jpeg', 380, 475]);
  assert.deepEqual([large.type, large.width, large.height], ['jpeg', 760, 950]);
});

test('kit avif 380 <= 30 KB, jpg 760 <= 110 KB', () => {
  const a = statSync(img('kit-urgence-380.avif')).size;
  const j = statSync(img('kit-urgence-760.jpg')).size;
  assert.ok(a <= 30 * 1024, `avif 380 is ${a} bytes`);
  assert.ok(j <= 110 * 1024, `jpg 760 is ${j} bytes`);
});

test('favicons', () => {
  const ico = imageSize(readFileSync(at('public', 'favicon.ico')));
  assert.equal(ico.type, 'ico');
  assert.ok(ico.count >= 2, `ico has ${ico.count} images`);
  const touch = imageSize(readFileSync(at('public', 'apple-touch-icon.png')));
  assert.deepEqual([touch.type, touch.width, touch.height], ['png', 180, 180]);
  const svg = readFileSync(at('public', 'favicon.svg'), 'utf8');
  assert.match(svg, /viewBox/);
  assert.doesNotMatch(svg, /<script/i);
});
