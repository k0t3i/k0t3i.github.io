import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { EN, FR, type Copy } from '../helpers/copy';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * With the back face up, the front face is inert by design (SW2): the main landmark and the h1 of the
 * page are on it, so these two best-practice rules have nothing to find until the board is turned
 * back. Every other rule, WCAG and best practice, still applies to the back face.
 */
const FRONT_ONLY = ['landmark-one-main', 'page-has-heading-one'];

/** Violations as short strings (rule id and targets), so a failure says what and where. */
async function violations(page: Page, disabled: string[] = []): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).disableRules(disabled).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Turns the board to its back face with SW2, and waits until it is at rest, flat, the mouse away. */
async function showBack(page: Page): Promise<void> {
  await page.locator('.board__face--front button.sw2').click();
  await expect(page.locator('.board')).toHaveAttribute('data-flipped', '');
  await page.mouse.move(1, 1);
  await expect(page.locator('.board')).not.toHaveAttribute('data-turning', /.*/);
  await expect(page.locator('.board')).not.toHaveAttribute('data-tilting', /.*/);
  await expect(page.locator('#back-title')).toBeVisible();
}

// Both boards: the green one (light scheme, the default) and the black one (dark scheme).
for (const scheme of ['light', 'dark'] as const) {
  for (const copy of [FR, EN] as Copy[]) {
    const ids = [...copy.principles, ...copy.connectors].map((p) => p.id);

    test.describe(`axe on ${copy.path}, ${scheme} scheme`, () => {
      test.use({ colorScheme: scheme });

      test.beforeEach(async ({ page }) => {
        await page.goto(copy.path);
        // JP1 and SW2 are shown once the app has mounted: check the page as the visitor sees it.
        await expect(page.locator('button.jp1')).toBeVisible();
        await expect(page.locator('.board__face--front button.sw2')).toBeVisible();
      });

      test('every sheet closed', async ({ page }) => {
        expect(await violations(page)).toEqual([]);
      });

      // The other side of the board.
      test('back face shown', async ({ page }) => {
        await showBack(page);
        await expect(page.locator('.board__face--back button.sw2')).toBeFocused();
        expect(await violations(page, FRONT_ONLY)).toEqual([]);
      });

      test('back face shown on a phone-sized window', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await showBack(page);
        expect(await violations(page, FRONT_ONLY)).toEqual([]);
      });

      // A part of the back face pinned: the part, its row, its traces and its neighbours lit.
      for (const viewport of [null, { width: 390, height: 844 }]) {
        test(`back face shown, a part pinned${viewport ? ' on a phone-sized window' : ''}`, async ({ page }) => {
          if (viewport) await page.setViewportSize(viewport);
          await showBack(page);
          const u14 = page.locator('button.back-part[data-ref="U14"]');
          await u14.click();
          await expect(u14).toHaveAttribute('aria-pressed', 'true');
          await page.mouse.move(1, 1);
          await expect(page.locator('section.board__face--back')).toHaveAttribute('data-active', 'U14');
          // Wait for the light to settle: a half-lit row would lower the measured contrast.
          await page.locator('section.board__face--back').evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
          expect(await violations(page, FRONT_ONLY)).toEqual([]);
        });
      }

      for (const id of ids) {
        test(`sheet ${id} open`, async ({ page }) => {
          const sheet = page.locator(`#sheet-${id}`);
          await page.locator(`.part__trigger[popovertarget="sheet-${id}"]`).click();
          await expect(sheet).toBeVisible();
          // Wait for the opening transition: half-faded text would lower the measured contrast.
          await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
          expect(await violations(page)).toEqual([]);
        });
      }
    });
  }
}
