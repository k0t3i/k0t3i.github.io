// `npm run build`: vite-ssg build, then scripts/postbuild.mjs, under one build date. BUILD_DATE, an ISO
// date (now, unless it is given), is read by vite.config.ts for the uptime of the prerender and of the
// first client render (__BUILD_DATE__), and by scripts/postbuild.mjs for the lastmod of the sitemap.
// DIST_DIR builds into another folder than dist/, as for each step.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

process.env.BUILD_DATE ??= new Date().toISOString();
if (Number.isNaN(Date.parse(process.env.BUILD_DATE))) {
  console.error(`build: BUILD_DATE must be an ISO date, got "${process.env.BUILD_DATE}"`);
  process.exit(1);
}

for (const args of [
  [join(ROOT, 'node_modules', 'vite-ssg', 'bin', 'vite-ssg.js'), 'build'],
  [join(ROOT, 'scripts', 'postbuild.mjs')],
]) {
  const { status } = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
}
