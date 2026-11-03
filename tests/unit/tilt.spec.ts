import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTilt } from '../../src/composables/useTilt';

const TILT_QUERY = '(min-width: 79rem) and (hover: hover) and (pointer: fine)';

/** The device as the test sets it: a wide window with a mouse or not, reduced motion or not. */
function stubMedia({ fine, reduced }: { fine: boolean; reduced: boolean }): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === TILT_QUERY ? fine : query === '(prefers-reduced-motion: reduce)' ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** Animation frames run by hand, one batch per frame. */
let frames = new Map<number, FrameRequestCallback>();
let nextId = 1;
let clock = 0;
/** Runs frames 1/60 s apart, or ms apart. */
function runFrames(count: number, ms = 1000 / 60): void {
  for (let i = 0; i < count && frames.size > 0; i++) {
    const batch = [...frames.values()];
    frames = new Map();
    clock += ms;
    for (const cb of batch) cb(clock);
  }
}

/** The board of a test: a div whose box is 1600 x 900 at the origin of the page. */
function mountBoard(): { wrapper: VueWrapper; board: HTMLElement } {
  const Harness = defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null);
      useTilt(el);
      return () => h('div', { ref: el, class: 'board' });
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  const board = wrapper.element as HTMLElement;
  board.getBoundingClientRect = () => new DOMRect(0, 0, 1600, 900);
  return { wrapper, board };
}

const move = (board: HTMLElement, x: number, y: number): void => {
  board.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
};
const angle = (board: HTMLElement, axis: 'x' | 'y'): number => parseFloat(board.style.getPropertyValue(`--tilt-${axis}`) || '0');

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  clock = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useTilt', () => {
  it('no tilt without fine pointer / under reduced motion', () => {
    for (const device of [
      { fine: false, reduced: false },
      { fine: true, reduced: true },
    ]) {
      stubMedia(device);
      const { wrapper, board } = mountBoard();
      move(board, 1500, 100);
      runFrames(30);
      expect(frames.size, JSON.stringify(device)).toBe(0);
      expect(board.style.getPropertyValue('--tilt-x'), JSON.stringify(device)).toBe('');
      expect(board.style.getPropertyValue('--tilt-y'), JSON.stringify(device)).toBe('');
      expect(board.hasAttribute('data-tilting')).toBe(false);
      wrapper.unmount();
    }
  });

  it('tilt clamps to ±4deg', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    // Far beyond a corner: each axis is held at its limit, never past it.
    move(board, 9000, -9000);
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      runFrames(1);
      peak = Math.max(peak, Math.abs(angle(board, 'x')), Math.abs(angle(board, 'y')));
    }
    expect(peak).toBeLessThanOrEqual(4);
    expect(Math.abs(angle(board, 'x'))).toBeCloseTo(4, 1);
    expect(Math.abs(angle(board, 'y'))).toBeCloseTo(4, 1);
    expect(board.hasAttribute('data-tilting')).toBe(true);
    // Damped: one frame covers only part of the way (factor 0.12).
    move(board, 800, 450);
    runFrames(1);
    expect(Math.abs(angle(board, 'y'))).toBeCloseTo(4 * 0.88, 1);
    // At the centre of the board, it is flat again.
    runFrames(200);
    expect(Math.abs(angle(board, 'x'))).toBeLessThan(0.02);
    expect(Math.abs(angle(board, 'y'))).toBeLessThan(0.02);
  });

  it('leans towards the pointer: right and bottom go away under it', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    move(board, 1600, 900);
    runFrames(200);
    // rotateY > 0 sends the right edge away from the viewer, rotateX < 0 the bottom edge.
    expect(angle(board, 'y')).toBeGreaterThan(3.9);
    expect(angle(board, 'x')).toBeLessThan(-3.9);
  });

  it('eases by time, not by frame: the same course at 30 Hz as at 60 Hz', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    move(board, 1600, 450);
    runFrames(30);
    const at60 = angle(board, 'y');
    board.dispatchEvent(new PointerEvent('pointerleave'));
    runFrames(1000);
    move(board, 1600, 450);
    runFrames(15, 2000 / 60);
    expect(angle(board, 'y')).toBeCloseTo(at60, 1);
  });

  it('ignores a target a hair away from the current one', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    move(board, 1200, 450);
    runFrames(500);
    expect(frames.size).toBe(0);
    const still = angle(board, 'y');
    // 10px further right: well under 0.1 degree, the board does not move.
    move(board, 1210, 450);
    expect(frames.size).toBe(0);
    expect(angle(board, 'y')).toBe(still);
    // 60px further: it follows.
    move(board, 1270, 450);
    expect(frames.size).toBe(1);
  });

  it('is flat at once when a sheet opens', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    const sheet = document.createElement('div');
    board.append(sheet);
    move(board, 1600, 0);
    runFrames(40);
    expect(board.hasAttribute('data-tilting')).toBe(true);
    const open = new Event('toggle');
    Object.defineProperty(open, 'newState', { value: 'open' });
    sheet.dispatchEvent(open);
    expect(frames.size).toBe(0);
    expect(board.hasAttribute('data-tilting')).toBe(false);
    expect(board.hasAttribute('style')).toBe(false);
  });

  it('returns to 0 on leave and stops the rAF loop', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    move(board, 1600, 0);
    runFrames(40);
    expect(Math.abs(angle(board, 'y'))).toBeGreaterThan(3);
    board.dispatchEvent(new PointerEvent('pointerleave'));
    runFrames(1000);
    // The loop stopped by itself, and the board is back at rest: no 3D, no inline property left.
    expect(frames.size).toBe(0);
    expect(board.style.getPropertyValue('--tilt-x')).toBe('');
    expect(board.style.getPropertyValue('--tilt-y')).toBe('');
    expect(board.hasAttribute('data-tilting')).toBe(false);
    expect(board.hasAttribute('style')).toBe(false);
  });

  it('holds still while the board turns over', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    move(board, 1600, 450);
    runFrames(5);
    const held = angle(board, 'y');
    board.dataset.turning = 'run';
    move(board, 0, 450);
    runFrames(20);
    expect(angle(board, 'y')).toBe(held);
    delete board.dataset.turning;
    runFrames(20);
    expect(angle(board, 'y')).toBeLessThan(held);
  });

  it('cleanup on unmount', () => {
    stubMedia({ fine: true, reduced: false });
    const remove = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
    try {
      const { wrapper, board } = mountBoard();
      move(board, 1600, 900);
      runFrames(3);
      expect(frames.size).toBe(1);
      wrapper.unmount();
      // The pending frame is cancelled, the listeners are gone, the properties are removed.
      expect(frames.size).toBe(0);
      const own = remove.mock.calls.filter((_, i) => remove.mock.contexts[i] === board).map(([type]) => type);
      expect(own).toEqual(expect.arrayContaining(['pointerleave', 'pointermove']));
      expect(board.style.getPropertyValue('--tilt-x')).toBe('');
      expect(board.hasAttribute('data-tilting')).toBe(false);
      move(board, 0, 0);
      expect(frames.size).toBe(0);
    } finally {
      remove.mockRestore();
    }
  });
});
