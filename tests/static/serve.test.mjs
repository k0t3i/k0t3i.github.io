import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertCsp } from '../../scripts/postbuild.mjs';
import { asOverHttps } from '../../scripts/serve.mjs';

const page = '<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body></body></html>';

test('the local server drops upgrade-insecure-requests from the CSP of postbuild, and only it', () => {
  const built = insertCsp(page);
  assert.match(built, /; upgrade-insecure-requests"/);
  const served = asOverHttps(built);
  assert.doesNotMatch(served, /upgrade-insecure-requests/);
  assert.equal(served, built.replace('; upgrade-insecure-requests', ''));
});

test('the local server fails loudly when the directive is still there after stripping', () => {
  const moved = `<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests; default-src 'none'">`;
  assert.throws(() => asOverHttps(moved), /upgrade-insecure-requests/);
});
