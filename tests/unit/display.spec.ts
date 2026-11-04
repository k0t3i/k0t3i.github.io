import { mount, type VueWrapper } from '@vue/test-utils';
import { createSSRApp, defineComponent, h, nextTick, provide, readonly, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DisplayModule from '../../src/components/DisplayModule.vue';
import { provideBoardState, type BoardState } from '../../src/composables/useBoardState';
import { READOUT_HOLD_MS, useDisplay, type Display } from '../../src/composables/useDisplay';
import { FLIP } from '../../src/composables/useFlip';
import { fr } from '../../src/content/fr';
import { READOUTS } from '../../src/content/readouts';
import type { Locale, PartId } from '../../src/content/types';
import { encodeMorse, morseTimeline, MORSE_UNIT_MS } from '../../src/lib/morse';
import { layoutText } from '../../src/lib/pixelFont';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
type Listener = (event: { matches: boolean }) => void;
let reducedListeners = new Set<Listener>();
let reducedMatches = false;

/** Reduced motion or not, as the test sets it; a change reaches the listeners (changeMotion()). */
function stubMotion(reduced: boolean): void {
  reducedMatches = reduced;
  reducedListeners = new Set();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === REDUCED_QUERY ? reducedMatches : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, l: Listener) => {
      if (query === REDUCED_QUERY) reducedListeners.add(l);
    },
    removeEventListener: (_: string, l: Listener) => reducedListeners.delete(l),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function changeMotion(reduced: boolean): void {
  reducedMatches = reduced;
  for (const l of [...reducedListeners]) l({ matches: reduced });
}

const REFS = Object.fromEntries([...fr.principles, ...fr.connectors].map((p) => [p.id, p.ref])) as Record<PartId, string>;

/** A component that runs `setup` and renders what it returns: one factory (vue/one-component-per-file). */
const component = (setup: () => () => ReturnType<typeof h>) => defineComponent({ setup });

/**
 * A board as BoardPage sets it up for DISP1: its state (the active part, the power-on), SW2 (the
 * flip), and the language of the page; `child` runs on it, as DISP1 does.
 */
function onBoard(child: () => ReturnType<typeof h>, opts: { booting?: boolean } = {}) {
  const booting = ref(opts.booting ?? false);
  const flipped = ref(false);
  let board: BoardState | undefined;
  const Board = component(() => {
    // The power-on, ended by the visitor acting (BoardPage gives useBoot's end()).
    board = provideBoardState(readonly(booting), () => (booting.value = false));
    provide(FLIP, { flipped: readonly(flipped), ready: readonly(ref(true)), toggle: () => (flipped.value = !flipped.value) });
    return () => h('div', { class: 'board' }, [child()]);
  });
  return { Board, booting, flipped, board: () => board as BoardState };
}

/** useDisplay on a board: the display, and what drives it (the board, SW2, the language). */
function mountDisplay(opts: { booting?: boolean } = {}) {
  const locale = ref<Locale>('fr');
  let display: Display | undefined;
  const Disp = component(() => {
    display = useDisplay(() => locale.value);
    return () => h('figure');
  });
  const { Board, booting, flipped, board } = onBoard(() => h(Disp), opts);
  const wrapper = mount(Board, { attachTo: document.body });
  return { wrapper, booting, flipped, locale, board: board(), d: display as Display };
}

/** Each step of HELLO, after the lead-in: whether LED1 is on, and the signal being sent. */
const HELLO = morseTimeline(encodeMorse('HELLO'), MORSE_UNIT_MS);
const GAP = 3 * MORSE_UNIT_MS;

/** The pixels of a path drawn by PixelScreen (rectangles one pixel high), moved to the origin. */
function pixelsOf(d: string): string[] {
  const out: [number, number][] = [];
  for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < Number(w); i++) out.push([Number(x) + i, Number(y)]);
  return atOrigin(out);
}
const atOrigin = (px: [number, number][]): string[] => {
  const x0 = Math.min(...px.map((p) => p[0]));
  const y0 = Math.min(...px.map((p) => p[1]));
  return px.map(([x, y]) => `${x - x0},${y - y0}`).sort();
};
const textPixels = (text: string, scale: 1 | 2) => atOrigin(layoutText(text, scale).map((p) => [p.x, p.y]));

