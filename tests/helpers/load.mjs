import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DIST_ROOT } from './pages.mjs';

// What a page of dist/ makes the browser fetch on its first load, read from the built files.

/** Text is served compressed (GitHub Pages, scripts/serve.mjs): it is counted gzip -9. Fonts and images as they are. */
const COMPRESSED = /\.(html|css|js|svg|xml|json|txt)$/;

/** The file of dist/ that serves a URL path: `/` and `/en/` are folders with an index.html. */
const fileOf = (path) => join(DIST_ROOT, path.endsWith('/') ? `${path}index.html` : path);

/** Bytes on the wire for a URL path of the site. */
export function wireSize(path) {
  const file = fileOf(path);
  const bytes = readFileSync(file);
  return COMPRESSED.test(file) ? gzipSync(bytes, { level: 9 }).length : bytes.length;
}

/** Attributes of every tag named `name` in some markup. */
function tags(markup, name) {
  return [...markup.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map(([, raw]) =>
    Object.fromEntries([...raw.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k.toLowerCase(), v ?? ''])),
  );
}

const relList = (link) => (link.rel ?? '').toLowerCase().split(/\s+/);

/**
 * The static imports of a chunk (`import{a}from"./x.js"`, `import"./x.js"`, `export{a}from"./x.js"`),
 * as URL paths. A dynamic import (`import("./x.js")`) is a lazy chunk: it is not followed.
 */
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g;

/** Every module a page runs before anything lazy: its module scripts, its modulepreloads and their static imports. */
export function jsLoadedBy(page) {
  const html = readFileSync(fileOf(page), 'utf8');
  const roots = [
    ...tags(html, 'script').filter((s) => s.type === 'module' && s.src),
    ...tags(html, 'link').filter((l) => relList(l).includes('modulepreload')),
  ].map((t) => t.src ?? t.href);
  const seen = new Set();
  const queue = roots.map((url) => new URL(url, `http://site${page}`).pathname);
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const code = readFileSync(fileOf(path), 'utf8');
    for (const [, spec] of code.matchAll(STATIC_IMPORT)) queue.push(posix.join(posix.dirname(path), spec));
  }
  return [...seen];
}

/** The url() of a stylesheet that point to files (data: URLs are inline), as URL paths. */
function cssUrls(path) {
  const css = readFileSync(fileOf(path), 'utf8').replace(/(["'])data:[\s\S]*?\1/g, '""');
  return [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)]
    .map(([, url]) => url)
    .filter((url) => url && !url.startsWith('data:'))
    .map((url) => new URL(url, `http://site${path}`).pathname);
}

/**
 * Everything the first load of a page can fetch, at its widest (the wide board): the page, its
 * JavaScript, its stylesheets and every file they point to (fonts, the art of the wide board), its
 * preloads whatever their media, its icons, and its images that are not lazy. The apple-touch-icon
 * is left out: only a phone adding the page to its home screen asks for it.
 */
export function firstLoad(page) {
  const html = readFileSync(fileOf(page), 'utf8');
  const links = tags(html, 'link');
  const sheets = links.filter((l) => relList(l).includes('stylesheet')).map((l) => l.href);
  const paths = [
    page,
    ...jsLoadedBy(page),
    ...sheets,
    ...sheets.flatMap((sheet) => cssUrls(new URL(sheet, `http://site${page}`).pathname)),
    ...links.filter((l) => relList(l).some((r) => r === 'preload' || r === 'icon')).map((l) => l.href),
    ...tags(html, 'img').filter((i) => i.src && i.loading !== 'lazy').map((i) => i.src),
  ].map((url) => new URL(url, `http://site${page}`).pathname);
  return [...new Set(paths)].map((path) => ({ path, bytes: wireSize(path) }));
}
