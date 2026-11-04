// `npm run build`: vite-ssg build, then scripts/postbuild.mjs, under one build date. BUILD_DATE, an ISO
// date (now, unless it is given: scripts/deploy.mjs gives the commit date of the sources), is read by
// vite.config.ts for the uptime of the prerender and of the first client render (__BUILD_DATE__), and
// by scripts/postbuild.mjs for the lastmod of the sitemap. DIST_DIR builds into another folder than
// dist/, as for each step.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The build date: `given` (BUILD_DATE) or `now`, written as toISOString() writes it, so that the same
 * instant is always the same text in the build.
 * @param {string | undefined} given
 * @param {Date} [now]
 * @returns {string}
 */
export function buildDate(given, now = new Date()) {
  const date = given === undefined ? now : new Date(given);
  if (Number.isNaN(date.getTime())) throw new Error(`build: BUILD_DATE must be an ISO date, got "${given}"`);
  return date.toISOString();
}

function main() {
  try {
    process.env.BUILD_DATE = buildDate(process.env.BUILD_DATE);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  for (const args of [
    [join(ROOT, 'node_modules', 'vite-ssg', 'bin', 'vite-ssg.js'), 'build'],
    [join(ROOT, 'scripts', 'postbuild.mjs')],
  ]) {
    const { status } = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    if (status !== 0) process.exit(status ?? 1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
