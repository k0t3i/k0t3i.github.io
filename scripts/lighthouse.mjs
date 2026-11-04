// Lighthouse gates (`npm run test:lh`): / and /en/ of dist/, served compressed by scripts/serve.mjs as
// GitHub Pages serves them, in mobile (the default of Lighthouse: a mid-range phone on a slow 4G) and
// in desktop. Thresholds: Performance 0.98 on mobile and 1 on desktop; Accessibility, Best practices
// and SEO 1. The reports go to lighthouse/ (never committed). Run `npm run build` first.
//
// PORT: the port of the server (4173 by default, as `npm run serve`). A server already there is used
// only if it serves this very build of dist/ (its / is dist/index.html, gzip-compressed); otherwise
// scripts/serve.mjs is started for the run, on PORT or on a free port if PORT is taken, then stopped.
// LH_RUNS: runs per page and form factor (3 by default); the median one is kept (Lighthouse's own rule).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse, { desktopConfig, generateReport } from 'lighthouse';
import { computeMedianRun } from 'lighthouse/core/lib/median-run.js';
import { chromium } from 'playwright-core';
import { freePort, withServer } from './local-server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, process.env.DIST_DIR || 'dist');
const OUT = join(ROOT, 'lighthouse');
const PORT = Number(process.env.PORT) || 4173;
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

/** The audits that cost points in a category: their score and their title. */
const losses = (lhr, category) =>
  lhr.categories[category].auditRefs
    .filter((ref) => ref.weight > 0 && lhr.audits[ref.id].score !== null && lhr.audits[ref.id].score < 1)
    .map((ref) => `${ref.id} ${lhr.audits[ref.id].score} (${lhr.audits[ref.id].displayValue ?? lhr.audits[ref.id].title})`);

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/ is not built: run `npm run build` first');
  mkdirSync(OUT, { recursive: true });
  const failures = [];
  // The server is stopped whatever fails below, from the free port to the last run.
  await withServer({ port: PORT, dist: DIST, reuse: true }, async (origin, { reused }) => {
    console.log(`Lighthouse on ${origin} (${reused ? 'the server already serving this build there' : 'scripts/serve.mjs, started for the run'})`);
    // Playwright's own Chromium, in the new headless mode, on a fresh profile: the same browser on every machine.
    const debugPort = await freePort();
    const browser = await chromium.launch({ channel: 'chromium', args: [`--remote-debugging-port=${debugPort}`] });
    try {
      for (const form of FORMS) {
        for (const page of PAGES) {
          const runs = [];
          for (let i = 0; i < RUNS; i++) {
            const result = await lighthouse(`${origin}${page.path}`, { port: debugPort, logLevel: 'error', onlyCategories: CATEGORIES }, form.config);
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
    }
  });
  if (failures.length) {
    for (const f of failures) console.error(`lighthouse: ${f}`);
    process.exit(1);
  }
  console.log(`Every threshold reached. Reports in ${OUT}`);
}

await main();
