import { expect, test, type Page } from '@playwright/test';

const IDS = ['r1', 'c1', 'led1', 'd1', 'u2', 'j1', 'j2', 'j3'];
const trigger = (page: Page, id: string) => page.locator(`.part__trigger[popovertarget="sheet-${id}"]`);
const isOpen = (page: Page, id: string) =>
  page.evaluate((i) => document.getElementById(`sheet-${i}`)?.matches(':popover-open') ?? false, id);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('tab order', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile, 'no keyboard on touch devices');
  // WebKit skips links on Tab unless the platform setting "Press Tab to highlight each item" is on
  // (Alt+Tab, the macOS shortcut, does nothing in Playwright's WebKit). That is not a page bug: on WebKit
  // the order is checked without the links, and the links are checked by focus() below.
  const withLinks = browserName !== 'webkit';
  const tab = 'Tab';
  const seen: string[] = [];
  for (let i = 0; i < (withLinks ? 12 : 9); i++) {
    await page.keyboard.press(tab);
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'none';
        if (el.matches('.skip-link')) return 'skip';
        if (el.matches('.lang__link')) return `lang:${el.getAttribute('hreflang')}`;
        if (el.matches('.sw1')) return 'sw1';
        return el.getAttribute('popovertarget') ?? el.tagName;
      }),
    );
  }
  const buttons = ['sw1', ...IDS.map((id) => `sheet-${id}`)];
  expect(seen).toEqual(withLinks ? ['skip', 'lang:fr', 'lang:en', ...buttons] : buttons);
});

test('focusable elements are in the DOM order, with no positive tabindex', async ({ page }) => {
  const order = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('a[href], button, [tabindex]')]
      .filter((el) => !el.closest('.sheet') && el.tabIndex >= 0)
      .map((el) => (el.matches('.skip-link') ? 'skip' : (el.getAttribute('hreflang') ?? el.getAttribute('popovertarget') ?? el.className))),
  );
  expect(order).toEqual(['skip', 'fr', 'en', 'sw1', ...IDS.map((id) => `sheet-${id}`)]);
  expect(await page.locator('[tabindex]:not([tabindex="-1"])').count()).toBe(0);
});

test('enter opens the sheet and focuses its title', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no keyboard on touch devices');
  await trigger(page, 'r1').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sheet-r1')).toBeVisible();
  expect(await isOpen(page, 'r1')).toBe(true);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('sheet-r1-title');
});

test('escape closes and returns focus to the trigger', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no keyboard on touch devices');
  await trigger(page, 'r1').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sheet-r1')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await isOpen(page, 'r1')).toBe(false);
  await expect(trigger(page, 'r1')).toBeFocused();
});

test('the close button returns focus to the trigger', async ({ page }) => {
  // From the keyboard: Safari does not focus a button on click, so on click there is nothing to restore.
  await trigger(page, 'r1').focus();
  await trigger(page, 'r1').press('Enter');
  await expect(page.locator('#sheet-r1')).toBeVisible();
  await page.locator('#sheet-r1 .sheet__close').focus();
  await page.keyboard.press('Enter');
  expect(await isOpen(page, 'r1')).toBe(false);
  await expect(trigger(page, 'r1')).toBeFocused();
});

test('one sheet at a time', async ({ page }) => {
  await trigger(page, 'r1').click();
  await expect(page.locator('#sheet-r1')).toBeVisible();
  // Opening another popover="auto" closes the first one.
  await page.evaluate(() => document.getElementById('sheet-c1')?.showPopover());
  await expect(page.locator('#sheet-c1')).toBeVisible();
  const open = await page.evaluate(() => [...document.querySelectorAll('.sheet:popover-open')].map((s) => s.id));
  expect(open).toEqual(['sheet-c1']);
});

test('the J1 image loads only when the sheet opens', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (/\/kit-urgence-\d+\./.test(r.url())) requests.push(r.url());
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(requests).toHaveLength(0);
  await trigger(page, 'j1').click();
  await expect.poll(() => requests.length).toBe(1);
});

test('SW1 is focusable and does nothing yet', async ({ page }) => {
  const sw1 = page.locator('button.sw1');
  await sw1.focus();
  await expect(sw1).toBeFocused();
  await sw1.click();
  await expect(page.locator('.disp__caption')).toHaveText('DISP1 · avatar');
});
