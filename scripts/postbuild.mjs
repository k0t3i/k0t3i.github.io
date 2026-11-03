// Post-build step run after `vite-ssg build`:
//   1. dist/404/index.html -> dist/404.html (GitHub Pages serves 404.html for unknown paths);
//   2. every dist/**/*.html gets its Content-Security-Policy <meta>, right after <meta charset>;
//   3. fails if a page has an inline style (the CSP forbids it);
//   4. fails if dist/kit-urgence exists (that folder belongs to another repository).
// It also removes dist/.vite (the SSR manifest is of no use once pages are prerendered).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const CHARSET = /<meta\s+charset=[^>]*>/i;
const CSP_META = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi;
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** Inline executable scripts. application/ld+json is data, not code, so it needs no hash. */
export function inlineScriptBodies(html) {
  const bodies = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (/\bsrc\s*=/i.test(attrs) || /\btype\s*=\s*["']?application\/ld\+json/i.test(attrs)) continue;
    bodies.push(body);
  }
  return bodies;
}

export function buildCsp(html) {
  const hashes = inlineScriptBodies(html)
    .map((body) => ` 'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
    .join('');
  return [
    "default-src 'none'",
    `script-src 'self'${hashes}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Puts the CSP <meta> directly after <meta charset>. Throws when there is no charset. */
export function insertCsp(html) {
  if (!CHARSET.test(html)) throw new Error('no <meta charset> found');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(html)}">`;
  return html.replace(CSP_META, '').replace(CHARSET, (charset) => charset + meta);
}

// Head order: <meta charset>, the CSP, then (later) the critical inline script marked
// data-critical, then everything else. Each step maps the HTML string to a new one.
const STEPS = [insertCsp];

export function transformHtml(html) {
  return STEPS.reduce((acc, step) => step(acc), html);
}

/** Problems that make the CSP unworkable: inline style attributes and <style> blocks. */
export function inlineStyleProblems(html) {
  const problems = [];
  if (/<[a-z][^>]*\sstyle\s*=/i.test(html)) problems.push('has a style attribute');
  if (/<style[\s>]/i.test(html)) problems.push('has a <style> block');
  return problems;
}

function htmlFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.html'))
    .map((d) => join(d.parentPath, d.name));
}

function main() {
  if (!existsSync(DIST)) throw new Error('dist/ does not exist: run vite-ssg build first');
  const errors = [];

  rmSync(join(DIST, '.vite'), { recursive: true, force: true });

  const nested404 = join(DIST, '404', 'index.html');
  if (existsSync(nested404)) {
    renameSync(nested404, join(DIST, '404.html'));
    if (readdirSync(join(DIST, '404')).length === 0) rmdirSync(join(DIST, '404'));
  }

  for (const file of htmlFiles(DIST)) {
    const name = relative(DIST, file).split(sep).join('/');
    const html = readFileSync(file, 'utf8');
    for (const problem of inlineStyleProblems(html)) errors.push(`dist/${name} ${problem}`);
    writeFileSync(file, transformHtml(html));
  }

  if (existsSync(join(DIST, 'kit-urgence'))) errors.push('dist/kit-urgence exists, it belongs to another repository');

  if (errors.length) {
    for (const e of errors) console.error(`postbuild: ${e}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
