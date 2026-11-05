import { mount, type VueWrapper } from '@vue/test-utils';
import { createSSRApp, h, nextTick } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TestKeypad from '../../src/components/TestKeypad.vue';
import { KEYPAD, KEYPAD_FLOW, KEYPAD_SLOT, KEY_HIT } from '../../src/circuit/keypad';
import { en } from '../../src/content/en';
import { keypadPlaces } from '../../src/lib/keypadPlaces';
import { fr } from '../../src/content/fr';
import { EN as ORACLE_EN, FR as ORACLE_FR } from '../helpers/copy';

/*
 * The test keypad of revision 10 (TestKeypad.vue): its names, its one tab stop and its arrows, its
 * presses (one a press, whatever the pointer), an open sheet, and the page without JavaScript.
 */

/** A sheet is open (lib/sheet.ts reads :popover-open, which happy-dom does not know). */
let sheetIsOpen = false;
vi.mock('../../src/lib/sheet', () => ({ sheetOpen: () => sheetIsOpen }));

const mounted: VueWrapper[] = [];
function mountPad(game = false, display = fr.display): VueWrapper {
  const wrapper = mount(TestKeypad, { props: { keypad: display.keypad, game }, attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
}
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  sheetIsOpen = false;
  document.body.innerHTML = '';
});

const keys = (w: VueWrapper): HTMLButtonElement[] => w.findAll('button').map((b) => b.element as HTMLButtonElement);
const down = (el: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(e);
  return e;
};
const presses = (w: VueWrapper): string[] => (w.emitted('press') ?? []).map(([k]) => k as string);

