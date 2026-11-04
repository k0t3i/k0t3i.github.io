import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { freePort, isFree, servesBuild, startServer, withServer } from '../../scripts/local-server.mjs';

// The local server of the scripts (og, captures, Lighthouse): never a foreign server, never left running.

const INDEX = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>build</title></head><body></body></html>';

/** A build folder of its own: an index.html, nothing else. */
function build(t) {
  const dist = mkdtempSync(join(tmpdir(), 'k0t3i-dist-'));
  writeFileSync(join(dist, 'index.html'), INDEX);
  t.after(() => rmSync(dist, { recursive: true, force: true }));
  return dist;
}

/** Another program on a port: it answers / with `body`, compressed or not. */
async function foreign(t, body, gzip) {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...(gzip ? { 'content-encoding': 'gzip' } : {}) });
    res.end(gzip ? gzipSync(body) : body);
  });
  const port = await new Promise((done) => server.listen(0, () => done(server.address().port)));
  t.after(() => new Promise((done) => server.close(done)));
  return port;
}

const refused = async (origin) => fetch(origin).then(() => false, () => true);

test('only a server of this very build, compressed, counts as serving it', async (t) => {
  const dist = build(t);
  assert.equal(await servesBuild(`http://localhost:${await foreign(t, '<!doctype html><title>other</title>', true)}`, dist), false);
  assert.equal(await servesBuild(`http://localhost:${await foreign(t, INDEX, false)}`, dist), false);
  assert.equal(await servesBuild(`http://localhost:${await freePort()}`, dist), false);
  const server = await startServer({ port: await freePort(), dist });
  t.after(server.stop);
  assert.equal(await servesBuild(server.origin, dist), true);
});

test('the server started for a run is stopped when the run throws', async (t) => {
  const dist = build(t);
  const port = await freePort();
  let seen = '';
  await assert.rejects(
    withServer({ port, dist }, async (origin) => {
      seen = origin;
      assert.equal(await servesBuild(origin, dist), true);
      throw new Error('the browser did not start');
    }),
    /the browser did not start/,
  );
  assert.equal(seen, `http://localhost:${port}`);
  assert.equal(await refused(seen), true);
  assert.equal(await isFree(port), true);
});

test('an unknown server on the port is never used: the run gets its own server on another port', async (t) => {
  const dist = build(t);
  const port = await foreign(t, INDEX, false);
  const origin = await withServer({ port, dist, reuse: true }, async (origin, { reused }) => {
    assert.equal(reused, false);
    assert.equal(await servesBuild(origin, dist), true);
    return origin;
  });
  assert.notEqual(origin, `http://localhost:${port}`);
  assert.equal(await refused(origin), true);
  // The foreign server is left as it was.
  assert.equal(await refused(`http://localhost:${port}`), false);
});

test('a server of this very build is reused as it is, and left running', async (t) => {
  const dist = build(t);
  const server = await startServer({ port: await freePort(), dist });
  t.after(server.stop);
  const port = Number(new URL(server.origin).port);
  const origin = await withServer({ port, dist, reuse: true }, async (origin, { reused }) => {
    assert.equal(reused, true);
    return origin;
  });
  assert.equal(origin, server.origin);
  assert.equal(await servesBuild(server.origin, dist), true);
});
