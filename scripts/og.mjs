// The share images (Open Graph) of / and /en/: the wide board, green (the light scheme, the default
// one), at rest. This script builds the site, serves dist/ with scripts/serve.mjs, and captures each
// page in Chromium: the board of a 1600 x 900 window, with reduced motion and the power-on already
// played (k0t3i.booted). Each capture is framed at the ratio of a link preview (1200 x 630, 1.905:1),
// centred on the board, then encoded by the browser as a JPEG of quality 85, 150 KB at most.
// Output: public/img/og-{fr,en}.jpg, copied to dist/img/ so that the build just made serves them too.
//
//   node scripts/og.mjs        PORT: the port of the local server (4174 by default); DIST_DIR as for the build.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, process.env.DIST_DIR || 'dist');
const PORT = Number(process.env.PORT) || 4174;
const ORIGIN = `http://localhost:${PORT}`;

/*
 * The board of a 1600 x 900 window fills it but for 18 px above and below, and its shadow runs out
 * of it. Its size follows the width of the window only (wide.css) and it is centred in the height:
 * the capture is that window with ROOM px more page above and below, the same board with room for
 * its shadow and for a margin that survives a 2:1 crop of the preview (X).
 */
const WINDOW = { width: 1600, height: 900 };
const ROOM = 50;
const VIEWPORT = { width: WINDOW.width, height: WINDOW.height + 2 * ROOM };
const OUT = { width: 1200, height: 630 };
const QUALITY = 0.85;
const BUDGET = 150 * 1024;
const PAGES = [
  { lang: 'fr', path: '/', locale: 'fr-FR' },
  { lang: 'en', path: '/en/', locale: 'en-GB' },
];

/**
 * The part of a capture that becomes the image: the ratio of the output, as tall as the capture,
 * centred on the board. The board (16:9) is narrower than 1.905:1, so the frame goes past the
 * capture on both sides: the flat colour of the page fills it there, as a wider window would show
 * it. Nothing of the board, its edge or its shadow is cut. In capture pixels.
 */
export function frameOf(board, capture, out) {
  const height = capture.height;
  const width = (height * out.width) / out.height;
  return {
    x: board.x + board.width / 2 - width / 2,
    y: board.y + board.height / 2 - height / 2,
    width,
    height,
  };
}

/** Waits until the server answers, or fails if it stopped or takes more than 10 s. */
async function waitForServer(server) {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`og: the server stopped (exit ${server.exitCode})`);
    try {
      if ((await fetch(ORIGIN)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`og: no answer from ${ORIGIN}`);
}

/** The board of the page (its box) and the colour of the page around it. */
const measure = (page) =>
  page.evaluate(async () => {
    // A frame after the last change of the window, so that the layout is that of its size.
    await new Promise((r) => requestAnimationFrame(() => r()));
    const r = document.querySelector('.board').getBoundingClientRect();
    return {
      board: { x: r.x, y: r.y, width: r.width, height: r.height },
      background: getComputedStyle(document.body).backgroundColor,
    };
  });

/** The page at rest, as captured: its board, the colour of the page around it, and a PNG of the window. */
async function capture(browser, { path, locale }) {
  const context = await browser.newContext({
    viewport: WINDOW,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    // The language of the page: / redirects other languages to /en/.
    locale,
  });
  await context.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));
  const page = await context.newPage();
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).pathname !== path) throw new Error(`og: ${path} went to ${page.url()}`);
  // Mounted (JP1 and SW2 are shown then), fonts and images ready: the page as a visitor sees it.
  await page.locator('button.jp1').waitFor({ state: 'visible' });
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((img) => img.decode())]));
  const inWindow = await measure(page);
  // The same board, with room around it (see ROOM).
  await page.setViewportSize(VIEWPORT);
  const { board, background } = await measure(page);
  if (board.width !== inWindow.board.width || board.height !== inWindow.board.height) {
    throw new Error(`og: the board of ${path} changed with the height of the window`);
  }
  const png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  await context.close();
  return { board, background, png };
}

/** Frames, scales and encodes one capture in the browser (a canvas): the JPEG, as a Buffer. */
async function encode(page, { board, background, png }) {
  const frame = frameOf(board, VIEWPORT, OUT);
  const base64 = await page.evaluate(
    async ({ png, frame, out, background, quality }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const canvas = new OffscreenCanvas(out.width, out.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const scale = out.width / frame.width;
      ctx.drawImage(bitmap, -frame.x * scale, -frame.y * scale, bitmap.width * scale, bitmap.height * scale);
      const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
      let binary = '';
      for (const byte of jpeg) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { png: png.toString('base64'), frame, out: OUT, background, quality: QUALITY },
  );
  return Buffer.from(base64, 'base64');
}

async function main() {
  // Nothing may answer on the port yet: the capture would be of another server.
  if (await fetch(ORIGIN).then(() => true, () => false)) throw new Error(`og: ${ORIGIN} is already in use, set PORT`);

  const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) throw new Error('og: the build failed');

  const server = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  const browser = await chromium.launch();
  try {
    await waitForServer(server);
    // A blank page, without the CSP of the site, to frame and encode the captures.
    const encoder = await browser.newPage();
    const images = [];
    for (const target of PAGES) images.push({ ...target, jpeg: await encode(encoder, await capture(browser, target)) });
    // Every image within budget, or none is written.
    for (const { lang, jpeg } of images) {
      if (jpeg.length > BUDGET) throw new Error(`og: og-${lang}.jpg would be ${jpeg.length} bytes, over ${BUDGET}`);
    }
    mkdirSync(join(DIST, 'img'), { recursive: true });
    for (const { lang, jpeg } of images) {
      const file = join(ROOT, 'public', 'img', `og-${lang}.jpg`);
      writeFileSync(file, jpeg);
      copyFileSync(file, join(DIST, 'img', `og-${lang}.jpg`));
      console.log(`og: public/img/og-${lang}.jpg, ${OUT.width} x ${OUT.height}, ${jpeg.length} bytes`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
