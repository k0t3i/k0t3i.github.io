import { mount } from '@vue/test-utils';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoardPage from '../../src/components/BoardPage.vue';
import DisplayModule from '../../src/components/DisplayModule.vue';
import PartList from '../../src/components/PartList.vue';
import PartSheet from '../../src/components/PartSheet.vue';
import PartTrigger from '../../src/components/PartTrigger.vue';
import PcbMarks from '../../src/components/PcbMarks.vue';
import TactileSwitch from '../../src/components/TactileSwitch.vue';
import ThemeJumper from '../../src/components/ThemeJumper.vue';
import UptimeCounter from '../../src/components/UptimeCounter.vue';
import { en } from '../../src/content/en';
import { fr } from '../../src/content/fr';
import { SITE } from '../../src/content/site';
import type { PartContent } from '../../src/content/types';

const part = (content: typeof fr, id: string): PartContent => {
  const found = [...content.principles, ...content.connectors].find((p) => p.id === id);
  if (!found) throw new Error(`no part ${id}`);
  return found;
};

describe('PartTrigger', () => {
  it('renders a button wired to its sheet', () => {
    const wrapper = mount(PartTrigger, { props: { part: part(fr, 'r1') } });
    const button = wrapper.get('button.part__trigger');
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('popovertarget')).toBe('sheet-r1');
    expect(wrapper.get('.part__ref').text()).toBe('R1');
    expect(wrapper.get('.part__label').text()).toBe(part(fr, 'r1').label);
    expect(wrapper.get('svg.part__body').attributes('aria-hidden')).toBe('true');
  });

  it('draws each part with the symbol of the contract', () => {
    const symbols = [...fr.principles, ...fr.connectors].map((p) =>
      mount(PartTrigger, { props: { part: p } }).get('svg.part__body use').attributes('href'),
    );
    expect(symbols).toEqual([
      '#part-resistor',
      '#part-capacitor',
      '#part-led',
      '#part-diode',
      '#part-chip',
      '#part-header-6',
      '#part-header-4',
      '#part-usb-c',
    ]);
  });

  it('marks the label language when it differs from the page', () => {
    const wrapper = mount(PartTrigger, { props: { part: part(en, 'j1') } });
    expect(wrapper.get('.part__label').attributes('lang')).toBe('fr');
    const plain = mount(PartTrigger, { props: { part: part(en, 'r1') } });
    expect(plain.get('.part__label').attributes('lang')).toBeUndefined();
  });
});

describe('PartSheet', () => {
  it('is a named dialog popover', () => {
    const wrapper = mount(PartSheet, { props: { part: part(fr, 'r1'), close: fr.close } });
    const sheet = wrapper.get('div.sheet');
    expect(sheet.attributes('id')).toBe('sheet-r1');
    expect(sheet.attributes()).toHaveProperty('popover');
    expect(sheet.attributes('role')).toBe('dialog');
    expect(sheet.attributes('aria-labelledby')).toBe('sheet-r1-title');
    const title = wrapper.get('h3.sheet__title');
    expect(title.attributes('id')).toBe('sheet-r1-title');
    expect(title.attributes('tabindex')).toBe('-1');
    expect(title.attributes()).toHaveProperty('autofocus');
    const close = wrapper.get('button.sheet__close');
    expect(close.attributes('type')).toBe('button');
    expect(close.attributes('popovertarget')).toBe('sheet-r1');
    expect(close.attributes('popovertargetaction')).toBe('hide');
    expect(close.text()).toBe('Fermer');
    expect(wrapper.get('.sheet__ref').text()).toBe('R1 · résistance');
  });

  it('J1 sheet renders its image only once the sheet has opened', async () => {
    const wrapper = mount(PartSheet, { props: { part: part(fr, 'j1'), close: fr.close } });
    const toggle = async (newState: 'open' | 'closed') => {
      await wrapper.get('div.sheet').trigger('toggle', { newState, oldState: newState === 'open' ? 'closed' : 'open' });
    };
    // Server render and first client render: no picture, so hydration matches and nothing loads.
    expect(wrapper.find('picture').exists()).toBe(false);
    await toggle('closed');
    expect(wrapper.find('picture').exists()).toBe(false);
    await toggle('open');
    const img = wrapper.get('picture.sheet__media img');
    // Its own URLs come one tick after the picture (one request in WebKit: keyboard.spec checks it).
    await wrapper.vm.$nextTick();
    expect(img.attributes('src')).toBe('/img/kit-urgence-380.jpg');
    expect(img.attributes('srcset')).toBe('/img/kit-urgence-380.jpg 380w, /img/kit-urgence-760.jpg 760w');
    // Kept after closing: a second opening shows it at once.
    await toggle('closed');
    expect(wrapper.find('picture.sheet__media img').exists()).toBe(true);
    expect(img.attributes('decoding')).toBe('async');
    expect(img.attributes('sizes')).toBe('19rem');
    expect(img.attributes('width')).toBe('380');
    expect(img.attributes('height')).toBe('475');
    expect(img.attributes('alt')).toBe(part(fr, 'j1').media?.alt);
    expect(wrapper.findAll('picture source').map((s) => s.attributes('type'))).toEqual(['image/avif', 'image/webp']);
    expect(wrapper.get('a.sheet__link').attributes('href')).toBe(`${SITE.baseUrl}kit-urgence/`);
  });

  it('J1 sheet gives the link to the project before its picture', async () => {
    // The call to action stays in view when a short window makes the sheet scroll: the picture comes last.
    const wrapper = mount(PartSheet, { props: { part: part(fr, 'j1'), close: fr.close } });
    const sheet = wrapper.get('div.sheet');
    await sheet.trigger('toggle', { newState: 'open', oldState: 'closed' });
    expect([...sheet.element.children].map((c) => c.className)).toEqual([
      'sheet__ref',
      'sheet__title',
      'sheet__body',
      'sheet__link',
      'sheet__media',
      'sheet__close',
    ]);
  });

  it('J3 uses SITE.email and SITE.github', () => {
    const wrapper = mount(PartSheet, { props: { part: part(fr, 'j3'), close: fr.close } });
    const hrefs = wrapper.findAll('ul.sheet__links a').map((a) => a.attributes('href'));
    expect(hrefs).toEqual([`mailto:${SITE.email}`, SITE.github]);
    // VoiceOver drops the list role of an unstyled list: it is restated.
    expect(wrapper.get('ul.sheet__links').attributes('role')).toBe('list');
  });

  it('puts the language of the title on the heading', () => {
    const wrapper = mount(PartSheet, { props: { part: part(en, 'j1'), close: en.close } });
    expect(wrapper.get('h3.sheet__title').attributes('lang')).toBe('fr');
  });
});

