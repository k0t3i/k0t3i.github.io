import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { EN, FR } from '../helpers/copy';

/*
 * Interactions 3 and 4: DISP1 shows the readout of the part pointed at, and SW1 runs through its
 * screens (avatar, uptime, then HELLO in Morse code on LED1). The screens are decor (aria-hidden);
 * the caption names the screen chosen with SW1, politely. The Morse code never flashes more than
 * three times a second, plays once, and stops on a language switch or a turn of the board.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
/** One unit of the Morse code (lib/morse.ts), and HELLO with the dark letter gap before and after it. */
const UNIT = 240;
const SEQUENCE_UNITS = 3 + 49 + 3;
/** What runs on the wide board at rest: the ambient signals, the LED and the wave of the page (motion.spec.ts). */
const AT_REST_WIDE = [
  'led-breathe part-led1::after',
  // The wave of the page (revision 8): its band, and its dots moved back as much (background.spec.ts).
  'mat-dots app::before',
  'mat-wave app',
  'signal signal',
  'signal signal',
  'signal signal',
  'signal signal',
];

const board = (page: Page): Locator => page.locator('div.board');
const figure = (page: Page): Locator => page.locator('figure.disp');
const pixels = (page: Page): Locator => page.locator('svg.disp__pixels');
const caption = (page: Page): Locator => page.locator('#disp1-caption');
const sw1 = (page: Page): Locator => page.locator('button.sw1');
const trigger = (page: Page, id: string): Locator => page.locator(`.part__trigger[popovertarget="sheet-${id}"]`);

/** This session has already powered the board on: the page opens at rest. */
const booted = (page: Page): Promise<unknown> => page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));

async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('button.jp1')).toBeVisible();
}

async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** The running animations and transitions: their name, and what they run on (as motion.spec.ts). */
const running = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    document.getAnimations().map((a) => {
      const effect = a.effect as KeyframeEffect | null;
      const target = effect?.target as Element | null;
      const name = 'animationName' in a ? (a as CSSAnimation).animationName : `transition:${(a as CSSTransition).transitionProperty}`;
      const what = target?.matches('path.signal') ? 'signal' : (target?.closest('[id]')?.id ?? target?.tagName ?? '?');
      return `${name} ${what}${effect?.pseudoElement ?? ''}`;
    }),
  );

/** One change of the key of LED1, and what LED1 showed a little later: its glow and the fill of its lens. */
interface LedEntry {
  led: string | null;
  at: number;
  glow?: number;
  lens?: string;
  /** The lens colours of the board, for reference: lit (at rest, or on) and dimmed (off). */
  lit?: string;
  dim?: string;
}

/**
 * Records, from before the first script of the page, every change of the key of LED1 (data-led on
 * DISP1: on, off, or gone once the code has been sent), and 100 ms later what the visitor sees: the
 * glow of LED1, and the fill its lens gets. The lens is drawn in the shadow tree of a <use>: a probe
 * filled with var(--lens) next to it, in the same SVG, gets the same fill.
 */
const recordLed = (page: Page): Promise<unknown> =>
  page.addInitScript(() => {
    const w = window as unknown as { ledLog: LedEntry[] };
    w.ledLog = [];
    const fillIn = (svg: Element | null, fill: string): string | undefined => {
      if (!svg) return undefined;
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      probe.style.fill = fill;
      svg.append(probe);
      const got = getComputedStyle(probe).fill;
      probe.remove();
      return got;
    };
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (!el.matches('figure.disp')) continue;
        const entry: LedEntry = { led: el.getAttribute('data-led'), at: performance.now() };
        w.ledLog.push(entry);
        setTimeout(() => {
          const led = document.querySelector('#part-led1 .part__trigger');
          if (led) entry.glow = Number(getComputedStyle(led, '::after').opacity);
          entry.lens = fillIn(document.querySelector('#part-led1 svg.part__body'), 'var(--lens)');
          entry.lit = fillIn(document.querySelector('svg.sprite'), 'var(--lens)');
          entry.dim = fillIn(document.querySelector('svg.sprite'), 'var(--lens-off)');
        }, 100);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-led'] });
  });

const ledLog = (page: Page) => page.evaluate(() => (window as unknown as { ledLog: LedEntry[] }).ledLog);

/** A computed colour as 0-255 channels, whether the engine writes rgb() or color(srgb ...). */
function channels(colour = ''): number[] {
  const n = (colour.match(/-?[\d.]+/g) ?? []).map(Number).slice(0, 3);
  return colour.startsWith('color(srgb') ? n.map((v) => v * 255) : n;
}

/** SW1 pressed twice, from the avatar: the Morse screen, and LED1 starts sending. */
async function startMorse(page: Page): Promise<void> {
  await sw1(page).click();
  await expect(caption(page)).toHaveText(FR.captions.uptime);
  await sw1(page).click();
  await expect(caption(page)).toHaveText(FR.captions.morse);
  await expect(figure(page)).toHaveAttribute('data-led', 'on');
}

