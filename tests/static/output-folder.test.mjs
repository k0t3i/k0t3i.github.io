import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { outputFolder } from '../../scripts/output-folder.mjs';

// scripts/captures.mjs replaces its own previous output (fr/, en/, 404/, index.html) in its folder:
// never in the repository itself or a folder above it, where index.html is a source.

const ROOT = resolve('D:/repo/site');

test('a folder of its own is fine, inside the repository or out of it', () => {
  for (const folder of [join(ROOT, 'captures'), join(ROOT, 'captures', 'today'), resolve('D:/repo/captures'), resolve('C:/temp/shots')]) {
    assert.equal(outputFolder(folder, ROOT), resolve(folder));
  }
});

test('the repository itself or a folder that holds it is refused', () => {
  for (const folder of [ROOT, join(ROOT, '.'), join(ROOT, 'src', '..'), resolve('D:/repo'), resolve('D:/')]) {
    assert.throws(() => outputFolder(folder, ROOT), /holds the repository/, folder);
  }
});
