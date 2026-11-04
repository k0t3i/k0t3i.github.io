import { expect, test, type Locator, type Page } from '@playwright/test';

/*
 * Interactions 1 and 2: the power-on of the board (once per session) and the current that follows
 * the pointer and the keyboard focus, from DISP1 to the part. Both only add to the page: the content
 * is there and readable from the first paint, nothing moves, and reduced motion keeps everything still.
 */

const GOLD = 'rgb(201, 164, 92)';
const WIDE = { width: 1600, height: 900 };
const IDS = ['r1', 'c1', 'led1', 'd1', 'u2', 'j1', 'j2', 'j3'] as const;
/** What runs on the wide board at rest: the ambient signals and the LED (motion.spec.ts). */
const AT_REST_WIDE = ['led-breathe part-led1::after', 'signal signal', 'signal signal', 'signal signal', 'signal signal'];

const board = (page: Page): Locator => page.locator('div.board');
const trigger = (page: Page, id: string): Locator => page.locator(`.part__trigger[popovertarget="sheet-${id}"]`);

/** This session has already powered the board on: the page opens at rest. */
const booted = (page: Page): Promise<unknown> => page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));

/** The page once the app has mounted. */
async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('button.jp1')).toBeVisible();
}

/** How lit each live trace of the wide board is (its opacity). */
const litTraces = (page: Page): Promise<Record<string, number>> =>
  page
    .locator('path.trace-live')
    .evaluateAll((paths) => Object.fromEntries(paths.map((p) => [p.getAttribute('data-part'), Number(getComputedStyle(p).opacity)])));

/** Only the trace of `id` is lit (fully), every other one is dark. */
const onlyLit = (id: string | null) => Object.fromEntries(IDS.map((p) => [p, p === id ? 1 : 0]));

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

/**
 * Records, from before the first script of the page, every change of the two boot attributes: the
 * standby that the head script sets on <html> (data-boot) and the power-on on the board (data-booting).
 */
