import { mount, type VueWrapper } from '@vue/test-utils';
import { createSSRApp, defineComponent, h, nextTick, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoardPage from '../../src/components/BoardPage.vue';
import PartTrigger from '../../src/components/PartTrigger.vue';
import { provideBoardState, useBoardState, type BoardState } from '../../src/composables/useBoardState';
import { fr } from '../../src/content/fr';
import type { PartContent, PartId } from '../../src/content/types';

const PARTS = [...fr.principles, ...fr.connectors];
const part = (id: PartId): PartContent => {
  const found = PARTS.find((p) => p.id === id);
  if (!found) throw new Error(`no part ${id}`);
  return found;
};

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

/** A component that runs `setup` and renders `children` in a div. */
const harness = (setup: () => void, children: () => ReturnType<typeof h>[] = () => []) =>
  defineComponent({
    setup() {
      setup();
      return () => h('div', { class: 'board' }, children());
    },
  });

/** Some parts on a board that provides the state, as BoardPage does. */
function mountParts(ids: PartId[]): { wrapper: VueWrapper; state: BoardState; trigger: (id: PartId) => HTMLButtonElement } {
  let state: BoardState | undefined;
  const Harness = harness(
    () => {
      state = provideBoardState(ref(false));
    },
    () => ids.map((id) => h(PartTrigger, { part: part(id), key: id })),
  );
  const wrapper = mount(Harness, { attachTo: document.body });
  const trigger = (id: PartId) => wrapper.get(`button[popovertarget="sheet-${id}"]`).element as HTMLButtonElement;
  return { wrapper, state: state as BoardState, trigger };
}

const enter = (el: Element): boolean => el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
const leave = (el: Element): boolean => el.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));

beforeEach(() => stubMotion(true));

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('board state', () => {
  it('hover and focus set the active part', async () => {
    const { state, trigger } = mountParts(['r1', 'c1']);
    expect(state.activePart.value).toBeNull();
    expect(state.booting.value).toBe(false);

    enter(trigger('r1'));
    expect(state.activePart.value).toBe('r1');
    leave(trigger('r1'));
    expect(state.activePart.value).toBeNull();

    // The keyboard: the part with the focus is the active one, until it loses it.
    trigger('c1').focus();
    expect(state.activePart.value).toBe('c1');
    trigger('c1').blur();
    expect(state.activePart.value).toBeNull();
  });

  it('fast hover sequence ends on the last part', () => {
    const { state, trigger } = mountParts(['r1', 'c1', 'd1']);
    for (const id of ['r1', 'c1', 'd1'] as const) {
      enter(trigger(id));
      expect(state.activePart.value).toBe(id);
      leave(trigger(id));
    }
    expect(state.activePart.value).toBeNull();

    // Ending on a part: that part, and only that one.
    enter(trigger('r1'));
    leave(trigger('r1'));
    enter(trigger('c1'));
    leave(trigger('c1'));
    enter(trigger('d1'));
    expect(state.activePart.value).toBe('d1');
  });

  it('the pointer wins over the focus, and the focused part comes back when the pointer leaves', () => {
    const { state, trigger } = mountParts(['r1', 'c1']);
    trigger('r1').focus();
    expect(state.activePart.value).toBe('r1');
    enter(trigger('c1'));
    expect(state.activePart.value).toBe('c1');
    leave(trigger('c1'));
    expect(state.activePart.value).toBe('r1');
  });

  it('a focus that is not shown (a mouse click) does not light the part', () => {
    const { state, trigger } = mountParts(['r1']);
    const el = trigger('r1');
    const matches = el.matches.bind(el);
    // As after a click: focused, but without the focus ring.
    vi.spyOn(el, 'matches').mockImplementation((s: string) => (s === ':focus-visible' ? false : matches(s)));
    el.focus();
    expect(state.activePart.value).toBeNull();
  });

  it('a part outside a board has a state of its own', () => {
    let state: BoardState | undefined;
    mount(
      harness(() => {
        state = useBoardState();
      }),
    );
    expect(state?.activePart.value).toBeNull();
    state?.setActive('r1');
    expect(state?.activePart.value).toBe('r1');
  });
});

