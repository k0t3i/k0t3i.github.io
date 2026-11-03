import { mount } from '@vue/test-utils';
import { createSSRApp, h, readonly, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BackBom from '../../src/components/BackBom.vue';
import BackPopulated from '../../src/components/BackPopulated.vue';
import BoardBack from '../../src/components/BoardBack.vue';
import BoardPage from '../../src/components/BoardPage.vue';
import DisplayModule from '../../src/components/DisplayModule.vue';
import FlipSwitch from '../../src/components/FlipSwitch.vue';
import PartList from '../../src/components/PartList.vue';
import PartSheet from '../../src/components/PartSheet.vue';
import PartSprite from '../../src/components/PartSprite.vue';
import PartTrigger from '../../src/components/PartTrigger.vue';
import PcbMarks from '../../src/components/PcbMarks.vue';
import TactileSwitch from '../../src/components/TactileSwitch.vue';
import ThemeJumper from '../../src/components/ThemeJumper.vue';
import UptimeCounter from '../../src/components/UptimeCounter.vue';
import { FLIP, type Flip } from '../../src/composables/useFlip';
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

/** A flip state as BoardPage provides it, without a board: SW2 reads it, a press calls toggle. */
function flipState(pressed = false): Flip & { calls: number } {
  const state = {
    calls: 0,
    flipped: readonly(ref(pressed)),
    ready: readonly(ref(true)),
    toggle: () => {
      state.calls += 1;
    },
  };
  return state;
}

describe('FlipSwitch', () => {
  it('SW2 is a named toggle button, hidden until the board is ready', async () => {
    const pending: Flip = { flipped: readonly(ref(false)), ready: readonly(ref(false)), toggle: () => {} };
    const app = createSSRApp({ render: () => h(FlipSwitch, { back: fr.back }) });
    app.provide(FLIP, pending);
    expect(await renderToString(app)).toMatch(/^<button class="sw2" type="button" aria-pressed="false" hidden/);

    const state = flipState();
    const wrapper = mount(FlipSwitch, { props: { back: fr.back }, global: { provide: { [FLIP as symbol]: state } } });
    const button = wrapper.get('button.sw2');
    expect(button.attributes()).not.toHaveProperty('hidden');
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('svg > use').attributes('href')).toBe('#part-slide-switch');
    expect(wrapper.findAll('[aria-hidden="true"].sw2__pos').map((s) => s.text())).toEqual(['TOP', 'BOT']);
    // Accessible name: the reference, then the hidden text (the positions are aria-hidden).
    expect(`${wrapper.get('.part__ref').text()} ${wrapper.get('.vh').text()}`).toBe('SW2 face arrière');
    await button.trigger('click');
    expect(state.calls).toBe(1);
  });

  it('is pressed while the back side is up', () => {
    const wrapper = mount(FlipSwitch, { props: { back: en.back }, global: { provide: { [FLIP as symbol]: flipState(true) } } });
    expect(wrapper.get('button.sw2').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('.vh').text()).toBe('back side');
  });
});

describe('PartSprite', () => {
  it('draws SW2 as a slide switch with its slider on either side', () => {
    const wrapper = mount(PartSprite);
    const symbol = wrapper.get('symbol#part-slide-switch');
    expect(symbol.attributes('viewBox')).toBe('0 0 32 14');
    expect(symbol.findAll('.pcb-slider--top')).toHaveLength(1);
    expect(symbol.findAll('.pcb-slider--bot')).toHaveLength(1);
    expect(symbol.findAll('.pcb-pad').length).toBeGreaterThanOrEqual(3);
  });
});

describe('BackBom', () => {
  // The exact copy of Annex A is checked by the e2e suite, against the oracle tests/helpers/copy.ts.
  for (const content of [fr, en]) {
    it(`is a real table, one row per part (${content.locale})`, () => {
      const { bom } = content.back;
      const wrapper = mount(BackBom, { props: { back: content.back } });
      const table = wrapper.get('table.bom');
      expect(table.get('caption').text()).toBe(bom.caption);
      const heads = table.findAll('thead th');
      expect(heads.map((th) => th.text())).toEqual([bom.columns.ref, bom.columns.part, bom.columns.value]);
      expect(heads.map((th) => th.attributes('scope'))).toEqual(['col', 'col', 'col']);
      const rows = table
        .findAll('tbody tr')
        .map((tr) => [...tr.element.children].map((c) => `${c.tagName}${c.getAttribute('scope') ?? ''} ${c.textContent?.trim()}`));
      expect(rows).toEqual(bom.rows.map((r) => [`THrow ${r.ref}`, `TD ${r.part}`, `TD ${r.value}`]));
      expect(rows).toHaveLength(11);
      // The copper of the bottom side is decoration only.
      const decor = wrapper.get('svg.bom__copper');
      expect(decor.attributes('aria-hidden')).toBe('true');
      expect(decor.attributes('focusable')).toBe('false');
    });
  }
});

describe('BackPopulated', () => {
  it('shows the populated side as one image with its text alternative, no HTML text', () => {
    const wrapper = mount(BackPopulated, { props: { back: fr.back } });
    const img = wrapper.get('img.back-populated');
    expect(img.attributes('alt')).toBe(fr.back.populatedAlt);
    expect(img.attributes('src')).toMatch(/back-populated[\w-]*\.svg$/);
    expect([img.attributes('width'), img.attributes('height')]).toEqual(['1600', '900']);
    expect(img.attributes('decoding')).toBe('async');
    expect(wrapper.text()).toBe('');
  });
});

describe('BoardBack', () => {
  it('is a section named by its heading, with its SW2 slot and the variant of the build', () => {
    const wrapper = mount(BoardBack, { props: { back: fr.back }, global: { provide: { [FLIP as symbol]: flipState() } } });
    const section = wrapper.get('section.board__face.board__face--back');
    expect(section.attributes('aria-labelledby')).toBe('back-title');
    expect(section.get('h2#back-title.silk-heading').text()).toBe(fr.back.title);
    expect(section.findAll('.board__sw2 > button.sw2')).toHaveLength(1);
    // vitest.config.ts builds the bill of materials.
    expect(section.findAll('table.bom')).toHaveLength(1);
    expect(section.findAll('img.back-populated')).toHaveLength(0);
  });
});

describe('BoardPage structure', () => {
  it('two faces in a body, the edge beside them, the skip link outside', () => {
    const wrapper = mount(BoardPage, { props: { content: fr }, global: { stubs: { RouterLink: true } } });
    const board = wrapper.get('div.board.board--home');
    const body = board.get(':scope > div.board__body');
    const faces = body.findAll(':scope > .board__face');
    expect(faces.map((f) => `${f.element.tagName} ${f.classes().join(' ')}`)).toEqual([
      'DIV board__face board__face--front',
      'SECTION board__face board__face--back',
    ]);
    // The front face is a div: its header and footer stay the banner and the contentinfo of the page.
    const front = faces[0];
    expect(front?.findAll(':scope > header.board__header, :scope > main#contenu, :scope > footer.board__footer')).toHaveLength(3);
    const edge = board.get(':scope > div.board__edge');
    expect(edge.attributes('aria-hidden')).toBe('true');
    expect(edge.text()).toBe('');
    expect(wrapper.get('a.skip-link').element.closest('.board')).toBeNull();
    // One SW2 slot in the header, right after JP1, and one on the back.
    expect(front?.findAll('header .board__jp1 + .board__sw2 > button.sw2')).toHaveLength(1);
    expect(faces[1]?.findAll('.board__sw2 > button.sw2')).toHaveLength(1);
  });
});
