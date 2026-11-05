import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKonami, type Konami } from '../../src/composables/useKonami';
import { CODE } from '../../src/lib/konami';

/** Whether a sheet is open (lib/sheet.ts): set by a test. */
let sheetIsOpen = false;
vi.mock('../../src/lib/sheet', () => ({ sheetOpen: () => sheetIsOpen }));

const TYPED = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
/** The code by touch: eight swipes, then two taps. */
const SWIPES: [number, number][] = [
  [0, -60],
  [0, -60],
  [0, 60],
  [0, 60],
  [-60, 0],
  [60, 0],
  [-60, 0],
  [60, 0],
  [0, 0],
  [1, 2],
];

let found = 0;
/** A touch on DISP1 is a step of the code (useDisplay: not while the game runs, its swipes steer it). */
let touchOn = true;
/** Every DISP1 mounted by a test: unmounted after it, even when it fails. */
const mounted: VueWrapper[] = [];

/** DISP1 with the listeners of the code, and a part of the page beside it. */
function mountDisp(): { wrapper: VueWrapper; screen: HTMLElement; other: HTMLElement; konami: Konami } {
  let konami: Konami | undefined;
  const Harness = defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null);
      konami = useKonami(() => found++, { area: (target) => touchOn && !!el.value?.contains(target) });
      return () => h('div', [h('div', { ref: el, class: 'disp__screen' }), h('p', { class: 'other' })]);
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  mounted.push(wrapper);
  if (!konami) throw new Error('not set up');
  return { wrapper, screen: wrapper.get('.disp__screen').element as HTMLElement, other: wrapper.get('.other').element as HTMLElement, konami };
}

const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(e);
  return e;
};

/** A touch from (100, 100), moved by (dx, dy), lifted. */
function swipe(target: HTMLElement, dx: number, dy: number, fingers = 1): void {
  const at = (x: number, y: number, id = 1) => ({ identifier: id, target, clientX: x, clientY: y }) as unknown as Touch;
  const down = Array.from({ length: fingers }, (_, i) => at(100 + i * 40, 100, i + 1));
  target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: down, changedTouches: down }));
  const up = [at(100 + dx, 100 + dy)];
  target.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: up, changedTouches: up }));
  target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: up }));
}

afterEach(() => {
  for (const w of mounted.splice(0)) if (w.vm) w.unmount();
  found = 0;
  touchOn = true;
  sheetIsOpen = false;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useKonami', () => {
  it('finds the code typed on the keyboard, and never takes a key from the page', async () => {
    const { wrapper } = mountDisp();
    await nextTick();
    const events = TYPED.map((k) => press(k));
    expect(found).toBe(1);
    expect(events.some((e) => e.defaultPrevented)).toBe(false);
    // Again: found again (the game mode then ends, useDisplay).
    TYPED.forEach((k) => press(k));
    expect(found).toBe(2);
    wrapper.unmount();
  });

  it('B and A in capitals, Shift between them; held keys and shortcuts are no step of it', async () => {
    const { wrapper } = mountDisp();
    await nextTick();
    for (const k of TYPED.slice(0, 8)) {
      press(k);
      // A held key repeats: one step only.
      press(k, { repeat: true });
      // A shortcut on the way is ignored: no step, no reset.
      press('c', { ctrlKey: true });
      press('Tab', { altKey: true });
      press('r', { metaKey: true });
    }
    press('Shift');
    press('B', { shiftKey: true });
    press('Shift');
    press('A', { shiftKey: true });
    expect(found).toBe(1);
    // A wrong key on the way: from the start again.
    TYPED.slice(0, 5).forEach((k) => press(k));
    press('Enter');
    TYPED.slice(5).forEach((k) => press(k));
    expect(found).toBe(1);
    wrapper.unmount();
  });

  it('finds the code swiped and tapped on DISP1, its listeners passive: the page still scrolls', async () => {
    const added: { el: EventTarget; type: string; passive?: boolean }[] = [];
    const add = document.addEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((type: string, l: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
      if (type.startsWith('touch')) added.push({ el: document, type, passive: typeof o === 'object' ? o.passive : undefined });
      add(type, l, o);
    });
    const { wrapper, screen, other } = mountDisp();
    await nextTick();
    // On the document, passive; a touch counts only where the area says (DISP1 here).
    const mine = added.filter((a) => a.el === document);
    expect(mine.map((a) => [a.type, a.passive])).toEqual([
      ['touchstart', true],
      ['touchend', true],
      ['touchcancel', true],
    ]);
    for (const [dx, dy] of SWIPES) swipe(screen, dx, dy);
    expect(found).toBe(1);
    // Elsewhere on the page: nothing.
    for (const [dx, dy] of SWIPES) swipe(other, dx, dy);
    expect(found).toBe(1);
    // Two fingers (a pinch, a zoom) are no swipe.
    for (const [dx, dy] of SWIPES) swipe(screen, dx, dy, 2);
    expect(found).toBe(1);
    // A swipe too short to read (between a tap and a swipe) changes nothing.
    for (const [dx, dy] of SWIPES.slice(0, 4)) swipe(screen, dx, dy);
    swipe(screen, 15, 0);
    for (const [dx, dy] of SWIPES.slice(4)) swipe(screen, dx, dy);
    expect(found).toBe(2);
    wrapper.unmount();
  });

  it('leaves the touches to the game while it runs, and the keys still find it', async () => {
    const { wrapper, screen } = mountDisp();
    await nextTick();
    touchOn = false;
    for (const [dx, dy] of SWIPES) swipe(screen, dx, dy);
    expect(found).toBe(0);
    // The keyboard still finds it: typed again, the code ends the game.
    TYPED.forEach((k) => press(k));
    expect(found).toBe(1);
    wrapper.unmount();
  });

  it('finds the code pressed on the test keypad, the same detector as the keys and the swipes', async () => {
    const { wrapper, screen, konami } = mountDisp();
    await nextTick();
    for (const k of CODE) konami.press(k);
    expect(found).toBe(1);
    // One detector: the steps go on from one way to the other (keys, then the keypad, then a tap).
    TYPED.slice(0, 4).forEach((k) => press(k));
    for (const k of CODE.slice(4, 9)) konami.press(k);
    swipe(screen, 0, 0);
    expect(found).toBe(2);
    // A wrong step on the keypad: from the start again.
    for (const k of CODE.slice(0, 6)) konami.press(k);
    konami.press('a');
    for (const k of CODE.slice(6)) konami.press(k);
    expect(found).toBe(2);
    wrapper.unmount();
  });

  // The review of Task 18: with a sheet open, and the focus in it, the code started the game under the sheet.
  it('takes no step of the code while a sheet is open: keys, swipes and the keypad', async () => {
    const { wrapper, screen, konami } = mountDisp();
    await nextTick();
    sheetIsOpen = true;
    TYPED.forEach((k) => press(k));
    for (const [dx, dy] of SWIPES) swipe(screen, dx, dy);
    for (const k of CODE) konami.press(k);
    expect(found).toBe(0);
    sheetIsOpen = false;
    TYPED.forEach((k) => press(k));
    expect(found).toBe(1);
    wrapper.unmount();
  });

  it('leaves no listener behind once unmounted', async () => {
    const { wrapper, screen } = mountDisp();
    await nextTick();
    wrapper.unmount();
    TYPED.forEach((k) => press(k));
    for (const [dx, dy] of SWIPES) swipe(screen, dx, dy);
    expect(found).toBe(0);
  });
});
