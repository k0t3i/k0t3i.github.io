import { mount } from '@vue/test-utils';
import { createSSRApp, defineComponent, h, nextTick } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import BackFace from '../../src/components/BackFace.vue';
import { createBackState, provideBackState } from '../../src/composables/useBackState';
import { BACK_REFS } from '../../src/content/backNets';
import { fr } from '../../src/content/fr';

describe('useBackState', () => {
  it('hover beats pinned, leave falls back to pinned', () => {
    const s = createBackState();
    expect(s.active.value).toBeNull();
    s.toggle('U12');
    expect([s.pinned.value, s.active.value]).toEqual(['U12', 'U12']);
    s.hover('U14');
    expect([s.pinned.value, s.active.value]).toEqual(['U12', 'U14']);
    s.hover(null);
    expect(s.active.value).toBe('U12');
  });

  it('the focus lights a part as the hover does, and the pointer wins over it', () => {
    const s = createBackState();
    s.toggle('U12');
    s.focus('U15');
    expect(s.active.value).toBe('U15');
    s.hover('J6');
    expect(s.active.value).toBe('J6');
    s.hover(null);
    expect(s.active.value).toBe('U15');
    s.focus(null);
    expect(s.active.value).toBe('U12');
  });

  it('toggle pins and unpins', () => {
    const s = createBackState();
    s.toggle('U10');
    expect(s.pinned.value).toBe('U10');
    // Another part moves the pin.
    s.toggle('U18');
    expect(s.pinned.value).toBe('U18');
    // The same part again unpins it.
    s.toggle('U18');
    expect([s.pinned.value, s.active.value]).toEqual([null, null]);
  });
});

/** The back face as the board renders it: inside a section that provides the state. */
const Harness = defineComponent({
  setup() {
    const state = provideBackState();
    return () => h('section', { 'data-active': state.active.value ?? undefined }, [h(BackFace, { back: fr.back })]);
  },
});

describe('BackFace, the parts group', () => {
  let wrapper: ReturnType<typeof mount> | undefined;
  afterEach(() => wrapper?.unmount());

  const parts = () => wrapper?.findAll('button.back-part') ?? [];
  const tabStops = () => parts().filter((b) => b.attributes('tabindex') === '0').map((b) => b.attributes('data-ref'));

  it('roving tabindex', async () => {
    wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();
    expect(parts().map((b) => b.attributes('data-ref'))).toEqual([...BACK_REFS]);
    // One tab stop for the group: the first part; the others are reached with the arrows.
    expect(tabStops()).toEqual(['U10']);
    expect(parts().filter((b) => b.attributes('tabindex') === '-1')).toHaveLength(10);
    const group = wrapper.get('[role="group"]');
    expect(group.attributes('aria-label')).toBe(fr.back.group);
    (parts()[0]?.element as HTMLElement).focus();
    for (const [key, expected] of [
      ['ArrowRight', 'U11'],
      ['ArrowDown', 'U12'],
      ['ArrowLeft', 'U11'],
      ['ArrowUp', 'U10'],
      ['ArrowLeft', 'J6'],
      ['ArrowRight', 'U10'],
      ['End', 'J6'],
      ['Home', 'U10'],
    ] as const) {
      await group.trigger('keydown', { key });
      expect(tabStops(), key).toEqual([expected]);
      expect((document.activeElement as HTMLElement).dataset.ref, key).toBe(expected);
    }
  });

  it('the arrows with Alt, Ctrl or Meta are left to the browser and the screen reader', async () => {
    wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();
    (parts()[0]?.element as HTMLElement).focus();
    const group = wrapper.get('[role="group"]');
    for (const [key, mod] of [
      ['ArrowRight', 'altKey'],
      ['ArrowLeft', 'altKey'],
      ['Home', 'ctrlKey'],
      ['End', 'ctrlKey'],
      ['ArrowDown', 'metaKey'],
    ] as const) {
      const event = new KeyboardEvent('keydown', { key, [mod]: true, bubbles: true, cancelable: true });
      group.element.dispatchEvent(event);
      await nextTick();
      expect(event.defaultPrevented, `${mod} ${key}`).toBe(false);
      expect(tabStops(), `${mod} ${key}`).toEqual(['U10']);
      expect((document.activeElement as HTMLElement).dataset.ref).toBe('U10');
    }
    // Without them, the arrows still move.
    await group.trigger('keydown', { key: 'ArrowRight' });
    expect(tabStops()).toEqual(['U11']);
  });

  it('a click pins (aria-pressed), a second one unpins, Escape unpins', async () => {
    wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();
    const section = wrapper.get('section');
    const u14 = () => wrapper?.get('button.back-part[data-ref="U14"]');
    expect(u14()?.attributes('aria-pressed')).toBe('false');
    await u14()?.trigger('click');
    expect(u14()?.attributes('aria-pressed')).toBe('true');
    expect(section.attributes('data-active')).toBe('U14');
    // The pinned part is the tab stop of the group.
    expect(tabStops()).toEqual(['U14']);
    await u14()?.trigger('click');
    expect(u14()?.attributes('aria-pressed')).toBe('false');
    expect(section.attributes('data-active')).toBeUndefined();
    await u14()?.trigger('click');
    await wrapper.get('[role="group"]').trigger('keydown', { key: 'Escape' });
    expect(u14()?.attributes('aria-pressed')).toBe('false');
    expect(section.attributes('data-active')).toBeUndefined();
  });

  it('a row under the pointer lights its part, and touch does not hover', async () => {
    wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();
    const section = wrapper.get('section');
    const row = wrapper.get('tr#row-U10');
    await row.trigger('pointerenter', { pointerType: 'mouse' });
    expect(section.attributes('data-active')).toBe('U10');
    await row.trigger('pointerleave', { pointerType: 'mouse' });
    expect(section.attributes('data-active')).toBeUndefined();
    // A finger lights nothing by passing: a tap pins (click) instead, so nothing stays lit by a hover.
    await wrapper.get('button.back-part[data-ref="U12"]').trigger('pointerenter', { pointerType: 'touch' });
    expect(section.attributes('data-active')).toBeUndefined();
  });

  it('the prerender has no live part: disabled, in a hidden group, nothing lit', async () => {
    const html = await renderToString(createSSRApp(Harness));
    expect(html).not.toContain('data-active');
    expect(html).not.toContain('tabindex');
    expect(html).not.toContain('aria-pressed');
    expect(html).toMatch(/<div class="back__parts" aria-hidden="true">/);
    expect(html.match(/<button[^>]*class="back-part"[^>]*disabled/g)).toHaveLength(11);
  });
});