const recordBoot = (page: Page): Promise<unknown> =>
  page.addInitScript(() => {
    const w = window as unknown as { bootLog: { attr: string; on: boolean; at: number }[] };
    w.bootLog = [];
    new MutationObserver((records) => {
      for (const r of records) {
        const attr = r.attributeName ?? '';
        w.bootLog.push({ attr, on: (r.target as Element).hasAttribute(attr), at: performance.now() });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-boot', 'data-booting'] });
  });

const bootLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { bootLog: { attr: string; on: boolean; at: number }[] }).bootLog);

test.describe('the current follows the pointer', () => {
  test.use({ reducedMotion: 'no-preference' });

  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'a mouse and a keyboard: the touch projects check the boot only');
  });

  test('hover r1 lights its trace', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await open(page);
    await expect(board(page)).not.toHaveAttribute('data-active', /.*/);
    expect(await litTraces(page)).toEqual(onlyLit(null));

    await trigger(page, 'r1').hover();
    await expect(board(page)).toHaveAttribute('data-active', 'r1');
    await expect.poll(() => litTraces(page)).toEqual(onlyLit('r1'));
    const r1 = page.locator('path.trace-live[data-part="r1"]');
    expect(await r1.evaluate((p) => getComputedStyle(p).stroke)).toBe(GOLD);
    // Drawn all the way, from DISP1 to the part.
    await expect.poll(() => r1.evaluate((p) => parseFloat(getComputedStyle(p).strokeDashoffset))).toBe(0);

    // Away from the part: dark again, and nothing left running but the ambient set.
    await page.mouse.move(800, 2);
    await expect(board(page)).not.toHaveAttribute('data-active', /.*/);
    await expect.poll(() => litTraces(page)).toEqual(onlyLit(null));
    await expect(board(page)).not.toHaveAttribute('data-tilting', /.*/);
    await expect.poll(async () => (await running(page)).sort()).toEqual(AT_REST_WIDE);
  });

  test('a signal leaves DISP1 and runs along the trace to the part', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await open(page);
    const pulse = page.locator('path.trace-pulse[data-part="j3"]');
    // At rest the signal waits before the start of its route (at DISP1): nothing of it is drawn.
    expect(await pulse.evaluate((p) => [p.getAttribute('d'), p.getAttribute('pathLength')])).toEqual(
      await page.locator('path.trace-live[data-part="j3"]').evaluate((p) => [p.getAttribute('d'), p.getAttribute('pathLength')]),
    );
    const before = await pulse.evaluate((p) => parseFloat(getComputedStyle(p).strokeDashoffset));
    expect(before).toBeGreaterThan(0);

    await trigger(page, 'j3').hover();
    // It runs: one transition of its dash offset, the same course as the trace drawing itself.
    const moving = await page.evaluate(() =>
      ['trace-pulse', 'trace-live'].map((c) =>
        (document.querySelector(`path.${c}[data-part="j3"]`) as Element)
          .getAnimations()
          .map((a) => `${(a as CSSTransition).transitionProperty} ${a.effect?.getTiming().duration} ${a.effect?.getTiming().easing}`)
          .filter((t) => t.startsWith('stroke-dashoffset')),
      ),
    );
    expect(moving[0]).toHaveLength(1);
    expect(moving[0]).toEqual(moving[1]);
    // Then it has gone into the part: past the end of the route, drawn no more.
    await expect.poll(() => pulse.evaluate((p) => parseFloat(getComputedStyle(p).strokeDashoffset))).toBeLessThan(-100);
  });

  test('keyboard focus lights the trace too', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await open(page);
    // Tab to R1, the first part.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      if (await trigger(page, 'r1').evaluate((el) => el === document.activeElement)) break;
    }
    await expect(trigger(page, 'r1')).toBeFocused();
    await expect(board(page)).toHaveAttribute('data-active', 'r1');
    await expect.poll(() => litTraces(page)).toEqual(onlyLit('r1'));
    await page.keyboard.press('Tab');
    await expect(trigger(page, 'c1')).toBeFocused();
    await expect(board(page)).toHaveAttribute('data-active', 'c1');
    await expect.poll(() => litTraces(page)).toEqual(onlyLit('c1'));
    // A sheet opened from the keyboard and closed with Escape: back on the part, still lit.
    await page.keyboard.press('Enter');
    await expect(page.locator('#sheet-c1')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger(page, 'c1')).toBeFocused();
    await expect(board(page)).toHaveAttribute('data-active', 'c1');
    // The focus leaves the parts: nothing is lit.
    await page.locator('button.sw1').focus();
    await expect(board(page)).not.toHaveAttribute('data-active', /.*/);
  });

  test('fast hover sequence r1 → c1 → d1 ends on the right state', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await open(page);
    const centre = async (id: string) => {
      const box = await trigger(page, id).boundingBox();
      if (!box) throw new Error(`no box for ${id}`);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const points = await Promise.all(['r1', 'c1', 'd1'].map(centre));
    // Straight across, one event per part, then out of every part.
    for (const p of points) await page.mouse.move(p.x, p.y);
    await page.mouse.move(points[2]?.x ?? 0, 860);
    await expect(board(page)).not.toHaveAttribute('data-active', /.*/);
    await expect.poll(() => litTraces(page)).toEqual(onlyLit(null));

    // The same, ending on D1: D1 alone is lit.
    for (const p of points) await page.mouse.move(p.x, p.y);
    await expect(board(page)).toHaveAttribute('data-active', 'd1');
    await expect.poll(() => litTraces(page)).toEqual(onlyLit('d1'));
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    test(`on the flowing board the trace of the part lights up (${viewport.width}px)`, async ({ page }) => {
      await booted(page);
      await page.setViewportSize(viewport);
      await open(page);
      const stub = (id: string) => page.locator(`#part-${id} .part__body`).evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(await stub('u2')).not.toContain(GOLD);
      await trigger(page, 'u2').hover();
      await expect(board(page)).toHaveAttribute('data-active', 'u2');
      // Its own trace to the bus, in gold, and the fan-out of U2 drawn in its symbol with it.
      await expect.poll(() => stub('u2')).toContain(GOLD);
      expect(await page.locator('#part-u2 .part__body').evaluate((el) => getComputedStyle(el).getPropertyValue('--wire').trim())).toBe(
        await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gold').trim()),
      );
      expect(await stub('r1')).not.toContain(GOLD);
      await page.mouse.move(2, 2);
      await expect(board(page)).not.toHaveAttribute('data-active', /.*/);
      await expect.poll(() => stub('u2')).not.toContain(GOLD);
    });
  }

  test('a sheet unfolds from its part', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await open(page);
    test.skip(!(await page.evaluate(() => CSS.supports('position-area: center'))), 'sheets are anchored to their part only with position-area');
    await trigger(page, 'r1').click();
    const sheet = page.locator('#sheet-r1');
    await expect(sheet).toBeVisible();
    const style = await sheet.evaluate((el) => {
      const s = getComputedStyle(el);
      return { origin: s.transformOrigin.split(' ').map(parseFloat), height: el.getBoundingClientRect().height, transitions: s.transitionProperty };
    });
    // Above its part, from the corner at the part: its bottom left.
    expect(style.origin[0]).toBe(0);
    expect(style.origin[1]).toBeGreaterThan(0);
    expect(style.transitions).toContain('scale');
    await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const settled = await sheet.evaluate((el) => {
      const s = getComputedStyle(el);
      return { scale: s.scale, height: el.getBoundingClientRect().height, origin: s.transformOrigin.split(' ').map(parseFloat) };
    });
    expect(['none', '1']).toContain(settled.scale);
    expect(settled.origin[1]).toBeCloseTo(settled.height, 0);
  });
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the trace of the part is lit at once, and nothing moves', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    await page.setViewportSize(WIDE);
    await open(page);
    await trigger(page, 'led1').hover();
    await expect(board(page)).toHaveAttribute('data-active', 'led1');
    expect(await litTraces(page)).toEqual(onlyLit('led1'));
    expect(await running(page)).toEqual([]);
  });

  test('no boot under reduced motion', async ({ page }) => {
    await recordBoot(page);
    await open(page);
    await page.waitForTimeout(1500);
    expect(await bootLog(page)).toEqual([]);
    await expect(board(page)).not.toHaveAttribute('data-booting', /.*/);
    expect(await running(page)).toEqual([]);
  });
});