describe('DisplayModule', () => {
  it('prints one pin label per pad, and keeps the pin text as written', () => {
    const wrapper = mount(DisplayModule, { props: { display: fr.display } });
    const pins = wrapper.get('p.disp__pins');
    expect(pins.attributes('aria-hidden')).toBe('true');
    expect(pins.findAll('.disp__pin').map((p) => p.text())).toEqual(fr.display.pins.split(' '));
    expect(pins.element.textContent).toBe(fr.display.pins);
  });
});

describe('TactileSwitch', () => {
  it('takes its board reference and its hidden name from the content', () => {
    const wrapper = mount(TactileSwitch, { props: { designator: 'SW9', hidden: fr.display.switchHidden } });
    const button = wrapper.get('button.sw1');
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('designator')).toBeUndefined();
    expect(wrapper.get('.part__ref').text()).toBe('SW9');
    expect(wrapper.get('.vh').text()).toBe(fr.display.switchHidden);
    expect([fr.display.switchRef, en.display.switchRef]).toEqual(['SW1', 'SW1']);
  });
});

describe('PartList', () => {
  it('keeps the list role on its unstyled list', () => {
    const wrapper = mount(PartList, { props: { section: fr.sections.principles, parts: fr.principles, close: fr.close } });
    expect(wrapper.get('ul.parts__list').attributes('role')).toBe('list');
    expect(wrapper.findAll('ul.parts__list > li')).toHaveLength(5);
  });
});