/** An animation of LED1 itself: the glint of the flowing board that runs on its trace is not one. */
const ledAnimation = (r: string): boolean => r.includes('part-led1') && !r.startsWith('trace-glint');

/*
 * The glass of DISP1 is the 192 px of its pixels, its padding round them, at every width: the pixel
 * screens (and the field of the game) fill it, centred. Its width never follows the blocks under it
 * in the figure (the test keypad, revision 10).
 */
test('the glass of DISP1 holds its pixels exactly, centred, on the flowing and the wide board', async ({ page }) => {
  for (const size of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1600, height: 900 }]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const gaps = await page.evaluate(() => {
      const glass = (document.querySelector('.disp__screen') as Element).getBoundingClientRect();
      const px = (document.querySelector('svg.disp__pixels') as Element).getBoundingClientRect();
      return [px.left - glass.left, glass.right - px.right, px.top - glass.top, glass.bottom - px.bottom].map((v) => Math.round(v * 2) / 2);
    });
    const [left = 0, right = 0, top = 0, bottom = 0] = gaps;
    expect(Math.abs(left - right), `${size.width}px: ${gaps.join(' ')}`).toBeLessThanOrEqual(1);
    expect(Math.abs(top - bottom), `${size.width}px: ${gaps.join(' ')}`).toBeLessThanOrEqual(1);
  }
});