describe('BoardPage reflects the state on the board', () => {
  it('the prerender carries no state: no data-active, no data-booting', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] });
    await router.push('/');
    await router.isReady();
    const html = await renderToString(createSSRApp({ render: () => h(BoardPage, { content: fr }) }).use(router));
    expect(html).toMatch(/<div class="board board--home"/);
    // Attributes, not the words in a comment of the template.
    expect(html).not.toMatch(/\sdata-(active|booting|lit)[=\s>]/);
  });

  it('data-active follows the part under the pointer', async () => {
    const wrapper = mount(BoardPage, { props: { content: fr }, global: { stubs: { RouterLink: true } }, attachTo: document.body });
    const board = wrapper.get('div.board').element as HTMLElement;
    const r1 = wrapper.get('button[popovertarget="sheet-r1"]').element;
    expect(board.hasAttribute('data-active')).toBe(false);
    enter(r1);
    await nextTick();
    expect(board.dataset.active).toBe('r1');
    leave(r1);
    await nextTick();
    expect(board.hasAttribute('data-active')).toBe(false);
    // Reduced motion (this test): no power-on.
    expect(board.hasAttribute('data-booting')).toBe(false);
    wrapper.unmount();
  });

  it('data-lit marks the active part and its two traces, and nothing else', async () => {
    const wrapper = mount(BoardPage, { props: { content: fr }, global: { stubs: { RouterLink: true } }, attachTo: document.body });
    const lit = () =>
      wrapper
        .findAll('[data-lit]')
        .map((w) => (w.attributes('id') ? `${w.element.tagName.toLowerCase()}#${w.attributes('id')}` : `${w.classes().join('.')}[${w.attributes('data-part')}]`))
        .sort();
    expect(lit()).toEqual([]);
    for (const id of ['r1', 'j4', 'j5'] as const) {
      enter(wrapper.get(`button[popovertarget="sheet-${id}"]`).element);
      await nextTick();
      expect(lit()).toEqual([`li#part-${id}`, `trace-live[${id}]`, `trace-pulse[${id}]`]);
      leave(wrapper.get(`button[popovertarget="sheet-${id}"]`).element);
      await nextTick();
      expect(lit()).toEqual([]);
    }
    wrapper.unmount();
  });

  it('the first part pointed at during the boot ends it', async () => {
    stubMotion(false);
    vi.useFakeTimers();
    sessionStorage.clear();
    document.documentElement.dataset.boot = '';
    try {
      const wrapper = mount(BoardPage, { props: { content: fr }, global: { stubs: { RouterLink: true } }, attachTo: document.body });
      await nextTick();
      const board = wrapper.get('div.board').element as HTMLElement;
      expect(board.hasAttribute('data-booting')).toBe(true);
      // Pointed at, the part takes the current at once: its trace never plays the sweep, so it is never cut.
      enter(wrapper.get('button[popovertarget="sheet-c1"]').element);
      await nextTick();
      expect(board.hasAttribute('data-booting')).toBe(false);
      expect(board.dataset.active).toBe('c1');
      expect(sessionStorage.getItem('k0t3i.booted')).toBe('1');
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
      sessionStorage.clear();
      delete document.documentElement.dataset.boot;
    }
  });

  it('SW1 pressed during the boot ends it: DISP1 shows the screen its caption names', async () => {
    stubMotion(false);
    vi.useFakeTimers();
    sessionStorage.clear();
    document.documentElement.dataset.boot = '';
    try {
      const wrapper = mount(BoardPage, { props: { content: fr }, global: { stubs: { RouterLink: true } }, attachTo: document.body });
      await nextTick();
      const board = wrapper.get('div.board').element as HTMLElement;
      expect(wrapper.get('svg.disp__pixels').attributes('data-screen')).toBe('boot');
      await wrapper.get('button.sw1').trigger('click');
      expect(board.hasAttribute('data-booting')).toBe(false);
      expect(wrapper.get('svg.disp__pixels').attributes('data-screen')).toBe('uptime');
      expect(wrapper.get('#disp1-caption').text()).toBe(fr.display.captions.uptime);
      expect(sessionStorage.getItem('k0t3i.booted')).toBe('1');
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
      sessionStorage.clear();
      delete document.documentElement.dataset.boot;
    }
  });

  it('data-booting is on the board while it powers on', async () => {
    stubMotion(false);
    vi.useFakeTimers();
    sessionStorage.clear();
    document.documentElement.dataset.boot = '';
    try {
      const wrapper = mount(BoardPage, { props: { content: fr }, global: { stubs: { RouterLink: true } }, attachTo: document.body });
      await nextTick();
      const board = wrapper.get('div.board').element as HTMLElement;
      expect(board.hasAttribute('data-booting')).toBe(true);
      vi.advanceTimersByTime(1200);
      await nextTick();
      expect(board.hasAttribute('data-booting')).toBe(false);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
      sessionStorage.clear();
      delete document.documentElement.dataset.boot;
    }
  });
});
