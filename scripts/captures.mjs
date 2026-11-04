// Screenshots of the built site for the visual review, outside the published files: every page in
// every size, state, version (green, black) and engine, then a contact sheet, index.html, grouped by
// page, state and version, to open from disk (its links are relative).
//
//   node scripts/captures.mjs [folder]    builds the site, serves dist/ (scripts/serve.mjs) and writes the
//                                         PNGs and index.html into folder (captures/ by default, ignored).
//   PORT        the port of the local server (4195 by default, another free one if it is taken)
//   ENGINES     a subset of the engines, e.g. ENGINES=chrome,firefox (all three by default)
//   DIST_DIR    as for the build
//
// The pages are those of a visitor with a mouse and motion welcome, the power-on already played: at
// rest, with R1 under the pointer (DISP1 shows its readout), with the sheet of J1 open, and on the
// uptime screen of SW1; the 404 page at rest. In Chrome only, at three sizes: the back face (SW2) at
// rest and with U14 under the pointer, and the Morse screen with LED1 lit. Running motion is captured
// as it ends (Playwright: animations disabled). Errors and warnings of the console, from the load to
// the capture, are listed on the sheet (the capture itself makes WebKit report its own style, which
// the CSP of the site refuses: that one is not the site's).
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright-core';
import { withServer } from './local-server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, process.env.DIST_DIR || 'dist');
const PORT = Number(process.env.PORT) || 4195;
const OUT = resolve(process.argv[2] || join(ROOT, 'captures'));

const ENGINES = [
  { name: 'chrome', type: chromium, launch: { channel: 'chrome' } },
  { name: 'firefox', type: firefox, launch: {} },
  { name: 'webkit', type: webkit, launch: {} },
].filter((e) => !process.env.ENGINES || process.env.ENGINES.split(',').includes(e.name));

const PAGES = [
  { name: 'fr', path: '/', locale: 'fr-FR', home: true },
  { name: 'en', path: '/en/', locale: 'en-GB', home: true },
  { name: '404', path: '/404.html', locale: 'fr-FR', home: false },
];
const SIZES = [
  [1600, 900],
  [1264, 800],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [320, 640],
].map(([width, height]) => ({ width, height }));
/** The sizes of the states captured in Chrome only. */
const FEW = ['1600x900', '768x1024', '390x844'];
const THEMES = [
  { name: 'green', scheme: 'light' },
  { name: 'dark', scheme: 'dark' },
];

const front = (selector) => `.board__face--front ${selector}`;

/** Console messages known and expected, shown apart on the sheet: why each one is not a fault. */
const EXPECTED = [
  {
    match: /Preload of \S+\/board-wide-\S+\.svg was ignored .*non-matching .media. attribute/,
    why: 'Firefox: the art of the wide board is preloaded for windows of 79rem and up only (media), as meant',
  },
];
const expected = (text) => EXPECTED.find((e) => e.match.test(text));

/** In the page, frame by frame: resolves once `read` gives the same value three frames in a row. */
const still = (page, selector, read) =>
  page.waitForFunction(
    ({ selector, read }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const now = read === 'tilt' ? ['--tilt-x', '--tilt-y'].map((p) => el.style.getPropertyValue(p)).join() : [r.x, r.y, r.width, r.height].join();
      const w = window;
      w.capturesSeen = [...(w.capturesSeen ?? []), now].slice(-3);
      const done = w.capturesSeen.length === 3 && w.capturesSeen.every((v) => v === now);
      if (done) w.capturesSeen = [];
      return done;
    },
    { selector, read },
    { polling: 'raf' },
  );

/** The board has come to its angle, wherever the pointer is. */
const leaned = (page) => still(page, '.board__body', 'tilt');

/** The pointer off the board (the page margin), and the board flat again. */
async function away(page) {
  await page.mouse.move(1, 1);
  await page.waitForFunction(() => !document.querySelector('div.board')?.hasAttribute('data-tilting'), null, { polling: 'raf' });
}

const screen = (page, name) => page.waitForFunction((name) => document.querySelector('.disp__pixels')?.getAttribute('data-screen') === name, name, { polling: 'raf' });

/** The page as a visitor has it once loaded: mounted (hydrated), its fonts and its images ready. */
async function ready(page) {
  await page.waitForFunction(() => Boolean(document.querySelector('#app')?.__vue_app__));
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].filter((i) => i.loading !== 'lazy' || i.complete).map((i) => i.decode().catch(() => {}))]));
}

/** Turns the board to its back face and waits for the end of the turn. */
async function turned(page) {
  await page.click(front('button.sw2'));
  await page.waitForFunction(() => {
    const board = document.querySelector('div.board');
    return board?.hasAttribute('data-flipped') && !board.hasAttribute('data-turning');
  });
  await away(page);
}

