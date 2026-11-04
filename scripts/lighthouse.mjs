// Lighthouse gates (`npm run test:lh`): / and /en/ of dist/, served compressed by scripts/serve.mjs as
// GitHub Pages serves them, in mobile (the default of Lighthouse: a mid-range phone on a slow 4G) and
// in desktop. Thresholds: Performance 0.98 on mobile and 1 on desktop; Accessibility, Best practices
// and SEO 1. The reports go to lighthouse/ (never committed). Run `npm run build` first.
//
// PORT: the port of the server (4173 by default, as `npm run serve`). A server already answering
// there is used as it is; otherwise scripts/serve.mjs is started for the run, then stopped.
// LH_RUNS: runs per page and form factor (3 by default); the median one is kept (Lighthouse's own rule).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse, { desktopConfig, generateReport } from 'lighthouse';
import { computeMedianRun } from 'lighthouse/core/lib/median-run.js';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'lighthouse');
const PORT = Number(process.env.PORT) || 4173;
const ORIGIN = `http://localhost:${PORT}`;
const RUNS = Math.max(1, Number(process.env.LH_RUNS) || 3);

const PAGES = [
  { path: '/', name: 'fr' },
  { path: '/en/', name: 'en' },
];
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/** Each form factor: its Lighthouse config (none is the mobile default) and its thresholds, never lowered without Anthony. */
const FORMS = [
  { name: 'mobile', config: undefined, thresholds: { performance: 0.98, accessibility: 1, 'best-practices': 1, seo: 1 } },
  { name: 'desktop', config: desktopConfig, thresholds: { performance: 1, accessibility: 1, 'best-practices': 1, seo: 1 } },
];

const answers = async () => {
  try {
    return (await fetch(ORIGIN, { method: 'HEAD' })).ok;
  } catch {
    return false;
  }
};

/** Starts scripts/serve.mjs on PORT unless a server already answers there; returns how to stop it. */
async function startServer() {
  if (await answers()) {
    console.log(`Lighthouse on ${ORIGIN} (the server already running there)`);
    return () => {};
  }
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('dist/ is not built: run `npm run build` first');
  const server = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 100 && !(await answers()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await answers())) {
    server.kill();
    throw new Error(`scripts/serve.mjs does not answer on ${ORIGIN}`);
  }
  console.log(`Lighthouse on ${ORIGIN} (scripts/serve.mjs, started for the run)`);
  return () => server.kill();
}

/** A free TCP port for the DevTools protocol of the browser. */
const freePort = () =>
  new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });

/** The audits that cost points in a category: their score and their title. */
const losses = (lhr, category) =>
  lhr.categories[category].auditRefs
    .filter((ref) => ref.weight > 0 && lhr.audits[ref.id].score !== null && lhr.audits[ref.id].score < 1)
    .map((ref) => `${ref.id} ${lhr.audits[ref.id].score} (${lhr.audits[ref.id].displayValue ?? lhr.audits[ref.id].title})`);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const stop = await startServer();
  // Playwright's own Chromium, in the new headless mode, on a fresh profile: the same browser on every machine.
  const debugPort = await freePort();
  const browser = await chromium.launch({ channel: 'chromium', args: [`--remote-debugging-port=${debugPort}`] });
  const failures = [];
  try {
    for (const form of FORMS) {
      for (const page of PAGES) {
        const runs = [];
        for (let i = 0; i < RUNS; i++) {
          const result = await lighthouse(`${ORIGIN}${page.path}`, { port: debugPort, logLevel: 'error', onlyCategories: CATEGORIES }, form.config);
          if (!result) throw new Error(`Lighthouse gave no result for ${page.path} (${form.name})`);
          runs.push(result.lhr);
        }
        const lhr = computeMedianRun(runs);
        const base = join(OUT, `${page.name}-${form.name}`);
        writeFileSync(`${base}.report.json`, JSON.stringify(lhr, null, 2));
        writeFileSync(`${base}.report.html`, generateReport(lhr, 'html'));
        const scores = CATEGORIES.map((c) => `${c} ${lhr.categories[c].score}`).join(', ');
        const all = runs.map((r) => r.categories.performance.score).join(' ');
        console.log(`${page.path.padEnd(5)} ${form.name.padEnd(8)} ${scores} (performance of the ${RUNS} runs: ${all}; ${lhr.audits['total-byte-weight'].numericValue} B transferred)`);
        for (const c of CATEGORIES) {
          const score = lhr.categories[c].score;
          if (score === null || score < form.thresholds[c]) {
            failures.push(`${page.path} ${form.name}: ${c} ${score} < ${form.thresholds[c]}: ${losses(lhr, c).join('; ') || 'no audit below 1'}`);
          }
        }
      }
    }
  } finally {
    await browser.close();
    stop();
  }
  if (failures.length) {
    for (const f of failures) console.error(`lighthouse: ${f}`);
    process.exit(1);
  }
  console.log(`Every threshold reached. Reports in ${OUT}`);
}

await main();
