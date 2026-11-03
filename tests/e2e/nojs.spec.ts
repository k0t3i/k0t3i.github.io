import { expect, test } from '@playwright/test';
import { EN, FR, type Copy } from '../helpers/copy';

test.use({ javaScriptEnabled: false });

for (const copy of [FR, EN] as Copy[]) {
  test.describe(`without JavaScript, ${copy.path}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(copy.path);
    });

    test('the content is readable', async ({ page }) => {
      await expect(page.locator('h1')).toBeVisible();
      for (const part of copy.principles) {
        await expect(page.locator(`#${copy.sections.principles.id} .part__label`, { hasText: part.label })).toBeVisible();
      }
      await expect(page.locator('.hero__sub')).toBeVisible();
    });

    test('a sheet opens on click', async ({ page }) => {
      const r1 = copy.principles[0];
      await page.locator('.part__trigger[popovertarget="sheet-r1"]').click();
      await expect(page.locator('#sheet-r1 .sheet__body')).toBeVisible();
      await expect(page.locator('#sheet-r1 .sheet__body')).toHaveText(r1?.body ?? '');
      await page.locator('#sheet-r1 .sheet__close').click();
      await expect(page.locator('#sheet-r1')).toBeHidden();
    });

    test('the J1 sheet opens with its pitch and link, without the image', async ({ page }) => {
      const j1 = copy.connectors[0];
      await page.locator('.part__trigger[popovertarget="sheet-j1"]').click();
      await expect(page.locator('#sheet-j1 .sheet__body')).toHaveText(j1?.body ?? '');
      await expect(page.locator('#sheet-j1 a.sheet__link')).toHaveAttribute('href', j1?.link?.href ?? '');
      // The picture is rendered by the script on the first opening: none without JavaScript.
      await expect(page.locator('#sheet-j1 picture')).toHaveCount(0);
    });

    test('the uptime has its static value', async ({ page }) => {
      expect(await page.locator('.uptime').evaluate((el) => el.textContent)).toBe(copy.uptime);
      await expect(page.locator('.uptime__value')).toHaveAttribute('value', '46000');
    });
  });
}