/**
 * The states: what to do on the loaded page, and whether the capture is of the whole page or of the
 * window (a sheet is seen in the window it opens in). `few`: Chrome only, at the sizes of FEW.
 */
const STATES = [
  { name: 'rest', full: true, run: async () => {} },
  {
    name: 'r1-hover',
    full: true,
    run: async (page) => {
      await page.hover(front('.part__trigger[popovertarget="sheet-r1"]'));
      await screen(page, 'readout');
      await leaned(page);
    },
  },
  {
    name: 'j1-open',
    full: false,
    run: async (page) => {
      await page.click(front('.part__trigger[popovertarget="sheet-j1"]'));
      const sheet = page.locator('#sheet-j1');
      await sheet.waitFor({ state: 'visible' });
      await sheet.locator('img').evaluate((img) => img.decode());
      await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      await still(page, '#sheet-j1', 'box');
    },
  },
  {
    name: 'sw1-uptime',
    full: true,
    run: async (page) => {
      await page.click(front('button.sw1'));
      await away(page);
      await screen(page, 'uptime');
    },
  },
  {
    name: 'back-rest',
    full: true,
    few: true,
    run: turned,
  },
  {
    name: 'back-u14',
    full: true,
    few: true,
    run: async (page) => {
      await turned(page);
      await page.hover('button.back-part[data-ref="U14"]');
      await page.waitForFunction(() => document.querySelector('.board__face--back')?.getAttribute('data-active') === 'U14');
      await leaned(page);
    },
  },
  {
    name: 'morse-led-on',
    full: true,
    few: true,
    holdTimers: true,
    run: async (page) => {
      await page.click(front('button.sw1'));
      await page.click(front('button.sw1'));
      await away(page);
      await screen(page, 'morse');
      // LED1 lit: from that very frame the timers of the page are held (the code waits), so that the
      // capture shows it lit; the tilt and the paint go on.
      await page.waitForFunction(
        () => {
          if (document.querySelector('#disp1')?.getAttribute('data-led') !== 'on') return false;
          window.capturesHold = true;
          return true;
        },
        null,
        { polling: 'raf' },
      );
    },
  },
];

/** Every timer of the page can be held (window.capturesHold): its callback then waits. */
function holdableTimers() {
  const later = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...args) =>
    later(function run() {
      if (window.capturesHold) return later(run, 50);
      return typeof fn === 'function' ? fn(...args) : undefined;
    }, ms);
}

