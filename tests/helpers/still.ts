import type { Page } from '@playwright/test';

/*
 * Waits measured in the page, frame by frame, rather than with the clock of the test: a browser slowed
 * down by a full run (a headless Firefox at a few frames a second) takes as many frames as it needs.
 */

type Samples = Window & { stillSamples?: Record<string, string[]> };
type What = { selector: string; read: 'tilt' | 'box' };

let waits = 0;

/** Resolves once what `what` reads is the same three frames in a row: unchanged over two frames. */
async function still(page: Page, what: What): Promise<void> {
  const key = `${what.read} ${what.selector} ${++waits}`;
  await page.waitForFunction(
    ({ key, selector, read }) => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const now = read === 'tilt' ? ['--tilt-x', '--tilt-y'].map((p) => el.style.getPropertyValue(p)).join() : [r.x, r.y, r.width, r.height].join();
      const seen = (((window as Samples).stillSamples ??= {})[key] ??= []);
      seen.push(now);
      return seen.length >= 3 && seen.slice(-3).every((v) => v === now);
    },
    { key, ...what },
    { polling: 'raf' },
  );
}

/** The board has come to its angle: the tilt written on its body has not changed over two frames. */
export const tiltStill = (page: Page): Promise<void> => still(page, { selector: '.board__body', read: 'tilt' });

/** The element's box has not changed over two frames (an anchored sheet that has found its place). */
export const boxStill = (page: Page, selector: string): Promise<void> => still(page, { selector, read: 'box' });

type FlatTiming = Window & { tiltLeftAt?: number; tiltFlatAt?: number };

/**
 * Arms a measure in the page: the time from the pointer leaving the board to the board flat again
 * (data-tilting removed). Call it while the board leans, then leave the board, then read `flatAfter`.
 */
export const armFlatTiming = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const board = document.querySelector('div.board');
    if (!board) throw new Error('no board');
    const w = window as FlatTiming;
    delete w.tiltLeftAt;
    delete w.tiltFlatAt;
    board.addEventListener('pointerleave', () => (w.tiltLeftAt = performance.now()), { once: true });
    new MutationObserver((_, observer) => {
      if (w.tiltLeftAt !== undefined && !board.hasAttribute('data-tilting')) {
        w.tiltFlatAt = performance.now();
        observer.disconnect();
      }
    }).observe(board, { attributes: true, attributeFilter: ['data-tilting'] });
  });

/** How long the board took to come back flat after the pointer left it, in ms, measured in the page. */
export async function flatAfter(page: Page): Promise<number> {
  const handle = await page.waitForFunction(() => {
    const w = window as FlatTiming;
    return w.tiltLeftAt !== undefined && w.tiltFlatAt !== undefined ? Math.max(w.tiltFlatAt - w.tiltLeftAt, 0.001) : null;
  });
  return (await handle.jsonValue()) as number;
}
