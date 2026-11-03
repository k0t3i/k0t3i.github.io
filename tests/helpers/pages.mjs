import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the source repository. */
export const PUBLISHED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Output of `npm run build`, the only thing published to master. */
export const DIST_ROOT = join(PUBLISHED_ROOT, 'dist');

export const PAGES = ['/', '/en/', '/404.html'];

/** Every file tracked by git (relative, forward slashes), except .gitignore. */
export function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: PUBLISHED_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter((f) => f && f !== '.gitignore');
}

/** Tracked files copied as-is into dist/ (everything under public/). */
export function publishedFiles() {
  return trackedFiles().filter((f) => f.startsWith('public/'));
}

/** Every file of dist/ (relative to dist/, forward slashes). Empty when dist/ does not exist. */
export function distFiles() {
  try {
    return readdirSync(DIST_ROOT, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => relative(DIST_ROOT, join(d.parentPath, d.name)).split(sep).join('/'));
  } catch {
    return [];
  }
}