/** The captures of one engine, one after the other; each entry says what was captured, or why not. */
async function captureEngine(engine, origin) {
  const browser = await engine.type.launch(engine.launch);
  const shots = [];
  try {
    for (const target of PAGES) {
      for (const theme of THEMES) {
        for (const size of SIZES) {
          const sizeName = `${size.width}x${size.height}`;
          const states = target.home ? STATES.filter((s) => !s.few || (engine.name === 'chrome' && FEW.includes(sizeName))) : STATES.slice(0, 1);
          for (const state of states) {
            const file = `${target.name}/${state.name}/${theme.name}/${engine.name}-${sizeName}.png`;
            const shot = { page: target.name, state: state.name, theme: theme.name, engine: engine.name, size: sizeName, file, console: [], expected: [] };
            shots.push(shot);
            const context = await browser.newContext({
              viewport: size,
              deviceScaleFactor: 1,
              colorScheme: theme.scheme,
              reducedMotion: 'no-preference',
              locale: target.locale,
            });
            try {
              await context.addInitScript((name) => {
                localStorage.setItem('k0t3i.theme', name);
                sessionStorage.setItem('k0t3i.booted', '1');
              }, theme.name);
              if (state.holdTimers) await context.addInitScript(holdableTimers);
              const page = await context.newPage();
              let shooting = false;
              const note = (text) => !shooting && (expected(text) ? shot.expected : shot.console).push(text);
              page.on('console', (m) => ['error', 'warning'].includes(m.type()) && note(`${m.type()}: ${m.text()}`));
              page.on('pageerror', (e) => note(`pageerror: ${e.message}`));
              await page.goto(`${origin}${target.path}`, { waitUntil: 'networkidle' });
              await ready(page);
              await state.run(page);
              mkdirSync(dirname(join(OUT, file)), { recursive: true });
              shooting = true;
              await page.screenshot({ path: join(OUT, file), fullPage: state.full, animations: 'disabled', caret: 'hide' });
            } catch (error) {
              shot.error = error.message.split('\n')[0];
              console.error(`captures: ${file}: ${shot.error}`);
            } finally {
              await context.close();
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  return shots;
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The contact sheet: a section per page, then per state, then per version; each capture with its engine and size. */
function contactSheet(shots, started) {
  const rank = (s) => [PAGES.findIndex((p) => p.name === s.page), STATES.findIndex((t) => t.name === s.state), THEMES.findIndex((t) => t.name === s.theme)];
  const groups = new Map();
  for (const s of [...shots].sort((a, b) => rank(a).reduce((d, v, i) => d || v - rank(b)[i], 0))) {
    const key = `${s.page}|${s.state}|${s.theme}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const order = (list, key, values) => [...list].sort((a, b) => values.indexOf(a[key]) - values.indexOf(b[key]));
  const sizes = SIZES.map((s) => `${s.width}x${s.height}`);
  const engines = ENGINES.map((e) => e.name);
  let body = '';
  let lastPage = '';
  let lastState = '';
  for (const [key, list] of groups) {
    const [page, state, theme] = key.split('|');
    if (page !== lastPage) body += `<h2 id="${page}">${escape(PAGES.find((p) => p.name === page).path)} (${page})</h2>\n`;
    if (page !== lastPage || state !== lastState) body += `<h3>${escape(state)}</h3>\n`;
    lastPage = page;
    lastState = state;
    const figures = order(order(list, 'engine', engines), 'size', sizes)
      .map((s) => {
        const notes = [s.error && `failed: ${s.error}`, ...s.console].filter(Boolean);
        const known = [...new Set(s.expected.map((t) => expected(t).why))];
        const img = s.error ? '<div class="missing">no capture</div>' : `<a href="${s.file}"><img src="${s.file}" alt="" loading="lazy"></a>`;
        const lines = [...notes.map((n) => `<span class="note">${escape(n)}</span>`), ...known.map((k) => `<span class="known">expected: ${escape(k)}</span>`)];
        return `<figure>${img}<figcaption>${s.engine} · ${s.size.replace('x', '×')}${lines.map((l) => `<br>${l}`).join('')}</figcaption></figure>`;
      })
      .join('\n');
    body += `<h4>${escape(page)} · ${escape(state)} · ${theme}</h4>\n<div class="grid">\n${figures}\n</div>\n`;
  }
  const failed = shots.filter((s) => s.error).length;
  const noisy = shots.filter((s) => s.console.length).length;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Captures, ${started.toISOString().slice(0, 16).replace('T', ' ')} UTC</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; background: #f4f4f2; color: #1b1b1b; }
  h2 { margin-top: 48px; border-bottom: 2px solid #1b1b1b; }
  h3 { margin: 28px 0 4px; }
  h4 { margin: 16px 0 8px; font-weight: 500; color: #444; }
  .grid { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
  figure { margin: 0; width: 240px; }
  figure img { display: block; max-width: 240px; max-height: 420px; border: 1px solid #ccc; background: #fff; }
  figcaption { font-size: 12px; margin-top: 4px; }
  .note { color: #a40000; }
  .known { color: #666; }
  .missing { width: 240px; height: 120px; display: grid; place-items: center; border: 1px dashed #a40000; color: #a40000; }
</style>
</head>
<body>
<h1>Captures</h1>
<p>${shots.length} captures (${failed} failed, ${noisy} with unexpected console errors or warnings), ${started.toISOString()}. Engines: ${engines.join(', ')}.
Pages: ${PAGES.map((p) => `<a href="#${p.name}">${p.path}</a>`).join(', ')}. Window captures for an open sheet, whole pages otherwise; 1 CSS pixel per pixel.</p>
${body}
</body>
</html>
`;
}

async function main() {
  const started = new Date();
  const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) throw new Error('captures: the build failed');
  // Only what this script writes is replaced.
  for (const name of [...PAGES.map((p) => p.name), 'index.html']) rmSync(join(OUT, name), { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const shots = await withServer({ port: PORT, dist: DIST }, async (origin) => {
    console.log(`captures: ${ENGINES.map((e) => e.name).join(', ')} on ${origin}, into ${OUT}`);
    return (await Promise.all(ENGINES.map((engine) => captureEngine(engine, origin)))).flat();
  });
  writeFileSync(join(OUT, 'index.html'), contactSheet(shots, started));
  const failed = shots.filter((s) => s.error);
  const noisy = shots.filter((s) => s.console.length);
  for (const s of noisy) console.log(`captures: console of ${s.file}:\n  ${s.console.join('\n  ')}`);
  const known = shots.filter((s) => s.expected.length).length;
  console.log(`captures: ${shots.length - failed.length} of ${shots.length} in ${Math.round((Date.now() - started) / 1000)} s; ${noisy.length} with console errors or warnings, ${known} with expected ones only. Sheet: ${join(OUT, 'index.html')}`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
