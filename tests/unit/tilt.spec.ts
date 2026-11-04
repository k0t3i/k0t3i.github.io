import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTilt } from '../../src/composables/useTilt';

/** A mouse or a pen, at every width (spec rev. 6): never a finger. */
const TILT_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

type Listener = (event: { matches: boolean }) => void;
/** The media queries of the test: whether each matches, and the listeners attached to it. */
let queries = new Map<string, { matches: boolean; listeners: Set<Listener> }>();

/** The device as the test sets it: a mouse or not, reduced motion or not. */
function stubMedia({ fine, reduced }: { fine: boolean; reduced: boolean }): void {
  queries = new Map([
    [TILT_QUERY, { matches: fine, listeners: new Set() }],
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

/** The device changes: a query starts or stops matching, its listeners hear it. */
function change(query: string, matches: boolean): void {
  const q = queries.get(query);
  if (!q) throw new Error(`no query ${query}`);
  q.matches = matches;
  for (const l of [...q.listeners]) l({ matches });
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

/** The window of a test: 1600 x 900 unless a test says otherwise. */
function windowSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

/** The board of a test: a 1600 x 900 box at the origin of the page, with its body and its edge. */
function mountBoard(): { wrapper: VueWrapper; board: HTMLElement; body: HTMLElement; edge: HTMLElement } {
  const Harness = defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null);
      useTilt(el);
      return () => h('div', { ref: el, class: 'board' }, [h('div', { class: 'board__body' }, [h('div', { class: 'board__face' })]), h('div', { class: 'board__edge' })]);
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  const board = wrapper.element as HTMLElement;
  board.getBoundingClientRect = () => new DOMRect(0, 0, 1600, 900);
  return { wrapper, board, body: board.querySelector('.board__body') as HTMLElement, edge: board.querySelector('.board__edge') as HTMLElement };
}

const move = (board: HTMLElement, x: number, y: number, pointerType = 'mouse'): void => {
  board.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerType }));
};
/** The angle the body reads (the edge reads the same one). */
const angle = (el: HTMLElement, axis: 'x' | 'y'): number => parseFloat(el.style.getPropertyValue(`--tilt-${axis}`) || '0');
const isFlat = (board: HTMLElement): boolean =>
  !board.hasAttribute('data-tilting') && [...board.children].every((c) => !c.hasAttribute('style')) && !board.hasAttribute('style');

