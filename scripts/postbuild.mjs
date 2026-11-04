// Post-build step run after `vite-ssg build`:
//   1. dist/404/index.html -> dist/404.html (GitHub Pages serves 404.html for unknown paths);
//   2. every dist/**/*.html gets its Content-Security-Policy <meta>, right after <meta charset>,
//      and its data-critical scripts right after the CSP: the theme, then the language redirect;
//   3. fails if a page has an inline style (the CSP forbids it);
//   4. fails if dist/kit-urgence exists (that folder belongs to another repository);
//   5. writes dist/robots.txt and dist/sitemap.xml, from the baseUrl of src/content/site.json.
// It also removes dist/.vite (the SSR manifest is of no use once pages are prerendered).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// DIST_DIR: another output folder (vite.config.ts builds there too).
const DIST = resolve(ROOT, process.env.DIST_DIR || 'dist');
const SITE_JSON = join(ROOT, 'src', 'content', 'site.json');

const CHARSET = /<meta\s+charset=[^>]*>/i;
const CSP_META = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi;
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** Inline executable scripts. application/ld+json is data, not code, so it needs no hash. */
export function inlineScriptBodies(html) {
  const bodies = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (/(?<![\w-])src\s*=/i.test(attrs) || /\btype\s*=\s*["']?application\/ld\+json/i.test(attrs)) continue;
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

/**
 * The critical scripts, in the order they must run: the theme first (it sets the board before the
 * first paint, on every page), then the language redirect (on / only). Others follow, as found.
 */
const CRITICAL_ORDER = ['theme', 'redirect'];
const CRITICAL = /<script\b[^>]*\bdata-critical(?:="([^"]*)")?[^>]*>[\s\S]*?<\/script>/gi;

/**
 * Moves the inline scripts marked data-critical right after the CSP <meta>, theme then redirect.
 * Their bodies are untouched, so the hashes computed by insertCsp stay valid.
 */
export function hoistCritical(html) {
  const csp = html.match(CSP_META);
  if (!csp) throw new Error('hoistCritical needs the CSP: run insertCsp first');
  const found = [...html.matchAll(CRITICAL)];
  if (found.length === 0) return html;
  const rank = ([, name]) => {
    const i = CRITICAL_ORDER.indexOf(name);
    return i === -1 ? CRITICAL_ORDER.length : i;
  };
  const ordered = [...found].sort((a, b) => rank(a) - rank(b)).map(([tag]) => tag);
  const rest = found.reduce((acc, [tag]) => acc.replace(tag, ''), html);
  return rest.replace(csp[0], (meta) => meta + ordered.join(''));
}

// Head order: <meta charset>, the CSP, the critical inline scripts (data-critical), then everything else.
// Each step maps the HTML string to a new one.
const STEPS = [insertCsp, hoistCritical];

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

/** robots.txt: every page may be crawled; the sitemap is given by its absolute URL. */
export function robotsTxt(baseUrl) {
  return `User-agent: *\nAllow: /\nSitemap: ${baseUrl}sitemap.xml\n`;
}

const xml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * sitemap.xml: the two pages, each with the day of the build (YYYY-MM-DD) and the same three
 * alternates as the hreflang links of their head (usePageHead.ts). The 404 page is not listed.
 */
export function sitemapXml(baseUrl, lastmod) {
  const fr = xml(baseUrl);
  const en = xml(`${baseUrl}en/`);
  const alternates = [
    ['fr', fr],
    ['en', en],
    ['x-default', fr],
  ]
    .map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}"/>\n`)
    .join('');
  const urls = [fr, en].map((loc) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n${alternates}  </url>\n`).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    `${urls}</urlset>\n`
  );
}

function htmlFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.html'))
    .map((d) => join(d.parentPath, d.name));
}

function main() {
  if (!existsSync(DIST)) throw new Error(`${DIST} does not exist: run vite-ssg build first`);
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

  const { baseUrl } = JSON.parse(readFileSync(SITE_JSON, 'utf8'));
  if (!/^https:\/\/[^/]+\/$/.test(baseUrl ?? '')) errors.push(`site.json: baseUrl must be https://host/, got ${baseUrl}`);
  else {
    writeFileSync(join(DIST, 'robots.txt'), robotsTxt(baseUrl));
    writeFileSync(join(DIST, 'sitemap.xml'), sitemapXml(baseUrl, new Date().toISOString().slice(0, 10)));
  }

  if (errors.length) {
    for (const e of errors) console.error(`postbuild: ${e}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