// happy-dom sets a timer of its own when the first element is attached to its document: let it do so
// before the fake timers, which then count only the timers of DISP1.
mount(component(() => () => h('div')), { attachTo: document.body }).unmount();

beforeEach(() => {
  vi.useFakeTimers();
  stubMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useDisplay', () => {
  it('shows the boot while the board powers on', async () => {
    const { d, booting } = mountDisplay({ booting: true });
    expect(d.screen.value).toBe('boot');
    booting.value = false;
    await nextTick();
    expect(d.screen.value).toBe('avatar');
  });

  it('SW1 ends the boot: the screen is the one the caption names', async () => {
    const { d, booting } = mountDisplay({ booting: true });
    expect(d.screen.value).toBe('boot');
    d.cycle();
    expect(booting.value).toBe(false);
    expect(d.screen.value).toBe('uptime');
    expect(d.chosen.value).toBe('uptime');
  });

  it('display: readout while a part is active, back to previous 400ms after', async () => {
    const { d, board } = mountDisplay();
    d.cycle();
    expect(d.screen.value).toBe('uptime');
    board.setActive('r1');
    await nextTick();
    expect(d.screen.value).toBe('readout');
    expect(d.part.value).toBe('r1');
    // The screen chosen with SW1 is still the one the caption names.
    expect(d.chosen.value).toBe('uptime');

    board.setActive(null);
    await nextTick();
    vi.advanceTimersByTime(READOUT_HOLD_MS - 1);
    expect(d.screen.value).toBe('readout');
    expect(d.part.value).toBe('r1');
    vi.advanceTimersByTime(1);
    expect(d.screen.value).toBe('uptime');
    expect(d.part.value).toBeNull();
    expect(READOUT_HOLD_MS).toBe(400);

    // From one part to the next within the hold: straight to the next readout, never back in between.
    board.setActive('c1');
    await nextTick();
    board.setActive(null);
    await nextTick();
    vi.advanceTimersByTime(READOUT_HOLD_MS / 2);
    board.setActive('d1');
    await nextTick();
    vi.advanceTimersByTime(READOUT_HOLD_MS * 2);
    expect(d.screen.value).toBe('readout');
    expect(d.part.value).toBe('d1');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('SW1 pressed while the readout of a part just left lingers shows the screen it chose at once', async () => {
    const { d, board } = mountDisplay();
    // From J5 to SW1 (Tab, or the mouse): J5's readout would stay READOUT_HOLD_MS.
    board.setActive('j5');
    await nextTick();
    board.setActive(null);
    await nextTick();
    expect(d.screen.value).toBe('readout');
    d.cycle();
    // The screen is the one the caption now names.
    expect(d.chosen.value).toBe('uptime');
    expect(d.screen.value).toBe('uptime');
    expect(d.part.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a part still pointed at keeps its readout over the screen SW1 chose', async () => {
    const { d, board } = mountDisplay();
    board.setActive('r1');
    await nextTick();
    d.cycle();
    expect(d.chosen.value).toBe('uptime');
    expect(d.screen.value).toBe('readout');
    expect(d.part.value).toBe('r1');
  });

  it('cycle avatar → uptime → morse → avatar', () => {
    const { d } = mountDisplay();
    const seen = [d.screen.value];
    for (let i = 0; i < 3; i++) {
      d.cycle();
      seen.push(d.screen.value);
      expect(d.chosen.value).toBe(d.screen.value);
    }
    expect(seen).toEqual(['avatar', 'uptime', 'morse', 'avatar']);
  });

  it('the Morse code keys LED1 once, along its timeline, between two letter gaps', () => {
    const { d } = mountDisplay();
    expect(d.sending.value).toBeNull();
    d.cycle();
    d.cycle();
    expect(d.screen.value).toBe('morse');
    // LED1 goes dark for a letter gap first: the message starts after it.
    expect(d.sending.value).toBe(-1);
    expect(d.ledOn.value).toBe(false);
    vi.advanceTimersByTime(GAP);
    let signal = -1;
    for (const step of HELLO) {
      if (step.on) signal++;
      expect(d.ledOn.value).toBe(step.on);
      expect(d.sending.value).toBe(step.on ? signal : -1);
      vi.advanceTimersByTime(step.ms);
    }
    // Dark again for a letter gap, then LED1 is back at rest; the code stays on the screen until SW1.
    expect(d.ledOn.value).toBe(false);
    expect(d.sending.value).toBe(-1);
    vi.advanceTimersByTime(GAP);
    expect(d.sending.value).toBeNull();
    expect(d.ledOn.value).toBe(false);
    expect(d.screen.value).toBe('morse');
    // Once only: nothing is left to run.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(d.sending.value).toBeNull();
  });

  it('pressing SW1 during morse stops it and turns the LED off', () => {
    const { d } = mountDisplay();
    d.cycle();
    d.cycle();
    vi.advanceTimersByTime(GAP);
    expect(d.ledOn.value).toBe(true);
    d.cycle();
    expect(d.screen.value).toBe('avatar');
    expect(d.ledOn.value).toBe(false);
    expect(d.sending.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(20_000);
    expect(d.ledOn.value).toBe(false);
    expect(d.screen.value).toBe('avatar');
  });

  it('unmount clears timers', async () => {
    const { d, board, wrapper } = mountDisplay();
    d.cycle();
    d.cycle();
    board.setActive('r1');
    await nextTick();
    board.setActive(null);
    await nextTick();
    // The Morse code and the hold of the readout.
    expect(vi.getTimerCount()).toBe(2);
    const listeners = vi.spyOn(document, 'removeEventListener');
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(listeners).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('reduced motion: no LED blinking, static morse', async () => {
    stubMotion(true);
    const { d } = mountDisplay();
    d.cycle();
    d.cycle();
    expect(d.screen.value).toBe('morse');
    expect(d.sending.value).toBeNull();
    expect(d.ledOn.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    // Reduced motion asked for while the code is being sent: it stops, and the code stays on the screen.
    stubMotion(false);
    const other = mountDisplay();
    // Mounted: the device setting is known (it is reduced until then).
    await nextTick();
    other.d.cycle();
    other.d.cycle();
    vi.advanceTimersByTime(GAP);
    expect(other.d.ledOn.value).toBe(true);
    changeMotion(true);
    await nextTick();
    expect(other.d.sending.value).toBeNull();
    expect(other.d.ledOn.value).toBe(false);
    expect(other.d.screen.value).toBe('morse');
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('Escape, a language switch or a turn of the board put DISP1 back at rest', () => {
    /** The Morse code under way, and the readout of a part just left. */
    async function busy() {
      const m = mountDisplay();
      m.d.cycle();
      m.d.cycle();
      vi.advanceTimersByTime(GAP);
      m.board.setActive('j1');
      await nextTick();
      m.board.setActive(null);
      await nextTick();
      expect(m.d.ledOn.value).toBe(true);
      expect(m.d.screen.value).toBe('readout');
      return m;
    }
    const atRest = (d: Display) => {
      expect(d.screen.value).toBe('avatar');
      expect(d.chosen.value).toBe('avatar');
      expect(d.ledOn.value).toBe(false);
      expect(d.sending.value).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    };

    it('Escape', async () => {
      const { d } = await busy();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(d.ledOn.value).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      atRest(d);
    });

    it('a language switch', async () => {
      const { d, locale } = await busy();
      locale.value = 'en';
      await nextTick();
      atRest(d);
    });

    it('a turn of the board: nothing runs unseen, and the front face comes back on the avatar', async () => {
      const { d, flipped } = await busy();
      flipped.value = true;
      await nextTick();
      atRest(d);
      flipped.value = false;
      await nextTick();
      atRest(d);
    });

    it('Escape leaves a still screen as it is (it also closes the sheets)', () => {
      const { d } = mountDisplay();
      d.cycle();
      expect(d.screen.value).toBe('uptime');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(d.chosen.value).toBe('uptime');
      expect(d.screen.value).toBe('uptime');
      // The Morse code once sent is still too.
      d.cycle();
      vi.advanceTimersByTime(60_000);
      expect(d.sending.value).toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(d.chosen.value).toBe('morse');
    });

    it('Escape while only the hold of a readout runs: back on the avatar', async () => {
      const { d, board } = mountDisplay();
      d.cycle();
      board.setActive('r1');
      await nextTick();
      board.setActive(null);
      await nextTick();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      atRest(d);
    });

    it('a part still pointed at keeps its readout', async () => {
      const { d, board } = mountDisplay();
      board.setActive('c1', 'focus');
      await nextTick();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(d.screen.value).toBe('readout');
      expect(d.part.value).toBe('c1');
    });
  });
});

describe('DisplayModule', () => {
  function mountModule() {
    const { Board, board } = onBoard(() => h(DisplayModule, { display: fr.display, locale: 'fr', refs: REFS }));
    const wrapper: VueWrapper = mount(Board, { attachTo: document.body });
    const get = {
      figure: () => wrapper.get('figure.disp').element as HTMLElement,
      caption: () => wrapper.get('figcaption#disp1-caption'),
      avatar: () => wrapper.get('img.disp__avatar'),
      pixels: () => wrapper.get('svg.disp__pixels'),
      sw1: () => wrapper.get('button.sw1'),
    };
    return { wrapper, board: board(), get };
  }

  it('the caption names the screens chosen with SW1 only, and the avatar stays in the figure', async () => {
    const { board, get } = mountModule();
    await nextTick();
    expect(get.caption().text()).toBe(fr.display.captions.avatar);
    expect(get.caption().attributes('aria-live')).toBe('polite');
    expect(get.avatar().classes()).not.toContain('disp__avatar--off');
    expect(get.pixels().attributes('data-screen')).toBe('avatar');

    await get.sw1().trigger('click');
    expect(get.caption().text()).toBe(fr.display.captions.uptime);
    expect(get.pixels().attributes('data-screen')).toBe('uptime');
    // Out of sight on the other screens, but still in the figure, with its text alternative.
    expect(get.avatar().classes()).toContain('disp__avatar--off');
    expect(get.avatar().attributes('alt')).toBe(fr.display.alt);

    // A readout passes over the screen: the caption does not change.
    board.setActive('led1');
    await nextTick();
    expect(get.pixels().attributes('data-screen')).toBe('readout');
    expect(get.caption().text()).toBe(fr.display.captions.uptime);
    board.setActive(null);
    await nextTick();
    vi.advanceTimersByTime(READOUT_HOLD_MS);
    await nextTick();
    expect(get.pixels().attributes('data-screen')).toBe('uptime');

    await get.sw1().trigger('click');
    expect(get.caption().text()).toBe(fr.display.captions.morse);
    // LED1 is keyed by the code: dark for the lead-in, then on for the first dot.
    expect(get.figure().dataset.led).toBe('off');
    vi.advanceTimersByTime(GAP);
    await nextTick();
    expect(get.figure().dataset.led).toBe('on');

    await get.sw1().trigger('click');
    expect(get.caption().text()).toBe(fr.display.captions.avatar);
    expect(get.figure().hasAttribute('data-led')).toBe(false);
    expect(get.avatar().classes()).not.toContain('disp__avatar--off');
  });

  it('draws each screen in pixels on a 64 x 64 grid, hidden from assistive technologies', async () => {
    const { board, get } = mountModule();
    await nextTick();
    const svg = get.pixels();
    expect(svg.attributes('viewBox')).toBe('0 0 64 64');
    expect(svg.attributes('shape-rendering')).toBe('crispEdges');
    expect(svg.attributes('aria-hidden')).toBe('true');
    // The avatar is the image: no pixels drawn over it.
    expect(svg.element.children).toHaveLength(0);
    // Every pixel drawn falls on the 64 x 64 grid, on every screen.
    const inGrid = () => {
      for (const path of svg.findAll('path')) {
        for (const [, x, y, w] of (path.attributes('d') ?? '').matchAll(/M(\d+) (\d+)h(\d+)/g)) {
          expect(Number(x)).toBeGreaterThanOrEqual(0);
          expect(Number(x) + Number(w)).toBeLessThanOrEqual(64);
          expect(Number(y)).toBeLessThan(64);
        }
      }
    };

    // The readout: the reference of the part, large, its value under it, and a trace that scrolls.
    board.setActive('r1');
    await nextTick();
    expect(pixelsOf(svg.get('.px--ref').attributes('d') ?? '')).toEqual(textPixels('R1', 2));
    expect(pixelsOf(svg.get('.px--value').attributes('d') ?? '')).toEqual(textPixels(READOUTS.r1, 1));
    expect(svg.get('polyline.disp__wave').attributes('points')).toMatch(/^[\d. ,]+$/);
    board.setActive('j1');
    await nextTick();
    expect(pixelsOf(svg.get('.px--value').attributes('d') ?? '')).toEqual(textPixels(READOUTS.j1, 1));
    // The two projects of revision 7: MYCARD and SCORE, with their references, and a trace of their own.
    const waves = new Set<string>();
    for (const [id, ref, value] of [
      ['j3', 'J3', 'MYCARD'],
      ['j4', 'J4', 'SCORE'],
      ['j5', 'J5', 'MAIL'],
    ] as const) {
      board.setActive(id);
      await nextTick();
      expect(pixelsOf(svg.get('.px--ref').attributes('d') ?? ''), id).toEqual(textPixels(ref, 2));
      expect(pixelsOf(svg.get('.px--value').attributes('d') ?? ''), id).toEqual(textPixels(value, 1));
      waves.add(svg.get('polyline.disp__wave').attributes('points') ?? '');
      inGrid();
    }
    expect(waves.size).toBe(3);
    inGrid();
    board.setActive('led1');
    await nextTick();
    inGrid();
    board.setActive(null);
    await nextTick();
    vi.advanceTimersByTime(READOUT_HOLD_MS);
    await nextTick();

    // The uptime: the digits, large, and H.
    await get.sw1().trigger('click');
    const digits = pixelsOf(svg.get('.px--digits').attributes('d') ?? '');
    expect(digits.length).toBeGreaterThan(100);
    expect(pixelsOf(svg.get('.px--unit').attributes('d') ?? '')).toEqual(textPixels('H', 1));
    inGrid();

    // The Morse code: each letter of HELLO and its signals; the one being sent is lit.
    await get.sw1().trigger('click');
    inGrid();
    expect(pixelsOf(svg.get('.px--letters').attributes('d') ?? '').length).toBe(
      ['H', 'E', 'L', 'L', 'O'].reduce((n, c) => n + layoutText(c, 1).length, 0),
    );
    expect(svg.find('.px--sending').exists()).toBe(false);
    vi.advanceTimersByTime(GAP);
    await nextTick();
    // The first dot of H: one 3 x 3 square.
    expect(pixelsOf(svg.get('.px--sending').attributes('d') ?? '')).toHaveLength(9);
  });

  it('the boot draws its two lines over the dark screen, and keeps the avatar under it', async () => {
    const { Board } = onBoard(() => h(DisplayModule, { display: fr.display, locale: 'fr', refs: REFS }), { booting: true });
    const wrapper = mount(Board, { attachTo: document.body });
    await nextTick();
    const svg = wrapper.get('svg.disp__pixels');
    expect(svg.attributes('data-screen')).toBe('boot');
    // BOOT, its three dots one by one, then OK.
    expect(svg.findAll('.disp__boot > path')).toHaveLength(5);
    // The veil of the power-on lifts onto the avatar (motion.css).
    expect(wrapper.get('img.disp__avatar').classes()).not.toContain('disp__avatar--off');
  });

  it('SW1 tells DISP1 it is pressed', async () => {
    const { get } = mountModule();
    await get.sw1().trigger('click');
    expect(get.caption().text()).toBe(fr.display.captions.uptime);
  });

  it('the prerender of DISP1 is at rest', async () => {
    const { Board } = onBoard(() => h(DisplayModule, { display: fr.display, locale: 'fr', refs: REFS }));
    const html = await renderToString(createSSRApp(Board));
    expect(html).toContain(`>${fr.display.captions.avatar}</figcaption>`);
    expect(html).not.toMatch(/data-led|disp__avatar--off|style=/);
    // No pixel drawn over the avatar: only the anchor of the screens to come.
    expect(html).toMatch(/<svg class="disp__pixels"[^>]*data-screen="avatar"[^>]*>(<!--v-if-->)?<\/svg>/);
  });
});
