import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameOf } from '../../scripts/og.mjs';

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
