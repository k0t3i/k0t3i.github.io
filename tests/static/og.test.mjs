import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameOf, opaqueFill } from '../../scripts/og-frame.mjs';

const OUT = { width: 1200, height: 630 };

test('the share image is framed on the board, at the ratio of a link preview', () => {
  // The wide board of a 1600-wide window (1536 x 864), centred in a capture 1000 px high.
  const frame = frameOf({ x: 32, y: 68, width: 1536, height: 864 }, { width: 1600, height: 1000 }, OUT);
  assert.equal(frame.height, 1000);
  assert.ok(Math.abs(frame.width / frame.height - OUT.width / OUT.height) < 1e-9);
  // Centred on the board, and wider than the capture: the board and its margins are all in it.
  assert.ok(Math.abs(frame.x + frame.width / 2 - 800) < 1e-9);
  assert.ok(Math.abs(frame.y + frame.height / 2 - 500) < 1e-9);
  assert.ok(frame.x < 0 && frame.x + frame.width > 1600);
});

test('a board off-centre in the capture keeps the frame centred on it', () => {
  const frame = frameOf({ x: 100, y: 50, width: 800, height: 450 }, { width: 1600, height: 900 }, OUT);
  assert.ok(Math.abs(frame.x + frame.width / 2 - 500) < 1e-9);
  assert.ok(Math.abs(frame.y + frame.height / 2 - 275) < 1e-9);
});

test('the sides of the image are filled with the page colour only when it is opaque', () => {
  assert.equal(opaqueFill('rgb(236, 234, 227)'), 'rgb(236, 234, 227)');
  assert.equal(opaqueFill('rgba(8, 9, 10, 1)'), 'rgba(8, 9, 10, 1)');
  for (const colour of ['rgba(0, 0, 0, 0)', 'rgba(236, 234, 227, 0.5)', 'transparent', 'color(srgb 1 1 1 / 0.5)', '', undefined]) {
    assert.throws(() => opaqueFill(colour), /must be opaque/, String(colour));
  }
});

test('the static suite reads the framing without loading a browser', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../scripts/og-frame.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^import\b/m);
});
