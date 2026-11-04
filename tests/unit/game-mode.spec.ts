import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createSSRApp, defineComponent, h, nextTick, provide, readonly, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DisplayModule from '../../src/components/DisplayModule.vue';
import { provideBoardState, type BoardState } from '../../src/composables/useBoardState';
import { FLIP } from '../../src/composables/useFlip';
import { en } from '../../src/content/en';
import { fr } from '../../src/content/fr';
import type { Locale, PartId } from '../../src/content/types';
import type { GameHost } from '../../src/game/play';
import { EN as ORACLE_EN, FR as ORACLE_FR } from '../helpers/copy';

/*
 * The game mode of DISP1 (revision 8): the code typed starts it, every way out ends it, and DISP1,
 * its caption, the page colours and the timers are back as they were. The game itself (game/play.ts,
 * a chunk of its own) is replaced here by a stand-in that records what DISP1 gave it.
 */

const hosts: GameHost[] = [];
const stops: ReturnType<typeof vi.fn>[] = [];
vi.mock('../../src/game/play', () => ({
  play: (host: GameHost) => {
    hosts.push(host);
    const stop = vi.fn();
    stops.push(stop);
    return stop;
  },
}));

const TYPED = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const type = (keys = TYPED): void => {
  for (const key of keys) document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

/** A component that runs `setup` and renders what it returns: one factory (vue/one-component-per-file). */
const component = (setup: () => () => ReturnType<typeof h>) => defineComponent({ setup });

const REFS = Object.fromEntries([...fr.principles, ...fr.connectors].map((p) => [p.id, p.ref])) as Record<PartId, string>;

function stubMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduced : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** DISP1 on a board, as BoardPage sets it up: the state of the board, SW2, the language of the page. */
function mountBoard(): { wrapper: VueWrapper; flipped: ReturnType<typeof ref<boolean>>; locale: ReturnType<typeof ref<Locale>>; board: () => BoardState } {
  const flipped = ref(false);
  const locale = ref<Locale>('fr');
  let state: BoardState | undefined;
  const Board = component(() => {
    state = provideBoardState(readonly(ref(false)));
    provide(FLIP, { flipped: readonly(flipped), ready: readonly(ref(true)), toggle: () => (flipped.value = !flipped.value) });
    return () => h('div', { class: 'board' }, [h(DisplayModule, { display: locale.value === 'fr' ? fr.display : en.display, locale: locale.value, refs: REFS })]);
  });
  const wrapper = mount(Board, { attachTo: document.body });
  return { wrapper, flipped, locale, board: () => state as BoardState };
}

const root = (): HTMLElement => document.documentElement;
const said = (w: VueWrapper): string => w.get('figure.disp p.vh[aria-live="polite"]').text();
const caption = (w: VueWrapper): string => w.get('#disp1-caption').text();
const screen = (w: VueWrapper): string | undefined => w.get('svg.disp__pixels').attributes('data-screen');

/** The code typed, and the game loaded. */
async function start(w: VueWrapper): Promise<GameHost> {
  type();
  await flushPromises();
  await nextTick();
  const host = hosts.at(-1);
  if (!host) throw new Error('the game did not start');
  void w;
  return host;
}

/** The page as it is at rest: no game, no retro colours, DISP1 on the screen chosen with SW1. */
function atRest(w: VueWrapper, chosen = fr.display.captions.avatar): void {
  expect(root().hasAttribute('data-retro')).toBe(false);
  expect(w.get('figure.disp').classes()).not.toContain('disp--game');
  expect(caption(w)).toBe(chosen);
  expect(said(w)).toBe('');
  expect(screen(w)).not.toBe('game');
}

beforeEach(() => {
  stubMotion(true);
  hosts.length = 0;
  stops.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete root().dataset.retro;
});

describe('the game mode of DISP1', () => {
  it('the code starts it: the retro colours, its caption, the rules said once, its screen; the game gets DISP1', async () => {
    const { wrapper } = mountBoard();
    await nextTick();
    atRest(wrapper);
    const host = await start(wrapper);
    expect(root().hasAttribute('data-retro')).toBe(true);
    expect(wrapper.get('figure.disp').classes()).toContain('disp--game');
    expect(caption(wrapper)).toBe(ORACLE_FR.captions.game);
    expect(said(wrapper)).toBe(ORACLE_FR.game.intro);
    expect(screen(wrapper)).toBe('game');
    expect(host.el).toBe(wrapper.get('.disp__screen').element);
    // What the game draws is what DISP1 shows, each layer a path of its own (decor, aria-hidden).
    host.draw([
      { part: 'frame', d: 'M0 0h64v1h-64z' },
      { part: 'head', d: 'M14 30h4v1h-4z' },
    ]);
    await nextTick();
    const paths = wrapper.findAll('svg.disp__pixels path');
    expect(paths.map((p) => [p.classes().join(' '), p.attributes('d')])).toEqual([
      ['px px--frame', 'M0 0h64v1h-64z'],
      ['px px--head', 'M14 30h4v1h-4z'],
    ]);
    expect(wrapper.get('svg.disp__pixels').attributes('aria-hidden')).toBe('true');
    // The avatar is out of sight under the game, still in the figure.
    expect(wrapper.get('img.disp__avatar').classes()).toContain('disp__avatar--off');
    wrapper.unmount();
  });

  it('a game over is said with its count, as each language counts; a new game clears it', async () => {
    for (const [locale, oracle] of [
      ['fr', ORACLE_FR],
      ['en', ORACLE_EN],
    ] as const) {
      const m = mountBoard();
      m.locale.value = locale;
      await nextTick();
      const host = await start(m.wrapper);
      for (const n of [0, 1, 2, 12]) {
        host.over(n);
        await nextTick();
        expect(said(m.wrapper), `${locale} ${n}`).toBe(oracle.game.over(n));
        host.playing();
        await nextTick();
        expect(said(m.wrapper)).toBe('');
      }
      m.wrapper.unmount();
    }
  });

  it('a part pointed at while it runs leaves the game on DISP1', async () => {
    const { wrapper, board } = mountBoard();
    await start(wrapper);
    board().setActive('r1');
    await nextTick();
    expect(screen(wrapper)).toBe('game');
    board().setActive(null);
    wrapper.unmount();
  });

  it('nothing of it in the prerender', async () => {
    const Board = component(() => {
      provideBoardState(readonly(ref(false)));
      return () => h(DisplayModule, { display: fr.display, locale: 'fr', refs: REFS });
    });
    const html = await renderToString(createSSRApp(Board));
    expect(html).toContain('<figure id="disp1" class="disp" aria-labelledby="disp1-caption">');
    expect(html).not.toContain('data-retro');
    expect(html).toMatch(/<p class="vh" aria-live="polite"><\/p>/);
  });

  for (const [way, leave] of [
    ['Escape', async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
    ['SW1', async (w: VueWrapper) => w.get('button.sw1').trigger('click')],
    ['the code typed again', async () => type()],
    ['a turn of the board', async (_: VueWrapper, m: ReturnType<typeof mountBoard>) => (m.flipped.value = true)],
    ['a language switch', async (_: VueWrapper, m: ReturnType<typeof mountBoard>) => (m.locale.value = 'en')],
  ] as [string, (w: VueWrapper, m: ReturnType<typeof mountBoard>) => Promise<unknown>][]) {
    it(`${way} ends it: the game stopped, the colours and DISP1 back`, async () => {
      const m = mountBoard();
      // SW1 chose the uptime before: DISP1 goes back to it.
      await m.wrapper.get('button.sw1').trigger('click');
      expect(caption(m.wrapper)).toBe(fr.display.captions.uptime);
      await start(m.wrapper);
      await leave(m.wrapper, m);
      await flushPromises();
      await nextTick();
      expect(stops.at(-1)).toHaveBeenCalledTimes(1);
      const display = m.locale.value === 'en' ? en.display : fr.display;
      // A language switch, as a turn of the board, puts DISP1 back on the avatar; the others keep the screen chosen.
      const back = way === 'a language switch' ? display.captions.avatar : display.captions.uptime;
      atRest(m.wrapper, way === 'a turn of the board' ? display.captions.avatar : back);
      m.wrapper.unmount();
    });
  }

  it('an exit while the colours are still to cross-fade in leaves them off', async () => {
    // Motion welcome: the colours come in a view transition, whose update runs a frame later.
    stubMotion(false);
    const pending: (() => void)[] = [];
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (cb: () => void) => {
        pending.push(cb);
        return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition: () => {} };
      },
    });
    try {
      const m = mountBoard();
      await nextTick();
      type();
      // SW2 in the same task: an exit without a fade.
      m.flipped.value = true;
      await nextTick();
      for (const cb of pending.splice(0)) cb();
      await flushPromises();
      expect(root().hasAttribute('data-retro')).toBe(false);
      m.wrapper.unmount();
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });

  it('leaving the page ends it, also when the browser keeps the page for its back button', async () => {
    const { wrapper } = mountBoard();
    await start(wrapper);
    wrapper.unmount();
    expect(stops.at(-1)).toHaveBeenCalledTimes(1);
    expect(root().hasAttribute('data-retro')).toBe(false);
    // Kept in the back-forward cache: the page is hidden, not unmounted, and comes back as it was left.
    const m = mountBoard();
    await start(m.wrapper);
    window.dispatchEvent(new Event('pagehide'));
    await nextTick();
    expect(stops.at(-1)).toHaveBeenCalledTimes(1);
    atRest(m.wrapper);
    m.wrapper.unmount();
  });

  it('quit before the game has loaded: it never starts', async () => {
    const { wrapper } = mountBoard();
    type();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    await nextTick();
    expect(hosts).toHaveLength(0);
    atRest(wrapper);
    wrapper.unmount();
  });

  it('the code does nothing while the back face is up', async () => {
    const m = mountBoard();
    m.flipped.value = true;
    await nextTick();
    type();
    await flushPromises();
    expect(hosts).toHaveLength(0);
    expect(root().hasAttribute('data-retro')).toBe(false);
    m.wrapper.unmount();
  });
});
