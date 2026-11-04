import { mount, type VueWrapper } from '@vue/test-utils';
import { runInNewContext } from 'node:vm';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_KEY, BOOT_MS, STANDBY_MS } from '../../src/lib/boot';
import { THEME_SNIPPET } from '../../src/lib/theme';
import { useBoot } from '../../src/composables/useBoot';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

type Listener = (event: { matches: boolean }) => void;
let reducedListeners = new Set<Listener>();
let reducedMatches = false;

/** Reduced motion or not, as the test sets it; a change reaches the listeners (change()). */
function stubMotion(reduced: boolean): void {
  reducedMatches = reduced;
  reducedListeners = new Set();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === REDUCED_QUERY ? reducedMatches : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, l: Listener) => {
      if (query === REDUCED_QUERY) reducedListeners.add(l);
    },
    removeEventListener: (_: string, l: Listener) => reducedListeners.delete(l),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function changeMotion(reduced: boolean): void {
  reducedMatches = reduced;
  for (const l of [...reducedListeners]) l({ matches: reduced });
}

/** The head script found a board to power on: the page is in standby from the first paint. */
const standby = (): void => {
  document.documentElement.dataset.boot = '';
};
const inStandby = (): boolean => document.documentElement.hasAttribute('data-boot');

function mountBoot(): { wrapper: VueWrapper; booting: () => boolean; end: () => void } {
  let state: ReturnType<typeof useBoot> | undefined;
  const Harness = defineComponent({
    setup() {
      state = useBoot();
      return () => h('div', { class: 'board' });
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  return { wrapper, booting: () => Boolean(state?.booting.value), end: () => state?.end() };
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  delete document.documentElement.dataset.boot;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  delete document.documentElement.dataset.boot;
  document.body.innerHTML = '';
});

describe('useBoot', () => {
  it('boots once per session', async () => {
    stubMotion(false);
    standby();
    const first = mountBoot();
    // The power-on takes over the standby of the head script.
    expect(first.booting()).toBe(true);
    expect(inStandby()).toBe(false);
    vi.advanceTimersByTime(BOOT_MS - 1);
    expect(first.booting()).toBe(true);
    expect(sessionStorage.getItem(BOOT_KEY)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(first.booting()).toBe(false);
    expect(sessionStorage.getItem(BOOT_KEY)).toBe('1');
    expect(BOOT_MS).toBe(1200);
    first.wrapper.unmount();

    // A second page of the session: no power-on, even if something put the board in standby.
    standby();
    const second = mountBoot();
    await nextTick();
    expect(second.booting()).toBe(false);
    expect(inStandby()).toBe(false);
    vi.advanceTimersByTime(BOOT_MS * 2);
    expect(second.booting()).toBe(false);
  });

  it('no boot with reduced motion', () => {
    stubMotion(true);
    standby();
    const { booting } = mountBoot();
    expect(booting()).toBe(false);
    expect(inStandby()).toBe(false);
    vi.advanceTimersByTime(BOOT_MS * 2);
    expect(booting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    // Nothing played: a later page may still power the board on.
    expect(sessionStorage.getItem(BOOT_KEY)).toBeNull();
  });

  it('no boot when the board was not in standby (no head script, or the app mounted after it gave up)', () => {
    stubMotion(false);
    const { booting } = mountBoot();
    expect(booting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('timer cleared on unmount', () => {
    stubMotion(false);
    standby();
    const { wrapper, booting } = mountBoot();
    expect(booting()).toBe(true);
    vi.advanceTimersByTime(BOOT_MS / 2);
    const setItem = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem });
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    // Seen in part: not played again in this session.
    expect(setItem).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(BOOT_MS * 2);
    // No late call: nothing runs once the board is gone.
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('a switch to reduced motion during the boot ends it at once', async () => {
    stubMotion(false);
    standby();
    const { booting } = mountBoot();
    await nextTick();
    expect(booting()).toBe(true);
    changeMotion(true);
    await nextTick();
    expect(booting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a sheet opened during the boot ends it', async () => {
    stubMotion(false);
    standby();
    const { wrapper, booting } = mountBoot();
    expect(booting()).toBe(true);
    const sheet = document.createElement('div');
    wrapper.element.append(sheet);
    // A sheet that closes changes nothing; one that opens ends the boot, before it is laid out.
    const toggle = (newState: string) => {
      const event = new Event('beforetoggle');
      Object.defineProperty(event, 'newState', { value: newState });
      sheet.dispatchEvent(event);
    };
    toggle('closed');
    expect(booting()).toBe(true);
    toggle('open');
    expect(booting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(sessionStorage.getItem(BOOT_KEY)).toBe('1');
  });

  it('no boot in a tab in the background: it would play unseen', () => {
    stubMotion(false);
    standby();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      const { booting } = mountBoot();
      expect(booting()).toBe(false);
      expect(inStandby()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      // Not seen: the next page of the session may still power the board on.
      expect(sessionStorage.getItem(BOOT_KEY)).toBeNull();
    } finally {
      delete (document as unknown as { visibilityState?: string }).visibilityState;
    }
    expect(document.visibilityState).toBe('visible');
  });

  it('end() ends the boot at once, as seen', () => {
    stubMotion(false);
    standby();
    const { booting, end } = mountBoot();
    expect(booting()).toBe(true);
    end();
    expect(booting()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(sessionStorage.getItem(BOOT_KEY)).toBe('1');
    // Once ended, nothing more: no error.
    end();
    expect(booting()).toBe(false);
  });

  it('a blocked storage means no boot, and no error', () => {
    stubMotion(false);
    standby();
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    const { booting } = mountBoot();
    expect(booting()).toBe(false);
    expect(inStandby()).toBe(false);
  });
});

describe('the standby of the head script', () => {
  /** Runs the head script against a fake page: the attributes it set on <html>, and its timers. */
  function run(opts: { booted?: string | null; reduced?: boolean; storage?: 'ok' | 'throws' | 'read-only' }) {
    const dataset: Record<string, string> = {};
    const timers: { fn: () => void; ms: number }[] = [];
    const stored: Record<string, string> = {};
    const sessionStorage =
      opts.storage === 'throws'
        ? {
            getItem: () => {
              throw new Error('SecurityError');
            },
          }
        : {
            getItem: (key: string) => (key === BOOT_KEY ? (opts.booted ?? null) : null),
            setItem: (key: string, value: string) => {
              if (opts.storage === 'read-only') throw new Error('QuotaExceededError');
              stored[key] = value;
            },
          };
    runInNewContext(THEME_SNIPPET, {
      localStorage: { getItem: () => null },
      sessionStorage,
      matchMedia: (query: string) => ({
        matches: query === '(prefers-reduced-motion: no-preference)' ? !opts.reduced : false,
      }),
      setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
      document: { documentElement: { dataset } },
    });
    return { dataset, timers, stored };
  }

  it('puts the board in standby on the first visit of the session, with motion allowed', () => {
    const { dataset } = run({});
    expect(dataset.boot).toBe('');
    // The theme script is still the theme script.
    expect(dataset.js).toBe('');
  });

  it('leaves it alone once the board has booted in this session', () => {
    expect(run({ booted: '1' }).dataset.boot).toBeUndefined();
  });

  it('leaves it alone under reduced motion', () => {
    expect(run({ reduced: true }).dataset.boot).toBeUndefined();
  });

  it('gives up the standby by itself after about two seconds, should the app never mount', () => {
    const { dataset, timers, stored } = run({});
    expect(timers.map((t) => t.ms)).toEqual([STANDBY_MS]);
    expect(STANDBY_MS).toBeGreaterThan(BOOT_MS);
    expect(STANDBY_MS).toBe(2000);
    expect(stored).toEqual({});
    timers[0]?.fn();
    expect(dataset.boot).toBeUndefined();
    // The session counts as booted: an app that mounts later, or the next page, finds no standby to
    // take over and shows the board at rest, never the dark screen again.
    expect(stored).toEqual({ [BOOT_KEY]: '1' });
  });

  it('leaves the session to the app once the app has taken the standby over', () => {
    const { dataset, timers, stored } = run({});
    // useBoot took it over: it plays the power-on, or (a tab in the background) decides not to.
    delete dataset.boot;
    timers[0]?.fn();
    expect(stored).toEqual({});
    expect(dataset.boot).toBeUndefined();
  });

  it('a storage that refuses the key at that moment changes nothing else', () => {
    const { dataset, timers } = run({ storage: 'read-only' });
    expect(dataset.boot).toBe('');
    expect(() => timers[0]?.fn()).not.toThrow();
    expect(dataset.boot).toBeUndefined();
  });

  it('swallows a storage that throws', () => {
    const { dataset } = run({ storage: 'throws' });
    expect(dataset.boot).toBeUndefined();
    expect(dataset.js).toBe('');
  });

  it('uses the session key k0t3i.booted', () => expect(BOOT_KEY).toBe('k0t3i.booted'));
});
