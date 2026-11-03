// Validates the built pages of dist/: html-validate, the Nu HTML checker (vnu, --Werror)
// and the font glyph coverage (scripts/fonts.py check).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('validate: dist/ does not exist, run `npm run build` first.');
  process.exit(1);
}

const pages = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith('.html'))
  .map((d) => relative(root, join(d.parentPath, d.name)));

if (pages.length === 0) {
  console.error('validate: dist/ contains no HTML page.');
  process.exit(1);
}

/** Runs a command; a command that cannot be spawned (not installed, not on PATH) is a failure. */
function run(label, cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32' && cmd === 'npx',
  });
  if (r.error) {
    console.error(`validate: cannot run ${label} (${cmd}): ${r.error.message}`);
    return false;
  }
  return r.status === 0;
}

// vnu reads the pages from file://, where the CSP keyword 'self' matches nothing, so it reports every
// external script as blocked. It also cannot evaluate sha256 sources, so it reports every inline script,
// hashed or not, with one and the same message:
//   Inline script violates Content Security Policy (meta tag): blocked by "script-src" directive
//   (missing "'unsafe-inline'" or nonce/hash).
// vnu therefore cannot see an unhashed inline script: tests/static/dist.test.mjs is the guard for that
// (every inline executable script must have its hash in the CSP), together with the e2e CSP check.
const CSP_ORIGIN_NOISE = String.raw`(Resource violates Content Security Policy \(meta tag\): external .* blocked by .*|Inline script violates Content Security Policy \(meta tag\): blocked by .* \(missing .*nonce/hash\)\.)`;

const results = [
  run('html-validate', 'npx', ['html-validate', '--config', '.htmlvalidate.json', ...pages], {
    // html-validate uses fs.globSync, still flagged experimental on Node 22.
    NODE_NO_WARNINGS: '1',
  }),
  run('vnu', 'java', ['-jar', 'node_modules/vnu-jar/build/dist/vnu.jar', '--Werror', '--filterpattern', CSP_ORIGIN_NOISE, ...pages]),
  run('fonts check', 'python', ['scripts/fonts.py', 'check', ...pages]),
];

process.exit(results.every(Boolean) ? 0 : 1);
