// Dependency-free static server for dist/ that imitates GitHub Pages:
// directory index, 301 to the trailing slash for directories, gzip when accepted,
// 404 status with the body of 404.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// DIST_DIR serves another build folder (the populated variant of the e2e suite).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', process.env.DIST_DIR || 'dist');
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml)|image\/svg)/;

/**
 * Pages serves the site over https, where `upgrade-insecure-requests` changes nothing for same-origin
 * URLs. This server is plain http: WebKit would upgrade every asset to https://localhost and load
 * none of them (Chromium and Firefox exempt localhost). The directive is dropped from the served
 * HTML only; dist/ keeps it, and the rest of the CSP is enforced as is.
 */
export function asOverHttps(html) {
  const served = html.replace(/; upgrade-insecure-requests(?=")/, '');
  // If postbuild ever writes the directive elsewhere, WebKit would silently test a page without assets.
  if (served.includes('upgrade-insecure-requests')) {
    throw new Error('serve: upgrade-insecure-requests is still in the CSP after stripping; update asOverHttps');
  }
  return served;
}

async function resolveFile(pathname) {
  let rel;
  try {
    rel = normalize(decodeURIComponent(pathname));
  } catch {
    return null;
  }
  const full = join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  try {
    const s = await stat(full);
    if (s.isFile()) return { file: full };
    if (s.isDirectory()) {
      const index = join(full, 'index.html');
      if (existsSync(index)) return { file: index, isDirectory: true };
    }
  } catch {
    // missing path: falls through to the 404 page
  }
  return null;
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const found = await resolveFile(pathname);
  if (found?.isDirectory && !pathname.endsWith('/')) {
    // Pages redirects /en to /en/ so that relative URLs keep working.
    const { search } = new URL(req.url, 'http://localhost');
    res.writeHead(301, { location: `${pathname}/${search}`, 'content-length': 0 });
    res.end();
    return;
  }
  let file = found?.file;
  let status = 200;
  if (!file) {
    status = 404;
    file = join(ROOT, '404.html');
  }
  let body;
  try {
    body = await readFile(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  if (type.startsWith('text/html')) body = Buffer.from(asOverHttps(body.toString('utf8')));
  const headers = { 'content-type': type, 'cache-control': 'no-cache' };
  if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    body = gzipSync(body);
    headers['content-encoding'] = 'gzip';
    headers.vary = 'Accept-Encoding';
  }
  headers['content-length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
});

function main() {
  if (!existsSync(ROOT)) {
    console.error(`${ROOT} does not exist: run \`npm run build\` first.`);
    process.exit(1);
  }
  server.listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
}

// Imported by the tests (asOverHttps): the server only starts when this file is run.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
