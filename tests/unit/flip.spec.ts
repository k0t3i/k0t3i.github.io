import { mount, type VueWrapper } from '@vue/test-utils';
import { createSSRApp, defineComponent, h, provide, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlipSwitch from '../../src/components/FlipSwitch.vue';
import { FLIP, useFlip, type Flip } from '../../src/composables/useFlip';
import { fr } from '../../src/content/fr';

/** Reduced motion or not, as the test sets it. */
function stubMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** The board of the home page, reduced to what useFlip works on: two faces, one SW2 on each. */
function harness(early?: (flip: Flip) => void) {
  let flip: Flip | undefined;
  const Harness = defineComponent({
    setup() {
      const board = ref<HTMLElement | null>(null);
      flip = useFlip(board);
      provide(FLIP, flip);
      // A call made before the board is mounted (no flip before ready).
      early?.(flip);
      return () =>
        h('div', { ref: board, class: 'board' }, [
          h('div', { class: 'board__body' }, [
            h('div', { class: 'board__face board__face--front' }, [h(FlipSwitch, { back: fr.back })]),
            h('section', { class: 'board__face board__face--back' }, [h(FlipSwitch, { back: fr.back })]),
          ]),
        ]);
    },
  });
  return { Harness, flip: () => flip as Flip };
}

function mountBoard(early?: (flip: Flip) => void): { wrapper: VueWrapper; board: HTMLElement; flip: Flip } {
  const { Harness, flip } = harness(early);
  const wrapper = mount(Harness, { attachTo: document.body });
  return { wrapper, board: wrapper.element as HTMLElement, flip: flip() };
}

const face = (board: HTMLElement, side: 'front' | 'back') => board.querySelector(`.board__face--${side}`) as HTMLElement;
const sw2 = (board: HTMLElement, side: 'front' | 'back') => board.querySelector(`.board__face--${side} button.sw2`) as HTMLButtonElement;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useFlip', () => {
  beforeEach(() => stubMotion(true));

  it('no flip before ready', async () => {
    // The prerender: both faces readable one after the other, SW2 hidden, nothing flipped.
    const { Harness } = harness();
    const ssr = await renderToString(createSSRApp(Harness));
    expect(ssr).not.toMatch(/data-flip|inert/);
    expect(ssr.match(/<button class="sw2" type="button" aria-pressed="false" hidden/g)).toHaveLength(2);

    // A toggle before the app has mounted does nothing.
    const { board, flip } = mountBoard((f) => f.toggle());
    expect(flip.flipped.value).toBe(false);
    expect(board.hasAttribute('data-flipped')).toBe(false);
    // Once mounted, the faces stack and the hidden one is inert.
    expect(flip.ready.value).toBe(true);
    expect(board.hasAttribute('data-flip-ready')).toBe(true);
    expect(face(board, 'front').hasAttribute('inert')).toBe(false);
    expect(face(board, 'back').hasAttribute('inert')).toBe(true);
  });

  it('toggle flips and sets inert on the hidden face', async () => {
    const { wrapper, board, flip } = mountBoard();
    await wrapper.vm.$nextTick();
    expect(sw2(board, 'front').hasAttribute('hidden')).toBe(false);
    sw2(board, 'front').click();
    await wrapper.vm.$nextTick();
    expect(flip.flipped.value).toBe(true);
    expect(board.hasAttribute('data-flipped')).toBe(true);
    expect(face(board, 'front').hasAttribute('inert')).toBe(true);
    expect(face(board, 'back').hasAttribute('inert')).toBe(false);
    // Both switches show the state: pressed while the back side is up.
    expect([sw2(board, 'front'), sw2(board, 'back')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true']);

    flip.toggle();
    await wrapper.vm.$nextTick();
    expect(board.hasAttribute('data-flipped')).toBe(false);
    expect(face(board, 'front').hasAttribute('inert')).toBe(false);
    expect(face(board, 'back').hasAttribute('inert')).toBe(true);
    expect(sw2(board, 'front').getAttribute('aria-pressed')).toBe('false');
  });

  it('focus moves to the visible SW2', async () => {
    // Reduced motion: no turn, the focus moves at once.
    const { wrapper, board, flip } = mountBoard();
    await wrapper.vm.$nextTick();
    sw2(board, 'front').focus();
    flip.toggle();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(sw2(board, 'back'));
    expect(board.hasAttribute('data-turning')).toBe(false);
    flip.toggle();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(sw2(board, 'front'));
  });

  it('with motion, the board turns first, then the focus follows', async () => {
    stubMotion(false);
    vi.useFakeTimers();
    const { wrapper, board, flip } = mountBoard();
    await wrapper.vm.$nextTick();
    sw2(board, 'front').focus();
    flip.toggle();
    await wrapper.vm.$nextTick();
    // During the turn: the transition runs, the focus waits.
    expect(board.dataset.turning).toBe('run');
    expect(board.hasAttribute('data-flipped')).toBe(true);
    expect(document.activeElement).not.toBe(sw2(board, 'back'));
    // The end of the turn of the body: the board is at rest again, the focus on the back SW2.
    const body = board.querySelector('.board__body') as HTMLElement;
    const end = new Event('transitionend', { bubbles: true });
    Object.defineProperty(end, 'propertyName', { value: 'transform' });
    body.dispatchEvent(end);
    expect(board.hasAttribute('data-turning')).toBe(false);
    expect(document.activeElement).toBe(sw2(board, 'back'));

    // Without a transitionend (a skipped transition), a timer ends the turn.
    flip.toggle();
    expect(board.dataset.turning).toBe('run');
    vi.advanceTimersByTime(800);
    expect(board.hasAttribute('data-turning')).toBe(false);
    expect(document.activeElement).toBe(sw2(board, 'front'));
  });

  it('a second press during the turn turns it back', async () => {
    stubMotion(false);
    vi.useFakeTimers();
    const { wrapper, board, flip } = mountBoard();
    await wrapper.vm.$nextTick();
    flip.toggle();
    flip.toggle();
    expect(flip.flipped.value).toBe(false);
    expect(board.hasAttribute('data-flipped')).toBe(false);
    expect(board.dataset.turning).toBe('run');
    vi.advanceTimersByTime(800);
    expect(board.hasAttribute('data-turning')).toBe(false);
    expect(face(board, 'back').hasAttribute('inert')).toBe(true);
  });

  it('the state is not remembered and cleans up on unmount', async () => {
    stubMotion(false);
    vi.useFakeTimers();
    const first = mountBoard();
    first.flip.toggle();
    first.wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    const second = mountBoard();
    expect(second.flip.flipped.value).toBe(false);
    expect(second.board.hasAttribute('data-flipped')).toBe(false);
  });
});