beforeEach(() => {
  windowSize(1600, 900);
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
  it('leans with a mouse or a pen at every width: no width in the query', () => {
    expect(TILT_QUERY).not.toMatch(/width/);
  });

  it('no tilt without fine pointer / under reduced motion', () => {
    for (const device of [
      { fine: false, reduced: false },
      { fine: true, reduced: true },
    ]) {
      stubMedia(device);
      const { wrapper, board, body } = mountBoard();
      move(board, 1500, 100);
      runFrames(30);
      expect(frames.size, JSON.stringify(device)).toBe(0);
      expect(body.style.getPropertyValue('--tilt-x'), JSON.stringify(device)).toBe('');
      expect(isFlat(board)).toBe(true);
      wrapper.unmount();
    }
  });

  it('writes the angles on the body and the edge only, never on the board', () => {
    stubMedia({ fine: true, reduced: false });
    const { board, body, edge } = mountBoard();
    move(board, 1600, 900);
    runFrames(10);
    expect(angle(body, 'y')).toBeGreaterThan(0);
    expect(edge.style.getPropertyValue('--tilt-y')).toBe(body.style.getPropertyValue('--tilt-y'));
    expect(edge.style.getPropertyValue('--tilt-x')).toBe(body.style.getPropertyValue('--tilt-x'));
    // The board carries the state only; the faces inside the body, nothing.
    expect(board.hasAttribute('style')).toBe(false);
    expect(board.hasAttribute('data-tilting')).toBe(true);
    expect((board.querySelector('.board__face') as HTMLElement).hasAttribute('style')).toBe(false);
  });

  it('tilt clamps to ±5deg', () => {
    stubMedia({ fine: true, reduced: false });
    const { board, body } = mountBoard();
    // Far beyond a corner: each axis is held at its limit, never past it.
    move(board, 9000, -9000);
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      runFrames(1);
      peak = Math.max(peak, Math.abs(angle(body, 'x')), Math.abs(angle(body, 'y')));
    }
    expect(peak).toBeLessThanOrEqual(5);
    expect(Math.abs(angle(body, 'x'))).toBeCloseTo(5, 1);
    expect(Math.abs(angle(body, 'y'))).toBeCloseTo(5, 1);
    expect(board.hasAttribute('data-tilting')).toBe(true);
    // Damped: one frame covers only part of the way (factor 0.12).
    move(board, 800, 450);
    runFrames(1);
    expect(Math.abs(angle(body, 'y'))).toBeCloseTo(5 * 0.88, 1);
    // At the centre of the board, it is flat again.
    runFrames(200);
    expect(Math.abs(angle(body, 'x'))).toBeLessThan(0.02);
    expect(Math.abs(angle(body, 'y'))).toBeLessThan(0.02);
  });

  it('leans towards the pointer: right and bottom go away under it', () => {
    stubMedia({ fine: true, reduced: false });
    const { board, body } = mountBoard();
    move(board, 1600, 900);
    runFrames(200);
    // rotateY > 0 sends the right edge away from the viewer, rotateX < 0 the bottom edge.
    expect(angle(body, 'y')).toBeGreaterThan(4.9);
    expect(angle(body, 'x')).toBeLessThan(-4.9);
  });

  it('a finger never leans the board, on a device that also has a mouse', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    board.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
    move(board, 1600, 900, 'touch');
    runFrames(30);
    expect(frames.size).toBe(0);
    expect(isFlat(board)).toBe(true);
    // A pen leans it, as a mouse does.
    move(board, 1600, 900, 'pen');
    runFrames(30);
    expect(board.hasAttribute('data-tilting')).toBe(true);
  });

  it('a board taller than the window leans from the part of it in view, about the middle of that part', () => {
    stubMedia({ fine: true, reduced: false });
    windowSize(711, 900);
    const { board, body, edge } = mountBoard();
    // The flowing board, 4000px tall, scrolled 2000px down: the window shows 2000 to 2900 of it.
    board.getBoundingClientRect = () => new DOMRect(0, -2000, 711, 4000);
    // Near the top of the window, well below the middle of the board: its top edge goes away.
    move(board, 355, 90);
    runFrames(300);
    expect(angle(body, 'x')).toBeCloseTo(5 * 0.8, 1);
    expect(Math.abs(angle(body, 'y'))).toBeLessThan(0.05);
    // It turns about the middle of the part in view (2450px from its top), seen from there (depth.css):
    // the pivot is on the body and the edge, as the angles, never on the board.
    expect(body.style.getPropertyValue('--tilt-oy')).toBe('2450px');
    expect(edge.style.getPropertyValue('--tilt-oy')).toBe('2450px');
    expect(board.hasAttribute('style')).toBe(false);
    // Near the bottom of the window, the bottom edge goes away.
    move(board, 355, 810);
    runFrames(300);
    expect(angle(body, 'x')).toBeCloseTo(-5 * 0.8, 1);
    // Out of the board, flat again, the pivot gone with the angles.
    board.dispatchEvent(new PointerEvent('pointerleave'));
    runFrames(1000);
    expect(isFlat(board)).toBe(true);
  });

  it('after a scroll, it follows the pointer from the part now in view, without a move', () => {
    stubMedia({ fine: true, reduced: false });
    windowSize(711, 900);
    const { board, body } = mountBoard();
    board.getBoundingClientRect = () => new DOMRect(0, -2000, 711, 4000);
    move(board, 355, 90);
    runFrames(300);
    expect(frames.size).toBe(0);
    // Scrolled to the end of the board: it ends 500px down the window, the part in view is 0 to 500.
    board.getBoundingClientRect = () => new DOMRect(0, -3500, 711, 4000);
    window.dispatchEvent(new Event('scroll'));
    runFrames(300);
    expect(body.style.getPropertyValue('--tilt-oy')).toBe('3750px');
    // The pointer, still at 90px, is now 160px above the middle of that part: (90 - 250) / 250.
    expect(angle(body, 'x')).toBeCloseTo(5 * 0.64, 1);
    // On its way back to flat (the pointer gone to the scroll bar), its pivot still follows the scroll.
    board.dispatchEvent(new PointerEvent('pointerleave'));
    runFrames(2);
    board.getBoundingClientRect = () => new DOMRect(0, -1000, 711, 4000);
    window.dispatchEvent(new Event('scroll'));
    runFrames(1);
    expect(board.hasAttribute('data-tilting')).toBe(true);
    expect(body.style.getPropertyValue('--tilt-oy')).toBe('1450px');
  });

  it('eases by time, not by frame: the same course at 30 Hz as at 60 Hz', () => {
    stubMedia({ fine: true, reduced: false });
    const { board, body } = mountBoard();
    move(board, 1600, 450);
    runFrames(30);
    const at60 = angle(body, 'y');
    board.dispatchEvent(new PointerEvent('pointerleave'));
    runFrames(1000);
    move(board, 1600, 450);
    runFrames(15, 2000 / 60);
    expect(angle(body, 'y')).toBeCloseTo(at60, 1);
  });

  it('ignores a target a hair away from the current one', () => {
    stubMedia({ fine: true, reduced: false });
    const { board, body } = mountBoard();
    move(board, 1200, 450);
    runFrames(500);
    expect(frames.size).toBe(0);
    const still = angle(body, 'y');
    // 10px further right: well under 0.1 degree, the board does not move.
    move(board, 1210, 450);
    expect(frames.size).toBe(0);
    expect(angle(body, 'y')).toBe(still);
    // 60px further: it follows.
    move(board, 1270, 450);
    expect(frames.size).toBe(1);
  });

  it('measures the board when the pointer enters it and after a resize or a scroll, not on each move', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    const measure = vi.fn(() => new DOMRect(0, 0, 1600, 900));
    board.getBoundingClientRect = measure;
    board.dispatchEvent(new PointerEvent('pointerenter'));
    for (let x = 900; x < 1600; x += 50) move(board, x, 300);
    expect(measure).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('scroll'));
    move(board, 1000, 300);
    move(board, 1100, 300);
    expect(measure).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('resize'));
    move(board, 1200, 300);
    expect(measure).toHaveBeenCalledTimes(3);
  });

  it('is flat at once when a sheet opens, and stays flat until it closes', () => {
    stubMedia({ fine: true, reduced: false });
    const { board, body } = mountBoard();
    const sheet = document.createElement('div');
    body.append(sheet);
    const toggle = (newState: string) => {
      const event = new Event('toggle');
      Object.defineProperty(event, 'newState', { value: newState });
      sheet.dispatchEvent(event);
    };
    move(board, 1600, 0);
    runFrames(40);
    expect(board.hasAttribute('data-tilting')).toBe(true);
    toggle('open');
    expect(frames.size).toBe(0);
    expect(isFlat(board)).toBe(true);
    // Moves under the open sheet do not lean the board.
    move(board, 0, 900);
    runFrames(40);
    expect(isFlat(board)).toBe(true);
    toggle('closed');
    move(board, 0, 900);
    runFrames(40);
    expect(board.hasAttribute('data-tilting')).toBe(true);
  });

  it('goes flat at once when the device loses its mouse, or asks for less motion', async () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    // The reduced-motion setting read at mount reaches the watcher first.
    await nextTick();
    move(board, 1600, 900);
    runFrames(20);
    expect(board.hasAttribute('data-tilting')).toBe(true);
    change(TILT_QUERY, false);
    expect(frames.size).toBe(0);
    expect(isFlat(board)).toBe(true);
    move(board, 1600, 900);
    expect(frames.size).toBe(0);

    // A mouse again: it follows again, until reduced motion is asked for.
    change(TILT_QUERY, true);
    move(board, 0, 0);
    runFrames(20);
    expect(board.hasAttribute('data-tilting')).toBe(true);
    change(REDUCED_QUERY, true);
    await nextTick();
    expect(frames.size).toBe(0);
    expect(isFlat(board)).toBe(true);
    move(board, 1600, 900);
    expect(frames.size).toBe(0);
  });

  it('returns to 0 on leave and stops the rAF loop', () => {
    stubMedia({ fine: true, reduced: false });
    const { board, body } = mountBoard();
    move(board, 1600, 0);
    runFrames(40);
    expect(Math.abs(angle(body, 'y'))).toBeGreaterThan(3);
    board.dispatchEvent(new PointerEvent('pointerleave'));
    runFrames(1000);
    // The loop stopped by itself, and the board is back at rest: no 3D, no inline property left.
    expect(frames.size).toBe(0);
    expect(isFlat(board)).toBe(true);
  });

  it('measures the board once after a turn, not on each move during it', () => {
    stubMedia({ fine: true, reduced: false });
    const { board } = mountBoard();
    const measure = vi.fn(() => new DOMRect(0, 0, 1600, 900));
    board.getBoundingClientRect = measure;
    board.dispatchEvent(new PointerEvent('pointerenter'));
    move(board, 1500, 450);
    runFrames(5);
    expect(measure).toHaveBeenCalledTimes(1);
    board.dataset.turning = 'run';
    for (let i = 0; i < 6; i++) {
      move(board, 1500 - i * 100, 450);
      runFrames(3);
    }
    expect(measure).toHaveBeenCalledTimes(1);
    delete board.dataset.turning;
    runFrames(1);
    expect(measure).toHaveBeenCalledTimes(2);
    move(board, 900, 450);
    runFrames(3);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('a finger lifting off a hybrid device does not flatten the board under the mouse', () => {
    stubMedia({ fine: true, reduced: false });
    const { board, body } = mountBoard();
    move(board, 1600, 450);
    runFrames(200);
    const leaning = angle(body, 'y');
    expect(leaning).toBeGreaterThan(4);
    board.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch' }));
    runFrames(200);
    expect(angle(body, 'y')).toBe(leaning);
    board.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    runFrames(1000);
    expect(isFlat(board)).toBe(true);
  });

  it('holds still while the board turns over', () => {
    stubMedia({ fine: true, reduced: false });
    const { board, body } = mountBoard();
    move(board, 1600, 450);
    runFrames(5);
    const held = angle(body, 'y');
    board.dataset.turning = 'run';
    move(board, 0, 450);
    runFrames(20);
    expect(angle(body, 'y')).toBe(held);
    delete board.dataset.turning;
    runFrames(20);
    expect(angle(body, 'y')).toBeLessThan(held);
  });

  it('cleanup on unmount', () => {
    stubMedia({ fine: true, reduced: false });
    const removeOn = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    try {
      const { wrapper, board } = mountBoard();
      move(board, 1600, 900);
      runFrames(3);
      expect(frames.size).toBe(1);
      expect([...(queries.get(TILT_QUERY)?.listeners ?? [])]).toHaveLength(1);
      wrapper.unmount();
      // The pending frame is cancelled, every listener is gone, nothing of the tilt is left.
      expect(frames.size).toBe(0);
      const own = removeOn.mock.calls.filter((_, i) => removeOn.mock.contexts[i] === board).map(([type, , options]) => `${type}${options ? ` ${JSON.stringify(options)}` : ''}`);
      expect(own).toEqual(expect.arrayContaining(['pointerenter', 'pointermove', 'pointerleave', 'toggle {"capture":true}']));
      expect(removeWindow.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(['resize', 'scroll']));
      expect(queries.get(TILT_QUERY)?.listeners.size).toBe(0);
      expect(queries.get(REDUCED_QUERY)?.listeners.size).toBe(0);
      expect(isFlat(board)).toBe(true);
      move(board, 0, 0);
      expect(frames.size).toBe(0);
    } finally {
      removeOn.mockRestore();
      removeWindow.mockRestore();
    }
  });
});
