import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { EN, FR, type Copy } from '../helpers/copy';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Violations as short strings (rule id and targets), so a failure says what and where. */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

for (const copy of [FR, EN] as Copy[]) {
  const ids = [...copy.principles, ...copy.connectors].map((p) => p.id);

  test.describe(`axe on ${copy.path}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(copy.path);
    });

    test('every sheet closed', async ({ page }) => {
      expect(await violations(page)).toEqual([]);
    });

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
