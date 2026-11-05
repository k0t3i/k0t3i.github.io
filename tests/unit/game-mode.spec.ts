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
/** The keys of the keypad the game was given (its press()), and its holds (hold()). */
const pressed: string[] = [];
const holds: boolean[] = [];
/** The sound switched on or off (sound(), Task 20). */
const sounds: boolean[] = [];
vi.mock('../../src/game/play', () => ({
  play: (host: GameHost) => {
    hosts.push(host);
    const stop = vi.fn();
    stops.push(stop);
    return Object.assign(stop, { press: (k: string) => pressed.push(k), hold: (on: boolean) => holds.push(on), sound: (on: boolean) => sounds.push(on) });
  },
}));

/** A sheet is open (lib/sheet.ts reads :popover-open, which happy-dom does not know). */
let sheetIsOpen = false;
vi.mock('../../src/lib/sheet', () => ({ sheetOpen: () => sheetIsOpen }));

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
  pressed.length = 0;
  holds.length = 0;
  sounds.length = 0;
  sheetIsOpen = false;
  localStorage.clear();
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
    expect(html).not.toContain('snd');
  });

  for (const [way, leave] of [
    ['Escape', async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
    ['SW1', async (w: VueWrapper) => w.get('button.sw1').trigger('click')],
    ['the code typed again', async () => type()],
    ['a language switch', async (_: VueWrapper, m: ReturnType<typeof mountBoard>) => (m.locale.value = 'en')],
  ] as [string, (w: VueWrapper, m: ReturnType<typeof mountBoard>) => Promise<unknown>][]) {
    it(`${way} ends it: the game stopped, the colours and DISP1 back`, async () => {
      const m = mountBoard();
      // SW1 chose the uptime before: DISP1 goes back to it.
      await m.wrapper.get('button.sw1').trigger('click');
      expect(caption(m.wrapper)).toBe(fr.display.captions.uptime);
      await start(m.wrapper);
      expect(m.wrapper.find('button.snd').exists()).toBe(true);
      await leave(m.wrapper, m);
      await flushPromises();
      await nextTick();
      expect(stops.at(-1)).toHaveBeenCalledTimes(1);
      const display = m.locale.value === 'en' ? en.display : fr.display;
      // A language switch puts DISP1 back on the avatar; the others keep the screen chosen.
      atRest(m.wrapper, way === 'a language switch' ? display.captions.avatar : display.captions.uptime);
      expect(m.wrapper.find('button.snd').exists()).toBe(false);
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
      // A language switch in the same task: an exit without a fade.
      m.locale.value = 'en';
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

  // Revision 11 (Anthony, 05/11/2026): the mode survives the turn of the board, both ways.
  it('a turn of the board keeps it: the game held while the back face is up, the colours kept, then let go', async () => {
    const m = mountBoard();
    await m.wrapper.get('button.sw1').trigger('click');
    await start(m.wrapper);
    m.flipped.value = true;
    await nextTick();
    expect(holds).toEqual([true]);
    expect(stops.at(-1)).not.toHaveBeenCalled();
    expect(root().hasAttribute('data-retro')).toBe(true);
    m.flipped.value = false;
    await nextTick();
    expect(holds).toEqual([true, false]);
    expect(screen(m.wrapper)).toBe('game');
    expect(caption(m.wrapper)).toBe(fr.display.captions.game);
    // Then a way out: DISP1 back on the screen SW1 chose.
    await m.wrapper.get('button.sw1').trigger('click');
    atRest(m.wrapper, fr.display.captions.uptime);
    m.wrapper.unmount();
  });

  it('the code typed with the back face up starts it, the game held on its title until the front comes back', async () => {
    const m = mountBoard();
    m.flipped.value = true;
    await nextTick();
    type();
    await flushPromises();
    await nextTick();
    expect(hosts).toHaveLength(1);
    expect(holds).toEqual([true]);
    expect(root().hasAttribute('data-retro')).toBe(true);
    // Its rules are not said into the inert front face; they are once it comes back, a moment after.
    expect(said(m.wrapper)).toBe('');
    m.flipped.value = false;
    await nextTick();
    expect(said(m.wrapper)).toBe('');
    await new Promise((r) => setTimeout(r, 200));
    expect(said(m.wrapper)).toBe(fr.display.game.intro);
    m.flipped.value = true;
    await nextTick();
    // Typed again, on either face, the code ends it.
    type();
    await nextTick();
    expect(stops.at(-1)).toHaveBeenCalledTimes(1);
    expect(root().hasAttribute('data-retro')).toBe(false);
    m.wrapper.unmount();
  });

  describe('the test keypad', () => {
    const CODE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];
    const tap = (w: VueWrapper, key: string): void => {
      (w.get(`.keypad__key[data-key="${key}"]`).element as HTMLButtonElement).click();
    };

    it('is in DISP1, after SW1 and before its caption (the caption stays last), and shown once mounted', async () => {
      const { wrapper } = mountBoard();
      await nextTick();
      const kids = [...wrapper.get('figure.disp').element.children].map((c) => c.classList[0]);
      expect(kids.slice(-3)).toEqual(['sw1', 'keypad', 'disp__caption']);
      expect(wrapper.get('.keypad__keys').attributes('hidden')).toBeUndefined();
      expect(wrapper.get('.keypad__keys').attributes('aria-label')).toBe(ORACLE_FR.keypad.group);
      wrapper.unmount();
    });

    it('the code pressed on it starts the game mode; then its keys go to the game, not to the code', async () => {
      const { wrapper } = mountBoard();
      await nextTick();
      for (const k of CODE) tap(wrapper, k);
      await flushPromises();
      await nextTick();
      expect(hosts).toHaveLength(1);
      expect(root().hasAttribute('data-retro')).toBe(true);
      expect(wrapper.get('.keypad').element.closest('.disp--game')).not.toBeNull();
      for (const k of ['a', 'up', 'left', 'b', 'b']) tap(wrapper, k);
      expect(pressed).toEqual(['a', 'up', 'left', 'b', 'b']);
      // The whole code pressed again is played, it does not end the game (the keyboard does).
      for (const k of CODE) tap(wrapper, k);
      await flushPromises();
      expect(wrapper.get('figure.disp').classes()).toContain('disp--game');
      // SW1 ends it, as always.
      await wrapper.get('button.sw1').trigger('click');
      await flushPromises();
      atRest(wrapper);
      wrapper.unmount();
    });

    it('the game mode brings DISP1 into view with its keypad, if it is not (the nearest edge, at once under reduced motion)', async () => {
      const seen: [Element, ScrollIntoViewOptions | boolean | undefined][] = [];
      const was = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, o?: ScrollIntoViewOptions | boolean) {
        seen.push([this, o]);
      };
      try {
        const { wrapper } = mountBoard();
        await nextTick();
        for (const k of CODE) tap(wrapper, k);
        await flushPromises();
        expect(seen).toEqual([[wrapper.get('figure.disp').element, { block: 'nearest', behavior: 'instant' }]]);
        wrapper.unmount();
      } finally {
        Element.prototype.scrollIntoView = was;
      }
    });

    it('a press while a sheet is open does nothing: no step of the code, nothing to the game', async () => {
      const { wrapper } = mountBoard();
      await nextTick();
      for (const k of CODE.slice(0, 9)) tap(wrapper, k);
      sheetIsOpen = true;
      tap(wrapper, 'a');
      await flushPromises();
      expect(hosts).toHaveLength(0);
      sheetIsOpen = false;
      tap(wrapper, 'a');
      await flushPromises();
      await nextTick();
      expect(hosts).toHaveLength(1);
      sheetIsOpen = true;
      tap(wrapper, 'a');
      tap(wrapper, 'b');
      expect(pressed).toEqual([]);
      wrapper.unmount();
    });

    it('does nothing while the back face is up', async () => {
      const m = mountBoard();
      m.flipped.value = true;
      await nextTick();
      for (const k of CODE) tap(m.wrapper, k);
      await flushPromises();
      expect(hosts).toHaveLength(0);
      m.wrapper.unmount();
    });
  });

  // Task 20: the SON switch, shown in the game mode only, on by default, its choice kept.
  describe('the sound switch', () => {
    const snd = (w: VueWrapper) => w.find('button.snd');

    it('none at rest; in the game mode a toggle, pressed (on by default), named, its positions drawn; the game told', async () => {
      const { wrapper } = mountBoard();
      await nextTick();
      expect(snd(wrapper).exists()).toBe(false);
      const host = await start(wrapper);
      expect(host.sound).toBe(true);
      const b = snd(wrapper);
      expect(b.attributes('type')).toBe('button');
      expect(b.attributes('aria-pressed')).toBe('true');
      // Named by its hidden text, as JP1 and SW2 are: no aria-label, whose name would not hold the positions drawn.
      expect(b.attributes('aria-label')).toBeUndefined();
      expect(b.get('.vh').text()).toBe(ORACLE_FR.game.sound.name);
      expect(b.get('.part__ref').text()).toBe(ORACLE_FR.game.sound.label);
      expect(b.findAll('[aria-hidden="true"]').map((e) => e.text())).toEqual([ORACLE_FR.game.sound.off, '', ORACLE_FR.game.sound.on, ORACLE_FR.game.sound.label]);
      // After SW1 and the keypad, before the caption: in the path of the keyboard, the caption still last.
      const kids = [...wrapper.get('figure.disp').element.children];
      expect(kids.indexOf(b.element)).toBe(kids.indexOf(wrapper.get('.keypad').element) + 1);
      expect(kids.at(-1)?.tagName).toBe('FIGCAPTION');
      wrapper.unmount();
    });

    it('a press toggles it, tells the game and keeps the choice; the next game mode starts with it', async () => {
      const m = mountBoard();
      await start(m.wrapper);
      await snd(m.wrapper).trigger('click');
      expect(snd(m.wrapper).attributes('aria-pressed')).toBe('false');
      expect(sounds).toEqual([false]);
      expect(localStorage.getItem('k0t3i.sound')).toBe('off');
      type();
      await nextTick();
      const host = await start(m.wrapper);
      expect(host.sound).toBe(false);
      expect(snd(m.wrapper).attributes('aria-pressed')).toBe('false');
      await snd(m.wrapper).trigger('click');
      expect(sounds).toEqual([false, true]);
      expect(localStorage.getItem('k0t3i.sound')).toBe('on');
      m.wrapper.unmount();
    });

    it('a choice kept from before: off', async () => {
      localStorage.setItem('k0t3i.sound', 'off');
      const m = mountBoard();
      const host = await start(m.wrapper);
      expect(host.sound).toBe(false);
      expect(snd(m.wrapper).attributes('aria-pressed')).toBe('false');
      m.wrapper.unmount();
    });

    it('focused as the mode ends, the focus goes to SW1, never lost', async () => {
      const m = mountBoard();
      await start(m.wrapper);
      (snd(m.wrapper).element as HTMLElement).focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await nextTick();
      expect(snd(m.wrapper).exists()).toBe(false);
      expect(document.activeElement).toBe(m.wrapper.get('button.sw1').element);
      m.wrapper.unmount();
    });
  });
});
