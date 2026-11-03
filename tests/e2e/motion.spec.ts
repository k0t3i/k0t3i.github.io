import { expect, test, type Page } from '@playwright/test';

// Motion: still under reduced motion; at rest on the wide board, only the ambient set runs.

/** The running animations of the page: their name, and what they run on. */
const running = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().map((a) => {
      const effect = a.effect as KeyframeEffect | null;
      const target = effect?.target as Element | null;
      const name = 'animationName' in a ? (a as CSSAnimation).animationName : 'transition';
      const what = target?.matches('path.signal') ? 'signal' : (target?.closest('[id]')?.id ?? target?.tagName ?? '?');
      return `${name} ${what}${effect?.pseudoElement ?? ''}`;
    }),
  );

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1600, height: 900 },
  ]) {
    test(`reduced motion stops everything at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('button.jp1')).toBeVisible();
      expect(await running(page)).toEqual([]);
      await page.locator('.part__trigger[popovertarget="sheet-r1"]').click();
      const sheet = page.locator('#sheet-r1');
      await expect(sheet).toBeVisible();
      expect(await sheet.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
      expect(await running(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      // SW2 turns the board at once: no transition, nothing left running.
      await page.locator('.board__face--front button.sw2').click();
      await expect(page.locator('.board')).toHaveAttribute('data-flipped', '');
      expect(await page.locator('.board__body').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
      expect(await running(page)).toEqual([]);
      await page.locator('.board__face--back button.sw2').click();
      await expect(page.locator('.board')).not.toHaveAttribute('data-flipped', /.*/);
      // The signals draw nothing when they do not run.
      expect(await page.locator('path.signal').evaluateAll((paths) => paths.map((p) => getComputedStyle(p).opacity))).toEqual(['0', '0', '0', '0']);
    });
  }
});

test.describe('no preference', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('no-preference ambient set on the wide board', async ({ page }) => {
    // At rest: the power-on sequence has already played in this session.
    await page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');
    await expect(page.locator('button.jp1')).toBeVisible();
    // Exactly four signals and the LED: nothing else runs on the wide board.
    expect((await running(page)).sort()).toEqual([
      'led-breathe part-led1::after',
      'signal signal',
      'signal signal',
      'signal signal',
      'signal signal',
    ]);
    const signals = await page.locator('path.signal').evaluateAll((paths) =>
      paths.map((p) => {
        const a = p.getAnimations()[0] as CSSAnimation;
        const timing = a.effect?.getTiming();
        const frames = (a.effect as KeyframeEffect).getKeyframes();
        // The share of the cycle where the dash is drawn at all: from the last dark keyframe before
        // the first lit one, to the first dark keyframe after the last lit one.
        const fades = frames.filter((f) => f.opacity !== undefined).map((f) => ({ at: f.computedOffset, lit: Number(f.opacity) > 0 }));
        const first = fades.findIndex((f) => f.lit);
        const last = fades.findLastIndex((f) => f.lit);
        const offsets = frames.filter((f) => f.strokeDashoffset !== undefined);
        return {
          dash: getComputedStyle(p).strokeDasharray,
          duration: timing?.duration,
          delay: timing?.delay,
          from: offsets[0]?.strokeDashoffset,
          to: offsets.at(-1)?.strokeDashoffset,
          shown: first < 0 ? 1 : (fades[last + 1]?.at ?? 1) - (fades[first - 1]?.at ?? 0),
        };
      }),
    );
    expect(signals.map((s) => s.delay)).toEqual([0, 2200, 4500, 6700]);
    for (const s of signals) {
      expect(s.dash).toMatch(/^6(px)?,? 94(px)?$/);
      expect(s.duration).toBe(9000);
      expect(String(s.from)).toMatch(/^100(px)?$/);
      expect(String(s.to)).toMatch(/^0(px)?$/);
      expect(s.shown).toBeGreaterThan(0);
      expect(s.shown).toBeLessThanOrEqual(0.3);
    }
  });

  test('the turn of SW2 is one transition of 600ms, then only the ambient set runs', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');
    await expect(page.locator('.board__face--front button.sw2')).toBeVisible();
    await page.locator('.board__face--front button.sw2').click();
    // The body (the board) and its edge turn together: one transition of their transform, and the
    // short step back while they are edge-on, over the same 600ms.
    const turning = await page.evaluate(() =>
      ['.board__body', '.board__edge'].map((s) => {
        const el = document.querySelector(s) as Element;
        return el
          .getAnimations()
          .map((a) => {
            const timing = a.effect?.getTiming();
            const name = 'transitionProperty' in a ? (a as CSSTransition).transitionProperty : (a as CSSAnimation).animationName;
            return `${name} ${timing?.duration} ${timing?.easing}`;
          })
          .sort();
      }),
    );
    const turn = ['board-recede 600 linear', 'transform 600 cubic-bezier(0.2, 0.7, 0.2, 1)'];
    expect(turning).toEqual([turn, turn]);
    await expect(page.locator('.board')).not.toHaveAttribute('data-turning', /.*/);
    expect((await running(page)).sort()).toEqual([
      'led-breathe part-led1::after',
      'signal signal',
      'signal signal',
      'signal signal',
      'signal signal',
    ]);
  });

  test('the language switch is a view transition', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.addInitScript(() => {
      const w = window as unknown as { transitions: number };
      w.transitions = 0;
      const start = document.startViewTransition?.bind(document);
      if (start) {
        document.startViewTransition = ((cb: ViewTransitionUpdateCallback) => {
          w.transitions += 1;
          return start(cb);
        }) as typeof document.startViewTransition;
      }
    });
    await page.goto('/');
    await expect(page.locator('button.jp1')).toBeVisible();
    const supported = await page.evaluate(() => {
      (window as unknown as { samePage: boolean }).samePage = true;
      return 'startViewTransition' in document;
    });
    await page.getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText('no shortcuts');
    // Client-side: the app stays mounted (no page load), through a view transition where there is one.
    expect(await page.evaluate(() => (window as unknown as { samePage?: boolean }).samePage)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { transitions: number }).transitions)).toBe(supported ? 1 : 0);
  });
});

test('under reduced motion the language switch is immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const w = window as unknown as { transitions: number };
    w.transitions = 0;
    if ('startViewTransition' in document) {
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = ((cb: ViewTransitionUpdateCallback) => {
        w.transitions += 1;
        return start(cb);
      }) as typeof document.startViewTransition;
    }
  });
  await page.goto('/');
  await expect(page.locator('button.jp1')).toBeVisible();
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/$/);
  expect(await page.evaluate(() => (window as unknown as { transitions: number }).transitions)).toBe(0);
});
