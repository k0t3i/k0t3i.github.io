// The local server of the scripts that look at the built site (og.mjs, captures.mjs, lighthouse.mjs):
// scripts/serve.mjs serving a build folder as GitHub Pages serves it, started for one run and stopped
// after it, whatever happens in between. A server already on the port is never trusted blindly: it is
// used only if it serves that very build, compressed.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asOverHttps } from './serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A free TCP port of this machine. */
export const freePort = () =>
  new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });

/** Whether nothing listens on `port` yet. */
export const isFree = (port) =>
  new Promise((answer) => {
    const probe = createServer();
    probe.once('error', () => answer(false));
    probe.listen(port, () => probe.close(() => answer(true)));
  });

/**
 * Whether the server at `origin` serves this very build: its / is the index.html of `dist` as
 * scripts/serve.mjs serves it, gzip-compressed. Any other server (another folder, another build,
 * another program) is not.
 */
export async function servesBuild(origin, dist) {
  try {
    const response = await fetch(`${origin}/`, { headers: { 'accept-encoding': 'gzip' }, signal: AbortSignal.timeout(3000) });
    if (!response.ok || response.headers.get('content-encoding') !== 'gzip') return false;
    return (await response.text()) === asOverHttps(readFileSync(join(dist, 'index.html'), 'utf8'));
  } catch {
    return false;
  }
}

/** Starts scripts/serve.mjs on `port` for `dist`; resolves once it serves that build, with its origin and how to stop it. */
export async function startServer({ port, dist }) {
  const origin = `http://localhost:${port}`;
  const server = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DIST_DIR: dist },
    stdio: 'ignore',
  });
  let failed = null;
  server.once('error', (error) => (failed = error));
  const stop = () =>
    new Promise((done) => {
      if (server.exitCode !== null || server.signalCode !== null || failed) return done();
      server.once('exit', () => done());
      server.kill();
    });
  try {
    for (let i = 0; ; i++) {
      if (failed) throw new Error(`scripts/serve.mjs could not start: ${failed.message}`);
      if (server.exitCode !== null) throw new Error(`scripts/serve.mjs stopped (exit ${server.exitCode}): is port ${port} taken?`);
      if (await servesBuild(origin, dist)) return { origin, stop };
      if (i === 100) throw new Error(`scripts/serve.mjs does not serve ${dist} on ${origin}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch (error) {
    await stop();
    throw error;
  }
}

/**
 * Runs `run(origin, { reused })` with `dist` served, then stops the server it started, whether `run`
 * resolves or throws.
 * - With `reuse`, a server already on `port` that serves this very build is used as it is, and left running.
 * - Otherwise scripts/serve.mjs is started on `port`, or on a free port if `port` is taken.
 */
export async function withServer({ port, dist, reuse = false }, run) {
  const there = `http://localhost:${port}`;
  if (reuse && (await servesBuild(there, dist))) return run(there, { reused: true });
  const server = await startServer({ port: (await isFree(port)) ? port : await freePort(), dist });
  try {
    return await run(server.origin, { reused: false });
  } finally {
    await server.stop();
  }
}