test.describe('the power-on', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('boot plays once per session', async ({ page, isMobile }) => {
    await recordBoot(page);
    await open(page);
    // The power-on runs on the board, then ends: within 1.5 s.
    await expect(board(page)).not.toHaveAttribute('data-booting', /.*/, { timeout: 3000 });
    const log = await bootLog(page);
    const on = log.find((e) => e.attr === 'data-booting' && e.on);
    const off = log.find((e) => e.attr === 'data-booting' && !e.on);
    if (!on || !off) throw new Error(`no power-on: ${JSON.stringify(log)}`);
    expect(off.at - on.at).toBeGreaterThanOrEqual(1100);
    expect(off.at - on.at).toBeLessThanOrEqual(1500);
    // The standby of the head script came first, and the power-on took it over.
    const standby = log.filter((e) => e.attr === 'data-boot').map((e) => e.on);
    expect(standby).toEqual([true, false]);
    expect(await page.evaluate(() => sessionStorage.getItem('k0t3i.booted'))).toBe('1');
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-boot'))).toBe(false);
    if (!isMobile) {
      // Back at rest: only the ambient set runs.
      await expect.poll(async () => (await running(page)).sort()).toEqual(AT_REST_WIDE);
    }

    // Reloaded in the same session: no standby, no power-on.
    await page.reload();
    await expect(page.locator('button.jp1')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await bootLog(page)).toEqual([]);
  });

  test('the gold sweep, the LED and the screen of DISP1 during the boot', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(board(page)).toHaveAttribute('data-booting', '');
    const names = (await running(page)).map((r) => r.split(' ')[0]);
    if (isMobile) {
      // The flowing board: a glint runs down each bus.
      expect(names.filter((n) => n === 'boot-glint').length).toBeGreaterThanOrEqual(2);
    } else {
      // The wide board: each of the eight traces lights up from DISP1, a signal running ahead.
      expect(names.filter((n) => n === 'boot-trace')).toHaveLength(8);
      expect(names.filter((n) => n === 'boot-pulse')).toHaveLength(8);
    }
    expect(names).toContain('boot-led');
    expect(names).toContain('boot-veil');
    // Decor only: the animations run on SVG paths, pseudo-elements and the glow of the LED, never on text.
    const targets = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => 'animationName' in a && String((a as CSSAnimation).animationName).startsWith('boot-'))
        .map((a) => {
          const effect = a.effect as KeyframeEffect;
          return `${(effect.target as Element).tagName.toLowerCase()}${effect.pseudoElement ?? ''}`;
        }),
    );
    for (const t of targets) expect(t).toMatch(/^(path|li::after|li::before|ul::after|ul::before|div::before|button::after)$/);
    // No layout property: the sweep repaints (stroke-dashoffset, the opacity of SVG children) or composites.
    const properties = await page.evaluate(() =>
      [
        ...new Set(
          document
            .getAnimations()
            .filter((a) => 'animationName' in a && String((a as CSSAnimation).animationName).startsWith('boot-'))
            .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))
            .filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)),
        ),
      ].sort(),
    );
    for (const p of properties) expect(['opacity', 'strokeDashoffset', 'transform']).toContain(p);
  });

  test('a sheet opened during the boot ends it, and opens next to its part', async ({ page }) => {
    await page.goto('/');
    await expect(board(page)).toHaveAttribute('data-booting', '');
    await trigger(page, 'j1').click();
    const sheet = page.locator('#sheet-j1');
    await expect(sheet).toBeVisible();
    await expect(board(page)).not.toHaveAttribute('data-booting', /.*/);
    expect(await page.evaluate(() => sessionStorage.getItem('k0t3i.booted'))).toBe('1');
    // At rest under the sheet: the screen of DISP1 lit, no boot animation left.
    expect((await running(page)).filter((r) => r.startsWith('boot-'))).toEqual([]);
    await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const [s, p] = await Promise.all([sheet.boundingBox(), page.locator('#part-j1').boundingBox()]);
    if (!s || !p) throw new Error('no box for j1');
    expect(Math.min(s.x + s.width, p.x + p.width) - Math.max(s.x, p.x)).toBeGreaterThan(0);
  });

  test('a part pointed at during the boot ends it: its trace fades out when left, never cut', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    // The two attributes of the board, from before the first script: the power-on and the active part.
    await page.addInitScript(() => {
      const w = window as unknown as { log: { what: string; at: number }[] };
      w.log = [];
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target as Element;
          if (el.matches('div.board')) w.log.push({ what: `${r.attributeName} ${el.getAttribute(r.attributeName ?? '')}`, at: performance.now() });
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-booting', 'data-active'] });
    });
    await page.setViewportSize(WIDE);
    await page.goto('/');
    await expect(board(page)).toHaveAttribute('data-booting', '');
    // Straight onto the part while the board powers on.
    const box = await trigger(page, 'r1').boundingBox();
    if (!box) throw new Error('no box for r1');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(board(page)).toHaveAttribute('data-active', 'r1');
    // The visitor acts: the board is on at once (in the same update), and the current runs to the part.
    await expect(board(page)).not.toHaveAttribute('data-booting', /.*/);
    const log = await page.evaluate(() => (window as unknown as { log: { what: string; at: number }[] }).log);
    const on = log.find((e) => e.what === 'data-booting ');
    const off = log.find((e) => e.what === 'data-booting null');
    const active = log.find((e) => e.what === 'data-active r1');
    if (!on || !off || !active) throw new Error(JSON.stringify(log));
    expect(off.at - on.at).toBeLessThan(1150);
    expect(Math.abs(off.at - active.at)).toBeLessThan(20);
    expect(await page.evaluate(() => sessionStorage.getItem('k0t3i.booted'))).toBe('1');
    await expect.poll(() => litTraces(page)).toEqual(onlyLit('r1'));

    // Left: its light fades out (a transition of its opacity), and no sweep starts on it again.
    await page.evaluate(() => {
      const w = window as unknown as { events: string[] };
      w.events = [];
      const trace = document.querySelector('path.trace-live[data-part="r1"]') as Element;
      trace.addEventListener('transitionrun', (e) => w.events.push(`transition ${(e as TransitionEvent).propertyName}`));
      trace.addEventListener('animationstart', (e) => w.events.push(`animation ${(e as AnimationEvent).animationName}`));
    });
    await page.mouse.move(800, 2);
    await expect.poll(() => litTraces(page)).toEqual(onlyLit(null));
    // Past the moment the power-on would have ended.
    await page.waitForTimeout(1300);
    const events = await page.evaluate(() => (window as unknown as { events: string[] }).events);
    expect(events).toContain('transition opacity');
    expect(events.filter((e) => e.startsWith('animation'))).toEqual([]);
    expect(await litTraces(page)).toEqual(onlyLit(null));
  });

  test('content readable during boot', async ({ page }) => {
    /** Text of the front face: its effective opacity (all ancestors), visibility and colour. */
    const texts = () =>
      page.evaluate(() =>
        ['h1', '.hero__sub', '.part__ref', '.part__label', '.silk-heading', '.disp__caption', '.board__name', '.uptime'].flatMap((s) =>
          [...document.querySelectorAll<HTMLElement>(`.board__face--front ${s}`)].map((el) => {
            let opacity = 1;
            for (let e: Element | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
            const r = el.getBoundingClientRect();
            const s2 = getComputedStyle(el);
            return `${s} ${opacity} ${s2.visibility} ${s2.color} ${r.width > 0 && r.height > 0}`;
          }),
        ),
      );
    await page.goto('/', { waitUntil: 'commit' });
    // 100 ms into the visit, with the page and its stylesheet there (the tokens of the board are set).
    await page.waitForFunction(
      () =>
        performance.now() >= 100 &&
        document.querySelector('.uptime') !== null &&
        getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() !== '',
    );
    const early = await texts();
    await expect(board(page)).toHaveAttribute('data-booting', '');
    const during = await texts();
    await expect(board(page)).not.toHaveAttribute('data-booting', /.*/, { timeout: 3000 });
    const after = await texts();
    expect(early.length).toBeGreaterThan(20);
    for (const t of after) expect(t).toMatch(/ 1 visible rgb\(.*\) true$/);
    // The same text, as readable, at 100 ms, during the boot and after it.
    expect(early).toEqual(after);
    expect(during).toEqual(after);
  });

  test('boot never shifts layout', async ({ page, browserName }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { shifts: number[] };
      w.shifts = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) w.shifts.push((e as PerformanceEntry & { value: number }).value);
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        // No Layout Instability API (Firefox, WebKit): the boxes below are the check.
      }
    });
    const boxes = () =>
      page.evaluate(() =>
        ['.board', '.board__header', '.hero__title', '.hero__sub', '.disp', '.disp__screen', '.part__trigger', '.board__footer'].flatMap((s) =>
          [...document.querySelectorAll(s)].map((el) => {
            const r = el.getBoundingClientRect();
            return `${s} ${r.x.toFixed(1)} ${r.y.toFixed(1)} ${r.width.toFixed(1)} ${r.height.toFixed(1)}`;
          }),
        ),
      );
    await page.goto('/');
    await expect(board(page)).toHaveAttribute('data-booting', '');
    const during = await boxes();
    await expect(board(page)).not.toHaveAttribute('data-booting', /.*/, { timeout: 3000 });
    expect(await boxes()).toEqual(during);
    if (browserName === 'chromium') {
      const total = await page.evaluate(() => (window as unknown as { shifts: number[] }).shifts.reduce((a, b) => a + b, 0));
      expect(total).toBe(0);
    }
  });

  test('the page does not scroll while the board powers on', async ({ page }) => {
    // A short window, scrolled to the bottom: the lit traces must not become a scroll anchor.
    await page.setViewportSize({ width: 1600, height: 330 });
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(board(page)).toHaveAttribute('data-booting', '');
    const positions = await page.evaluate(async () => {
      const seen = new Set<number>();
      const board = document.querySelector('.board') as Element;
      while (board.hasAttribute('data-booting')) {
        seen.add(Math.round(scrollY));
        await new Promise((r) => requestAnimationFrame(r));
      }
      seen.add(Math.round(scrollY));
      return [...seen];
    });
    expect(positions).toHaveLength(1);
  });

  test('if the app never mounts, the standby of the head script lifts by itself', async ({ page }) => {
    // The head script runs, the app does not.
    await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
    await page.goto('/');
    const state = () =>
      page.evaluate(() => ({
        standby: document.documentElement.hasAttribute('data-boot'),
        veil: Number(getComputedStyle(document.querySelector('.disp__screen') as Element, '::before').opacity),
        led: Number(getComputedStyle(document.querySelector('#part-led1 .part__trigger') as Element, '::after').opacity),
      }));
    // From the first paint: the screen of DISP1 is dark and LED1 is off, as a board waiting for power.
    expect(await state()).toEqual({ standby: true, veil: 1, led: 0 });
    // Then the board shows at rest, on its own.
    await expect.poll(state, { timeout: 5000 }).toEqual({ standby: false, veil: 0, led: expect.any(Number) });
    expect((await state()).led).toBeGreaterThan(0);
    // And the session counts as booted: the next page shows the board at rest, never the dark screen again.
    expect(await page.evaluate(() => sessionStorage.getItem('k0t3i.booted'))).toBe('1');
  });
});
