import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLOW_PITCH, useGlow } from '../../src/composables/useGlow';

/** A mouse or a pen: the glow is a lamp over the mat, never under a finger. */
const FINE_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

type Listener = (event: { matches: boolean }) => void;
let queries = new Map<string, { matches: boolean; listeners: Set<Listener> }>();

function stubMedia({ fine, reduced }: { fine: boolean; reduced: boolean }): void {
  queries = new Map([
    [FINE_QUERY, { matches: fine, listeners: new Set() }],
    [REDUCED_QUERY, { matches: reduced, listeners: new Set() }],
  ]);
  vi.stubGlobal('matchMedia', (query: string) => {
    const q = queries.get(query) ?? { matches: false, listeners: new Set<Listener>() };
    queries.set(query, q);
    return {
      get matches() {
        return q.matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, l: Listener) => q.listeners.add(l),
      removeEventListener: (_: string, l: Listener) => q.listeners.delete(l),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

function change(query: string, matches: boolean): void {
  const q = queries.get(query);
  if (!q) throw new Error(`no query ${query}`);
  q.matches = matches;
  for (const l of [...q.listeners]) l({ matches });
}

/** Animation frames, run by hand. */
let frames = new Map<number, FrameRequestCallback>();
let nextId = 1;
function runFrames(): void {
  const batch = [...frames.values()];
  frames = new Map();
  for (const cb of batch) cb(performance.now());
}

/** The mat of App.vue: its glow, and something else on the page (the board). */
function mountMat(): { wrapper: VueWrapper; glow: HTMLElement; board: HTMLElement } {
  const Harness = defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null);
      useGlow(el);
      return () => h('div', [h('div', { class: 'mat' }, [h('div', { ref: el, class: 'mat__glow' })]), h('div', { class: 'board' })]);
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  return { wrapper, glow: wrapper.get('.mat__glow').element as HTMLElement, board: wrapper.get('.board').element as HTMLElement };
}

const move = (target: EventTarget, x: number, y: number, pointerType = 'mouse'): void => {
  target.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerType }));
};
/** The pointer leaves the window: a pointerout towards nothing. */
const leave = (): void => {
  document.documentElement.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: null, pointerType: 'mouse' }));
};
const at = (glow: HTMLElement): [string, string] => [glow.style.getPropertyValue('--glow-x'), glow.style.getPropertyValue('--glow-y')];

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useGlow', () => {
  it('follows a mouse anywhere on the page, on the grid of the mat, once a frame', async () => {
    stubMedia({ fine: true, reduced: false });
    const { glow, board, wrapper } = mountMat();
    await nextTick();
    // Over the board too: the listener is on the document.
    move(board, 101, 250);
    move(board, 130, 262);
    expect(at(glow)).toEqual(['', '']);
    runFrames();
    // The last position of the frame, on the 12px grid of the dots: the dots of the glow fall on those of the mat.
    expect(GLOW_PITCH).toBe(12);
    expect(at(glow)).toEqual(['132px', '264px']);
    expect(glow.hasAttribute('data-on')).toBe(true);
    // Only the glow is written: neither the page nor the board.
    expect(document.documentElement.getAttribute('style')).toBeNull();
    expect(document.body.getAttribute('style')).toBeNull();
    expect(board.getAttribute('style')).toBeNull();
    wrapper.unmount();
  });

  it('fades out when the pointer leaves the window, and comes back with it', async () => {
    stubMedia({ fine: true, reduced: false });
    const { glow, wrapper } = mountMat();
    await nextTick();
    move(document, 300, 300);
    runFrames();
    expect(glow.hasAttribute('data-on')).toBe(true);
    leave();
    expect(glow.hasAttribute('data-on')).toBe(false);
    // A pointerout to another element of the page is no leaving.
    move(document, 320, 300);
    runFrames();
    glow.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body, pointerType: 'mouse' }));
    expect(glow.hasAttribute('data-on')).toBe(true);
    // The window losing the focus too: no lamp left on over a page the visitor left.
    window.dispatchEvent(new Event('blur'));
    expect(glow.hasAttribute('data-on')).toBe(false);
    wrapper.unmount();
  });

  it('never under a finger, nor without a mouse, nor under reduced motion', async () => {
    stubMedia({ fine: true, reduced: false });
    let mat = mountMat();
    await nextTick();
    move(document, 300, 300, 'touch');
    runFrames();
    expect(mat.glow.hasAttribute('data-on')).toBe(false);
    expect(mat.glow.getAttribute('style')).toBeNull();
    mat.wrapper.unmount();

    for (const device of [
      { fine: false, reduced: false },
      { fine: true, reduced: true },
    ]) {
      stubMedia(device);
      mat = mountMat();
      await nextTick();
      move(document, 300, 300);
      runFrames();
      expect(mat.glow.hasAttribute('data-on'), JSON.stringify(device)).toBe(false);
      expect(mat.glow.getAttribute('style'), JSON.stringify(device)).toBeNull();
      mat.wrapper.unmount();
    }
  });

  it('goes out at once when the device loses its mouse or asks for less motion', async () => {
    stubMedia({ fine: true, reduced: false });
    const { glow, wrapper } = mountMat();
    await nextTick();
    move(document, 300, 300);
    runFrames();
    expect(glow.hasAttribute('data-on')).toBe(true);
    change(REDUCED_QUERY, true);
    await nextTick();
    expect(glow.hasAttribute('data-on')).toBe(false);
    change(REDUCED_QUERY, false);
    await nextTick();
    move(document, 300, 300);
    runFrames();
    expect(glow.hasAttribute('data-on')).toBe(true);
    change(FINE_QUERY, false);
    expect(glow.hasAttribute('data-on')).toBe(false);
    wrapper.unmount();
  });

  it('leaves nothing behind once unmounted: no listener, no frame', async () => {
    stubMedia({ fine: true, reduced: false });
    const added: string[] = [];
    const removed: string[] = [];
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((type, l, o) => {
      added.push(type);
      add(type, l, o);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((type, l, o) => {
      removed.push(type);
      remove(type, l, o);
    });
    const { glow, wrapper } = mountMat();
    await nextTick();
    move(document, 300, 300);
    wrapper.unmount();
    expect(frames.size).toBe(0);
    expect(removed.sort()).toEqual(added.filter((t) => t.startsWith('pointer')).sort());
    move(document, 400, 400);
    runFrames();
    expect(glow.getAttribute('style')).toBeNull();
    vi.restoreAllMocks();
  });
});
