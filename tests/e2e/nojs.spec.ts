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

    test('the back side follows the front, flat, and SW2 is not shown', async ({ page }) => {
      await expect(page.locator('.board')).not.toHaveAttribute('data-flip-ready', /.*/);
      await expect(page.locator('button.sw2')).toHaveCount(2);
      for (const button of await page.locator('button.sw2').all()) await expect(button).toBeHidden();
      // Reading order: the whole front face, then the back face, both readable and indexed.
      const order = await page.evaluate(() => {
        const h1 = document.querySelector('h1') as Element;
        const back = document.querySelector('#back-title') as Element;
        return (h1.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });
      expect(order).toBe(true);
      const title = page.locator('#back-title');
      await title.scrollIntoViewIfNeeded();
      await expect(title).toBeVisible();
      expect(await page.locator('.board__face--back').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
      expect(await page.locator('.board__face--front').evaluate((el) => el.hasAttribute('inert'))).toBe(false);
      expect(await page.locator('.board__face--back').evaluate((el) => el.hasAttribute('inert'))).toBe(false);
      // Its table holds everything, the column « Relié à » included; its parts are drawn, never live.
      expect(await page.locator('table.bom thead th').allTextContents()).toEqual(copy.back.columns);
      await expect(page.locator('table.bom tbody tr')).toHaveCount(11);
      await expect(page.locator('button.back-part')).toHaveCount(11);
      await expect(page.locator('button.back-part:not([disabled])')).toHaveCount(0);
      await expect(page.locator('.back__parts')).toHaveAttribute('aria-hidden', 'true');
    });

    test('the uptime has its static value', async ({ page }) => {
      expect(await page.locator('.uptime').evaluate((el) => el.textContent)).toBe(copy.uptime);
      await expect(page.locator('.uptime__value')).toHaveAttribute('value', '46000');
    });
  });
}
