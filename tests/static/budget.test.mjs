import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distFiles } from '../helpers/pages.mjs';
import { firstLoad, jsLoadedBy, wireSize } from '../helpers/load.mjs';

// The weight budgets of the site, on the output of `npm run build`, in bytes on the wire: text
// gzip -9 (as served compressed), fonts and images as they are (tests/helpers/load.mjs). They keep the
// page compatible with the Lighthouse scores (scripts/lighthouse.mjs). Never raised without Anthony.
// JS raised from 60 to 62 KB with Anthony’s approval of 2026-11-04 (revision 7: two more projects
// on the board, J3 and J4), once the savings found were not enough: 62 KB is the cap he approved.
// CSS raised from 12 to 13 KB with Anthony’s approval of 2026-11-04 (revision 8: the workbench mat
// of the page, its wave and its glow, then the retro mode of the mini-game), once the savings found
// were not enough: 13 KB is the cap he approved.
// JS raised from 62 to 66 KB with Anthony’s approval of 2026-11-04 (revision 8: the glow of the page,
// the code of the easter egg and its mini-game, the game itself a lazy chunk counted here too), once
// the savings found were not enough (Vite builds its preload helper in with any dynamic import):
// 66 KB is the cap he approved.
// JS raised from 66 to 72 KB with Anthony’s approval of 2026-11-04, as the brief of Task 18 grants it
// (revision 10: the test keypad, its places and its entry points into the code and the game), once the
// savings found were not enough: 72 KB is the cap he approved.
// CSS raised from 13 to 14 KB with Anthony’s approval of 2026-11-04, as the brief of Task 18 grants it
// and the brief of Task 20 sets it (the SON switch of the game mode, built on the rules of SW2, its
// inner parts in SW2's own classes), once the savings found were not enough: 14 KB is the cap he approved.
const KB = 1024;
const BUDGET = { page: 20 * KB, css: 14 * KB, js: 72 * KB, wide: 170 * KB };

/** The two home pages: the JavaScript and the first load are the same budget for both languages. */
const HOMES = ['/', '/en/'];

const sum = (sizes) => sizes.reduce((total, n) => total + n, 0);
const list = (rows) => rows.map(({ path, bytes }) => `${path} ${bytes} B`).join(', ');

test('every HTML page under 20 KB', (t) => {
  const pages = distFiles().filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 3, 'the pages are not built');
  for (const file of pages) {
    const bytes = wireSize(`/${file}`);
    t.diagnostic(`${file}: ${bytes} B of ${BUDGET.page}`);
    assert.ok(bytes <= BUDGET.page, `${file}: ${bytes} B gzip -9 > ${BUDGET.page} B`);
  }
});

test('all the CSS under 14 KB', (t) => {
  const sheets = distFiles().filter((f) => f.endsWith('.css'));
  assert.ok(sheets.length > 0, 'no stylesheet built');
  const total = sum(sheets.map((f) => wireSize(`/${f}`)));
  t.diagnostic(`CSS: ${total} B of ${BUDGET.css}`);
  assert.ok(total <= BUDGET.css, `${sheets.join(', ')}: ${total} B gzip -9 > ${BUDGET.css} B`);
});

test('the JavaScript loaded by / under 72 KB (entry and static imports)', (t) => {
  for (const page of HOMES) {
    const rows = jsLoadedBy(page).map((path) => ({ path, bytes: wireSize(path) }));
    assert.ok(rows.length > 0, `${page} loads no JavaScript`);
    const total = sum(rows.map((r) => r.bytes));
    t.diagnostic(`JS of ${page}: ${total} B of ${BUDGET.js} (${list(rows)})`);
    assert.ok(total <= BUDGET.js, `${page}: ${total} B gzip -9 > ${BUDGET.js} B (${list(rows)})`);
  }
});

test('all the JavaScript of the build under 72 KB too, lazy chunks included', (t) => {
  // A chunk split off from / (a dynamic import) leaves the test above: the site's JavaScript as a whole stays in budget.
  const scripts = distFiles().filter((f) => /^assets\/[^/]+\.m?js$/.test(f));
  assert.ok(scripts.length > 0, 'no JavaScript built');
  const rows = scripts.map((f) => ({ path: `/${f}`, bytes: wireSize(`/${f}`) }));
  const total = sum(rows.map((r) => r.bytes));
  t.diagnostic(`all the JS: ${total} B of ${BUDGET.js} (${list(rows)})`);
  assert.ok(total <= BUDGET.js, `${total} B gzip -9 > ${BUDGET.js} B (${list(rows)})`);
  // Nothing outside dist/assets/ is a script but the inline ones of the pages (budgeted with them).
  assert.deepEqual(distFiles().filter((f) => /\.m?js$/.test(f) && !scripts.includes(f)), []);
});

test('the first load of the wide board under 170 KB', (t) => {
  for (const page of HOMES) {
    const rows = firstLoad(page);
    // The page, its script, its stylesheet, both fonts and the art of the board at least.
    assert.ok(rows.length >= 6, `${page}: ${list(rows)}`);
    const total = sum(rows.map((r) => r.bytes));
    t.diagnostic(`first load of ${page}: ${total} B of ${BUDGET.wide} (${list(rows)})`);
    assert.ok(total <= BUDGET.wide, `${page}: ${total} B > ${BUDGET.wide} B (${list(rows)})`);
  }
});