test.describe('DISP1 and SW1', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('SW1 by keyboard cycles screens and announces them', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await booted(page);
    await open(page);
    await expect(caption(page)).toHaveAttribute('aria-live', 'polite');
    await expect(caption(page)).toHaveText(FR.captions.avatar);
    await sw1(page).focus();
    const avatar = page.locator('img.disp__avatar');
    for (const name of ['uptime', 'morse', 'avatar'] as const) {
      await page.keyboard.press('Enter');
      await expect(caption(page)).toHaveText(FR.captions[name]);
      await expect(pixels(page)).toHaveAttribute('data-screen', name);
      await expect(sw1(page)).toBeFocused();
      // The avatar is out of sight on the other screens, and still in the figure with its text alternative.
      await expect(avatar).toHaveAttribute('alt', FR.avatarAlt);
      await expect.poll(() => avatar.evaluate((el) => getComputedStyle(el).opacity)).toBe(name === 'avatar' ? '1' : '0');
      if (name === 'uptime') await expect(pixels(page).locator('.px--digits')).toHaveCount(1);
      if (name === 'morse') await expect(pixels(page).locator('.px--letters')).toHaveCount(1);
    }
    // Back on the avatar: no pixel drawn over it, LED1 at rest.
    expect(await pixels(page).evaluate((el) => el.childElementCount)).toBe(0);
    await expect(figure(page)).not.toHaveAttribute('data-led', /.*/);
  });

  test('hovering a part shows its readout, leaving restores the avatar', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    await booted(page);
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page);
    await trigger(page, 'r1').hover();
    await expect(pixels(page)).toHaveAttribute('data-screen', 'readout');
    await expect(pixels(page).locator('.px--ref')).toHaveCount(1);
    await expect(pixels(page).locator('.px--value')).toHaveCount(1);
    // The readout is decor: the caption still names the screen chosen with SW1.
    await expect(caption(page)).toHaveText(FR.captions.avatar);
    // The trace of the oscilloscope scrolls, pixel by pixel, with a translation.
    const wave = await page.locator('polyline.disp__wave').evaluate((el) =>
      el.getAnimations().map((a) => {
        const frames = (a.effect as KeyframeEffect).getKeyframes();
        return {
          props: [...new Set(frames.flatMap((f) => Object.keys(f)))].filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)),
          iterations: a.effect?.getTiming().iterations,
          easing: frames[0]?.easing,
        };
      }),
    );
    expect(wave).toEqual([{ props: ['transform'], iterations: Infinity, easing: expect.stringMatching(/^steps\(/) }]);

    // Another part: its own readout.
    await trigger(page, 'j2').hover();
    await expect(pixels(page)).toHaveAttribute('data-screen', 'readout');

    // Away: the readout stays a moment, then the avatar is back and nothing runs on the screen.
    await page.evaluate(() => {
      const w = window as unknown as { seen: { what: string; at: number }[] };
      w.seen = [];
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target as Element;
          w.seen.push({ what: `${r.attributeName}=${el.getAttribute(r.attributeName ?? '')}`, at: performance.now() });
        }
      }).observe(document.querySelector('.board') as Element, { subtree: true, attributes: true, attributeFilter: ['data-active', 'data-screen'] });
    });
    await page.mouse.move(800, 2);
    await expect(pixels(page)).toHaveAttribute('data-screen', 'avatar');
    const seen = await page.evaluate(() => (window as unknown as { seen: { what: string; at: number }[] }).seen);
    const left = seen.find((s) => s.what === 'data-active=null');
    const back = seen.find((s) => s.what === 'data-screen=avatar');
    if (!left || !back) throw new Error(JSON.stringify(seen));
    expect(back.at - left.at).toBeGreaterThanOrEqual(380);
    expect(back.at - left.at).toBeLessThan(700);
    await expect.poll(async () => (await running(page)).sort()).toEqual(AT_REST_WIDE);
  });

  test('axe passes on every screen', async ({ page, isMobile }) => {
    // The boot, as the page opens.
    await page.goto('/');
    await expect(board(page)).toHaveAttribute('data-booting', '');
    await expect(pixels(page)).toHaveAttribute('data-screen', 'boot');
    expect(await violations(page)).toEqual([]);
    await expect(board(page)).not.toHaveAttribute('data-booting', /.*/, { timeout: 3000 });

    for (const name of ['avatar', 'uptime', 'morse'] as const) {
      if (name !== 'avatar') await sw1(page).click();
      await expect(pixels(page)).toHaveAttribute('data-screen', name);
      expect(await violations(page)).toEqual([]);
    }
    if (!isMobile) {
      await trigger(page, 'led1').hover();
      await expect(pixels(page)).toHaveAttribute('data-screen', 'readout');
      expect(await violations(page)).toEqual([]);
    }
  });

  test('morse never exceeds 3 flashes per second', async ({ page }) => {
    test.setTimeout(40_000);
    await booted(page);
    await recordLed(page);
    await open(page);
    await startMorse(page);
    // The whole sequence, in real time: then LED1 is back at rest.
    await expect(figure(page)).not.toHaveAttribute('data-led', /.*/, { timeout: SEQUENCE_UNITS * UNIT + 3000 });
    const log = await ledLog(page);
    const starts = log.filter((e, i) => e.led === 'on' && log[i - 1]?.led !== 'on').map((e) => e.at);
    // HELLO: 16 dots and dashes, sent once.
    expect(starts).toHaveLength(16);
    const most = Math.max(...starts.map((t) => starts.filter((u) => u >= t && u - t < 1000).length));
    expect(most).toBeLessThanOrEqual(3);
    // Never shorter than its timeline (timers only run late), and not much longer.
    const first = log[0]?.at ?? 0;
    const end = log.at(-1)?.at ?? 0;
    expect(log[0]?.led).toBe('off');
    expect(end - first).toBeGreaterThanOrEqual(SEQUENCE_UNITS * UNIT - 20);
    expect(end - first).toBeLessThan(SEQUENCE_UNITS * UNIT + 2000);
    // What LED1 shows: its glow on for a signal, off between them; its lens lit, or dimmed to a warm
    // grey (the lens colour mixed 30 % into the body), never black.
    for (const e of log) {
      if (e.led === 'on') {
        expect(e.glow).toBeGreaterThan(0.9);
        expect(e.lens).toBe(e.lit);
        expect(channels(e.lens)).toEqual([255, 220, 176]);
      }
      if (e.led === 'off') {
        expect(e.glow).toBeLessThan(0.1);
        expect(e.lens).toBe(e.dim);
        const [r = 0, g = 0, b = 0] = channels(e.lens);
        for (const [got, want] of [
          [r, 0.3 * 255 + 0.7 * 20],
          [g, 0.3 * 220 + 0.7 * 21],
          [b, 0.3 * 176 + 0.7 * 24],
        ] as const)
          expect(Math.abs(got - want)).toBeLessThan(2);
      }
    }
    // Back at rest: the lens is lit again.
    expect(log.at(-1)?.led).toBeNull();
    expect(log.at(-1)?.lens).toBe(log.at(-1)?.lit);
    // Once only: the code stays on the screen, LED1 breathes again.
    await expect(caption(page)).toHaveText(FR.captions.morse);
    await page.waitForTimeout(1000);
    expect((await ledLog(page)).length).toBe(log.length);
    expect((await running(page)).filter(ledAnimation)).toEqual(['led-breathe part-led1::after']);
  });

  test('language switch during morse leaves no blinking LED', async ({ page }) => {
    await booted(page);
    await recordLed(page);
    await open(page);
    await startMorse(page);
    await page.getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(figure(page)).not.toHaveAttribute('data-led', /.*/);
    await expect(caption(page)).toHaveText(EN.captions.avatar);
    await expect(pixels(page)).toHaveAttribute('data-screen', 'avatar');
    const count = (await ledLog(page)).length;
    await page.waitForTimeout(1500);
    expect(await ledLog(page)).toHaveLength(count);
    expect((await running(page)).filter(ledAnimation)).toEqual(['led-breathe part-led1::after']);
  });

  test('turning the board during the morse stops it, and the front face comes back on the avatar', async ({ page }) => {
    await booted(page);
    await recordLed(page);
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page);
    await startMorse(page);
    await page.locator('.board__face--front button.sw2').click();
    await expect(board(page)).toHaveAttribute('data-flipped', '');
    await expect(figure(page)).not.toHaveAttribute('data-led', /.*/);
    await expect(board(page)).not.toHaveAttribute('data-turning', /.*/);
    const count = (await ledLog(page)).length;
    await page.waitForTimeout(1000);
    expect(await ledLog(page)).toHaveLength(count);
    await page.locator('.board__face--back button.sw2').click();
    await expect(board(page)).not.toHaveAttribute('data-flipped', /.*/);
    await expect(caption(page)).toHaveText(FR.captions.avatar);
    await expect(pixels(page)).toHaveAttribute('data-screen', 'avatar');
    expect(await ledLog(page)).toHaveLength(count);
  });

  test('in forced colours the lens of LED1 shows Highlight for a signal and Canvas between them', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'forced colours are emulated in Chromium only');
    await page.emulateMedia({ forcedColors: 'active' });
    await booted(page);
    await recordLed(page);
    await open(page);
    await startMorse(page);
    // The first dot and the gap after it, and 100 ms more for the sample of the gap.
    await expect.poll(async () => (await ledLog(page)).filter((e) => e.lens !== undefined).length, { timeout: 3000 }).toBeGreaterThanOrEqual(3);
    const system = await page.evaluate(() =>
      ['Highlight', 'Canvas'].map((fill) => {
        const probe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        probe.style.fill = fill;
        (document.querySelector('#part-led1 svg.part__body') as Element).append(probe);
        const got = getComputedStyle(probe).fill;
        probe.remove();
        return got;
      }),
    );
    const [highlight, canvas] = system;
    const sampled = (await ledLog(page)).filter((e) => e.lens !== undefined);
    expect(sampled.map((e) => e.led)).toEqual(['off', 'on', 'off', ...sampled.slice(3).map((e) => e.led)]);
    for (const e of sampled) expect(e.lens).toBe(e.led === 'on' ? highlight : canvas);
    expect(canvas).not.toBe(highlight);
  });

  test('SW1 pressed during the boot ends it: the screen is the one the caption names', async ({ page }) => {
    await page.goto('/');
    await expect(board(page)).toHaveAttribute('data-booting', '');
    await sw1(page).click();
    await expect(caption(page)).toHaveText(FR.captions.uptime);
    // As soon as the caption names the uptime, the screen shows it: the boot did not run on.
    expect(
      await page.evaluate(() => ({
        screen: document.querySelector('svg.disp__pixels')?.getAttribute('data-screen'),
        booting: document.querySelector('div.board')?.hasAttribute('data-booting'),
      })),
    ).toEqual({ screen: 'uptime', booting: false });
    expect(await page.evaluate(() => sessionStorage.getItem('k0t3i.booted'))).toBe('1');
  });

  test('Escape on a still screen leaves it (Escape also closes the sheets)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await booted(page);
    await open(page);
    await sw1(page).click();
    await expect(caption(page)).toHaveText(FR.captions.uptime);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(caption(page)).toHaveText(FR.captions.uptime);
    await expect(pixels(page)).toHaveAttribute('data-screen', 'uptime');
  });

  test('Escape during the morse stops it and puts DISP1 back on the avatar', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await booted(page);
    await open(page);
    await startMorse(page);
    await page.keyboard.press('Escape');
    await expect(figure(page)).not.toHaveAttribute('data-led', /.*/);
    await expect(caption(page)).toHaveText(FR.captions.avatar);
    await expect(pixels(page)).toHaveAttribute('data-screen', 'avatar');
  });
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('SW1 changes the screen at once, and the Morse code is shown still', async ({ page, isMobile }) => {
    await recordLed(page);
    await open(page);
    await sw1(page).click();
    await expect(pixels(page)).toHaveAttribute('data-screen', 'uptime');
    await sw1(page).click();
    await expect(pixels(page)).toHaveAttribute('data-screen', 'morse');
    await expect(caption(page)).toHaveText(FR.captions.morse);
    await expect(pixels(page).locator('.px--letters')).toHaveCount(1);
    await page.waitForTimeout(1000);
    // LED1 never blinks: it was never keyed.
    expect(await ledLog(page)).toEqual([]);
    expect(await running(page)).toEqual([]);
    if (!isMobile) {
      // The readout: the trace of the oscilloscope stands still.
      await trigger(page, 'c1').hover();
      await expect(pixels(page)).toHaveAttribute('data-screen', 'readout');
      expect(await running(page)).toEqual([]);
    }
  });
});
