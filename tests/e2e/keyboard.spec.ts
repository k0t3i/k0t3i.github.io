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
  for (let i = 0; i < (withLinks ? 14 : 11); i++) {
    await page.keyboard.press(tab);
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'none';
        if (el.matches('.skip-link')) return 'skip';
        if (el.matches('.lang__link')) return `lang:${el.getAttribute('hreflang')}`;
        if (el.matches('.sw1')) return 'sw1';
        if (el.matches('.jp1')) return 'jp1';
        if (el.matches('.sw2')) return 'sw2';
        return el.getAttribute('popovertarget') ?? el.tagName;
      }),
    );
  }
  // The SW2 of the back face is inert while the front face is up: out of the tab order.
  const buttons = ['jp1', 'sw2', 'sw1', ...IDS.map((id) => `sheet-${id}`)];
  expect(seen).toEqual(withLinks ? ['skip', 'lang:fr', 'lang:en', ...buttons] : buttons);
});

test('focusable elements are in the DOM order, with no positive tabindex', async ({ page }) => {
  const order = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('a[href], button, [tabindex]')]
      .filter((el) => !el.closest('.sheet, [inert]') && el.tabIndex >= 0)
      .map((el) => (el.matches('.skip-link') ? 'skip' : (el.getAttribute('hreflang') ?? el.getAttribute('popovertarget') ?? el.className))),
  );
  expect(order).toEqual(['skip', 'fr', 'en', 'jp1', 'sw2', 'sw1', ...IDS.map((id) => `sheet-${id}`)]);
  // Only the roving tab stop of the parts of the back face sets a tabindex, and never above 0.
  expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[tabindex]')].filter((el) => el.tabIndex > 0).length)).toBe(0);
  expect(await page.locator('[tabindex="0"]').evaluateAll((els) => els.map((el) => el.matches('button.back-part')))).toEqual([true]);
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

/** Whether what is drawn at the centre of an element is something else (a sheet over it, say). */
const coveredAtCentre = (page: Page, id: string) =>
  trigger(page, id).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !hit || !el.contains(hit);
  });

for (const viewport of [
  { width: 1600, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`focus leaving an open sheet closes it: the part it lands on is never under it (${viewport.width}px)`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'no keyboard on touch devices');
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('button.jp1')).toBeVisible();
    const title = () => page.evaluate(() => document.activeElement?.id);
    // Tab past the Close button of D1: on to U2, which the sheet of D1 covers on a phone.
    await trigger(page, 'd1').focus();
    await page.keyboard.press('Enter');
    await expect.poll(title).toBe('sheet-d1-title');
    await page.keyboard.press('Tab');
    await expect(page.locator('#sheet-d1 .sheet__close')).toBeFocused();
    expect(await isOpen(page, 'd1')).toBe(true);
    await page.keyboard.press('Tab');
    await expect(trigger(page, 'u2')).toBeFocused();
    await expect.poll(() => isOpen(page, 'd1')).toBe(false);
    expect(await coveredAtCentre(page, 'u2')).toBe(false);
    // Shift+Tab out of the sheet of U2: back to U2 itself, which its own sheet covers on a phone.
    await page.keyboard.press('Enter');
    await expect.poll(title).toBe('sheet-u2-title');
    await page.keyboard.press('Shift+Tab');
    await expect(trigger(page, 'u2')).toBeFocused();
    await expect.poll(() => isOpen(page, 'u2')).toBe(false);
    expect(await coveredAtCentre(page, 'u2')).toBe(false);
  });
}

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
  // One file, one format: no second fetch once everything has settled.
  await expect(page.locator('#sheet-j1 picture img')).toHaveJSProperty('complete', true);
  await page.waitForLoadState('networkidle');
  expect(requests).toHaveLength(1);
});

test('SW1 is focusable and changes the screen of DISP1', async ({ page }) => {
  // Once the app has mounted (JP1 is shown then): SW1 works with JavaScript only.
  await expect(page.locator('button.jp1')).toBeVisible();
  const sw1 = page.locator('button.sw1');
  await sw1.focus();
  await expect(sw1).toBeFocused();
  await sw1.click();
  await expect(page.locator('.disp__caption')).toHaveText('DISP1 · uptime');
});