describe('the test keypad', () => {
  it('is prerendered as a drawing: its group hidden, the six switches drawn, no style attribute', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(TestKeypad, { keypad: fr.display.keypad, game: false }) }));
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const group = doc.querySelector('.keypad__keys');
    expect(group?.hasAttribute('hidden')).toBe(true);
    expect(doc.querySelectorAll('.keypad__key')).toHaveLength(6);
    expect(doc.querySelector('svg.keypad__art')?.getAttribute('aria-hidden')).toBe('true');
    expect(doc.querySelector('svg.keypad__art')?.getAttribute('viewBox')).toBe(`0 0 ${KEYPAD_FLOW.w} ${KEYPAD_FLOW.h}`);
    expect(doc.querySelectorAll('svg.keypad__art use')).toHaveLength(6);
    expect(html).not.toMatch(/\sstyle=/);
  });

  it('shows a named group of six named buttons once mounted, placed from the module', async () => {
    for (const [display, oracle] of [
      [fr.display, ORACLE_FR],
      [en.display, ORACLE_EN],
    ] as const) {
      const w = mountPad(false, display);
      await nextTick();
      const group = w.get('.keypad__keys');
      expect(group.attributes('hidden')).toBeUndefined();
      expect(group.attributes('role')).toBe('group');
      expect(group.attributes('aria-label')).toBe(oracle.keypad.group);
      expect(keys(w).map((b) => b.textContent?.trim())).toEqual(oracle.keypad.keys);
      expect(keys(w).map((b) => b.type)).toEqual(Array(6).fill('button'));
      expect(keys(w).map((b) => b.dataset.key)).toEqual(KEYPAD.map((k) => k.key));
      w.unmount();
      mounted.splice(0);
    }
  });

  it('places its keys from the module, in a stylesheet adopted once by the document (no style attribute)', async () => {
    const before = document.adoptedStyleSheets.length;
    mountPad();
    mountPad(false, en.display);
    await nextTick();
    const added = document.adoptedStyleSheets.length - before;
    expect(added).toBeLessThanOrEqual(1);
    expect(document.querySelectorAll('[style]')).toHaveLength(0);
    // What it holds: the slot and each key, in front units and in shares of the block of the flowing board.
    const css = keypadPlaces();
    const vars = (selector: string): Record<string, string> => {
      const at = css.indexOf(`${selector}{`);
      const block = at < 0 ? '' : css.slice(at + selector.length + 1, css.indexOf('}', at));
      return Object.fromEntries([...block.matchAll(/--([\w-]+):([^;]+)/g)].map(([, k, v]) => [k, v as string]));
    };
    expect(css.startsWith('@layer board{')).toBe(true);
    expect(vars('.keypad__keys')).toMatchObject({ kx: String(KEYPAD_SLOT.x), ky: String(KEYPAD_SLOT.y), kw: String(KEYPAD_SLOT.w), kh: String(KEYPAD_SLOT.h), hit: String(KEY_HIT) });
    for (const k of KEYPAD) {
      const v = vars(`.keypad__key[data-key="${k.key}"]`);
      expect(Number(v.x), k.ref).toBe(k.x - KEY_HIT / 2 - KEYPAD_SLOT.x);
      expect(Number(v.y), k.ref).toBe(k.y - KEY_HIT / 2 - KEYPAD_SLOT.y);
      const [cx, cy] = KEYPAD_FLOW.centres[k.key];
      expect(parseFloat(v.fx ?? '')).toBeCloseTo(((cx - 0.5) / KEYPAD_FLOW.w) * 100, 2);
      expect(parseFloat(v.fy ?? '')).toBeCloseTo(((cy - 0.5) / KEYPAD_FLOW.h) * 100, 2);
    }
  });

  it('is one tab stop; the arrows go round its keys in the order of the references, Home and End to its ends', async () => {
    const w = mountPad();
    await nextTick();
    const b = keys(w);
    const stop = (): string[] => b.filter((x) => x.tabIndex === 0).map((x) => x.dataset.key ?? '');
    expect(stop()).toEqual(['up']);
    expect(b.filter((x) => x.tabIndex === -1)).toHaveLength(5);
    b[0]?.focus();
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    const seq: [string, string][] = [
      ['ArrowRight', 'down'],
      ['ArrowDown', 'left'],
      ['ArrowUp', 'down'],
      ['ArrowLeft', 'up'],
      ['ArrowLeft', 'a'],
      ['ArrowRight', 'up'],
      ['End', 'a'],
      ['Home', 'up'],
    ];
    for (const [key, to] of seq) {
      const e = down(document.activeElement as Element, key);
      expect(e.defaultPrevented, key).toBe(true);
      expect((document.activeElement as HTMLElement).dataset.key, key).toBe(to);
      await nextTick();
      expect(stop()).toEqual([to]);
    }
    // The keys it takes go no further: the code detector of the page does not see them.
    expect(outside).not.toHaveBeenCalled();
    // Enter and Space are the button's (its click): not prevented, not seen by the page either.
    expect(down(b[0] as Element, 'Enter').defaultPrevented).toBe(false);
    expect(down(b[0] as Element, ' ').defaultPrevented).toBe(false);
    expect(outside).not.toHaveBeenCalled();
    // Other keys, shortcuts, Escape and Tab are the page's.
    for (const [key, init] of [['Escape', {}], ['Tab', {}], ['b', {}], ['ArrowRight', { altKey: true }]] as [string, KeyboardEventInit][])
      expect(down(b[0] as Element, key, init).defaultPrevented).toBe(false);
    expect(outside).toHaveBeenCalledTimes(4);
    document.removeEventListener('keydown', outside);
  });

  it('a key focused another way (a pointer, a screen reader) becomes the tab stop and the start of the arrows', async () => {
    const w = mountPad();
    await nextTick();
    const b = keys(w);
    b[3]?.focus();
    await nextTick();
    expect(b.filter((x) => x.tabIndex === 0).map((x) => x.dataset.key)).toEqual(['right']);
    down(b[3] as Element, 'ArrowRight');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('b');
  });

  it('in the game mode, leaves the arrows to the game (they steer it): Home and End still move', async () => {
    const w = mountPad(true);
    await nextTick();
    const b = keys(w);
    b[2]?.focus();
    b[2]?.click();
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) expect(down(b[2] as Element, key).defaultPrevented).toBe(false);
    expect((document.activeElement as HTMLElement).dataset.key).toBe('left');
    expect(outside).toHaveBeenCalledTimes(4);
    down(b[2] as Element, 'End');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('a');
    document.removeEventListener('keydown', outside);
  });

  it('presses its key once per click, a tap or a mouse click alike: never a touch and a click', async () => {
    const w = mountPad();
    await nextTick();
    const [up, , , , bKey, aKey] = keys(w) as HTMLButtonElement[];
    // A finger: touch and pointer events, then the click: one press.
    const t = { identifier: 1, target: up, clientX: 1, clientY: 1 } as unknown as Touch;
    up?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true }));
    up?.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t], changedTouches: [t] }));
    up?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true }));
    up?.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t] }));
    expect(presses(w)).toEqual([]);
    up?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(presses(w)).toEqual(['up']);
    // A mouse, then the keyboard (a click with no pointer before it).
    bKey?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    bKey?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    aKey?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(presses(w)).toEqual(['up', 'b', 'a']);
    // The key pressed becomes the tab stop.
    await nextTick();
    expect(keys(w).filter((x) => x.tabIndex === 0).map((x) => x.dataset.key)).toEqual(['a']);
  });

  it('presses nothing while a sheet is open, nor with the click of a tap that began over one (and closed it)', async () => {
    const w = mountPad();
    await nextTick();
    const [up] = keys(w) as HTMLButtonElement[];
    sheetIsOpen = true;
    up?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    up?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    // The lift of the finger closes the sheet (a light dismiss), then comes the click.
    sheetIsOpen = false;
    up?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(presses(w)).toEqual([]);
    // The next press is a press.
    up?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    up?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    // A pointer that went down over a sheet and was cancelled (a scroll) leaves no trace on the next keyboard press.
    sheetIsOpen = true;
    up?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    sheetIsOpen = false;
    up?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'touch' }));
    up?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(presses(w)).toEqual(['up', 'up']);
  });
});