describe('ThemeJumper', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('JP1 is a named toggle button, hidden until mounted', async () => {
    // The prerender: hidden, not pressed (green), so it never shows without JavaScript.
    const ssr = await renderToString(createSSRApp({ render: () => h(ThemeJumper, { theme: fr.theme }) }));
    expect(ssr).toMatch(/^<button class="jp1" type="button" aria-pressed="false" hidden/);

    const wrapper = mount(ThemeJumper, { props: { theme: fr.theme } });
    const button = wrapper.get('button.jp1');
    // onMounted has run, the DOM is patched on the next tick: the first client render equals the prerender.
    expect(button.attributes()).toHaveProperty('hidden');
    await wrapper.vm.$nextTick();
    expect(button.attributes()).not.toHaveProperty('hidden');

    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('svg > use').attributes('href')).toBe('#part-jumper');
    expect(wrapper.get('.part__ref').text()).toBe('JP1');
    expect(wrapper.findAll('[aria-hidden="true"].jp1__pos').map((s) => s.text())).toEqual(['VERT', 'NOIR']);
    expect(wrapper.get('.vh').text()).toBe('carte noire');
    // Accessible name: the reference, then the hidden text (the positions are aria-hidden).
    expect(`${wrapper.get('.part__ref').text()} ${wrapper.get('.vh').text()}`).toBe('JP1 carte noire');
  });

  it('toggles the board and remembers the choice', async () => {
    const wrapper = mount(ThemeJumper, { props: { theme: en.theme } });
    await wrapper.vm.$nextTick();
    const button = wrapper.get('button.jp1');
    await button.trigger('click');
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('k0t3i.theme')).toBe('dark');
    await button.trigger('click');
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(document.documentElement.dataset.theme).toBe('green');
    expect(localStorage.getItem('k0t3i.theme')).toBe('green');
    expect(wrapper.findAll('.jp1__pos').map((s) => s.text())).toEqual(['GREEN', 'BLACK']);
    expect(wrapper.get('.vh').text()).toBe('black board');
  });

  it('two quick clicks switch twice, even while the first view transition is pending', async () => {
    // The view transition runs its update later: the second click must not read the old state.
    const updates: (() => Promise<void> | void)[] = [];
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => Promise<void> | void) => {
        updates.push(update);
        return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition: () => {} };
      },
    });
    try {
      const wrapper = mount(ThemeJumper, { props: { theme: fr.theme } });
      await wrapper.vm.$nextTick();
      const button = wrapper.get('button.jp1');
      await button.trigger('click');
      await button.trigger('click');
      expect(localStorage.getItem('k0t3i.theme')).toBe('green');
      for (const update of updates) await update();
      await wrapper.vm.$nextTick();
      expect(updates).toHaveLength(2);
      expect(document.documentElement.dataset.theme).toBe('green');
      expect(button.attributes('aria-pressed')).toBe('false');
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });

  it('reads the saved choice once mounted, and leaves the page attribute to the head script', async () => {
    localStorage.setItem('k0t3i.theme', 'dark');
    const wrapper = mount(ThemeJumper, { props: { theme: fr.theme } });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('button.jp1').attributes('aria-pressed')).toBe('true');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('BoardPage', () => {
  it('listens to touchstart, passively, so iOS Safari applies :active on a tap', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    try {
      const wrapper = mount(BoardPage, { props: { content: fr }, global: { stubs: { RouterLink: true } } });
      const call = add.mock.calls.find(([type]) => type === 'touchstart');
      expect(call?.[2]).toEqual({ passive: true });
      wrapper.unmount();
      expect(remove.mock.calls.some(([type, listener]) => type === 'touchstart' && listener === call?.[1])).toBe(true);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});

describe('PcbMarks', () => {
  it('renders the three marks', () => {
    const wrapper = mount(PcbMarks, { props: { marks: fr.marks } });
    expect(wrapper.get('ul.pcb-marks').attributes('role')).toBe('list');
    const items = wrapper.findAll('ul.pcb-marks > li');
    expect(items).toHaveLength(3);
    items.forEach((li, i) => {
      expect(li.get('span[aria-hidden="true"]').text()).toBe(fr.marks[i]?.visible);
      expect(li.get('span.vh').text()).toBe(fr.marks[i]?.hidden);
    });
  });
});

describe('UptimeCounter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the build-date value, then the value of the day once mounted', async () => {
    // __BUILD_DATE__ is 2026-11-03 in vitest.config.ts: 46 000 h.
    vi.setSystemTime(new Date('2027-06-01T12:00:00Z'));
    const wrapper = mount(UptimeCounter, { props: { uptime: fr.uptime, locale: 'fr' } });
    const data = wrapper.get('data.uptime__value');
    // onMounted has run but the DOM has not been patched yet: still the build-date value.
    expect(data.attributes('value')).toBe('46000');
    await wrapper.vm.$nextTick();
    expect(data.attributes('value')).toBe('47000');
    expect(data.text()).toBe('47 000');
  });

  it('starts from the build date (what the prerender and hydration see)', () => {
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    const wrapper = mount(UptimeCounter, { props: { uptime: fr.uptime, locale: 'fr' } });
    expect(wrapper.get('.uptime').text()).toBe(
      'uptime : 46 000 h à concevoir, coder, débugger, former, manager, apprendre',
    );
    expect(wrapper.get('data').attributes('value')).toBe('46000');
  });

  it('formats in English', () => {
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    const wrapper = mount(UptimeCounter, { props: { uptime: en.uptime, locale: 'en' } });
    expect(wrapper.get('.uptime').text()).toBe('uptime: 46,000 h designing, coding, debugging, training, managing, learning');
  });
});
