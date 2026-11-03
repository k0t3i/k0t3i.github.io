import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLISHED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

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

/** Tracked files that GitHub Pages publishes, i.e. everything outside dev/. */
export function publishedFiles() {
  return trackedFiles().filter((f) => !f.startsWith('dev/'));
}
