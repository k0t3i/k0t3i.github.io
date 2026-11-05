import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { computed, defineComponent, h, provide, readonly, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BenchHost } from '../../src/bench/run';
import { provideBench, type BenchView } from '../../src/composables/useBench';
import { FLIP } from '../../src/composables/useFlip';
import { provideMode } from '../../src/composables/useMode';
import { benchAt } from '../../src/lib/bench';

/*
 * The test bench of the back face in the Konami mode (revision 11, useBench), its chunk replaced by a
 * stand-in: when it plays, once a session of the mode; a turn to the front before its chunk has
 * loaded, or during it; Escape; a click, but of SW2.
 */

const hosts: BenchHost[] = [];
const stops: ReturnType<typeof vi.fn>[] = [];
vi.mock('../../src/bench/run', () => ({
  run: (host: BenchHost) => {
    hosts.push(host);
    const stop = vi.fn();
    stops.push(stop);
    return stop;
  },
}));

const TEXTS = { start: 'start', end: 'end' };
/** A component that runs `setup` and renders what it returns: one factory (vue/one-component-per-file). */
const component = (setup: () => () => ReturnType<typeof h>) => defineComponent({ setup });
let mounted: VueWrapper | undefined;

function mountBench(): { bench: BenchView; on: ReturnType<typeof ref<boolean>>; back: ReturnType<typeof ref<boolean>> } {
  const on = ref(false);
  const back = ref(false);
  let bench: BenchView | undefined;
  // The back face, under a board that provides the turn and the mode (as BoardPage does).
  const Face = component(() => {
    const face = ref<HTMLElement | null>(null);
    bench = provideBench(() => TEXTS, face);
    return () =>
      h('section', { ref: face, class: 'board__face--back' }, [h('div', { class: 'back__circuit' }, [h('img', { src: '/art.svg' })]), h('button', { class: 'sw2' }), h('p', { class: 'other' })]);
  });
  const Harness = component(() => {
    provide(FLIP, { flipped: readonly(back), ready: readonly(ref(true)), toggle: () => {} });
    provideMode().attach({ on: computed(() => on.value), quit: () => (on.value = false) });
    return () => h('div', { class: 'board' }, [h(Face)]);
  });
  mounted = mount(Harness, { attachTo: document.body });
  if (!bench) throw new Error('no bench');
  return { bench, on, back };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  hosts.length = 0;
  stops.length = 0;
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the test bench of the back face', () => {
  it('plays on the first turn in the mode, says it starts and ends, once a session; the next session plays again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { bench, on, back } = mountBench();
    back.value = true;
    await flushPromises();
    expect(hosts).toHaveLength(0);
    expect(bench.phase.value).toBeUndefined();
    on.value = true;
    await flushPromises();
    expect(bench.phase.value).toBe('route');
    expect(bench.running.value).toBe(true);
    vi.advanceTimersByTime(200);
    expect(bench.said.value).toBe('start');
    expect(hosts).toHaveLength(1);
    hosts[0]?.set(benchAt(6000, 152, 11));
    expect(bench.rows.map((r) => r.value).filter(Boolean)).toHaveLength(4);
    hosts[0]?.done();
    vi.advanceTimersByTime(200);
    expect(bench.phase.value).toBe('done');
    expect(bench.said.value).toBe('end');
    expect(stops[0]).toHaveBeenCalledTimes(1);
    // A later turn: the end at once, no chunk, nothing said.
    back.value = false;
    await flushPromises();
    back.value = true;
    await flushPromises();
    expect(hosts).toHaveLength(1);
    expect(bench.phase.value).toBe('done');
    // The mode ends: nothing left; a new session plays again.
    on.value = false;
    await flushPromises();
    expect(bench.phase.value).toBeUndefined();
    expect(bench.said.value).toBe('');
    on.value = true;
    await flushPromises();
    expect(hosts).toHaveLength(2);
  });

  it('a turn to the front before its chunk has loaded leaves its play for the next turn', async () => {
    const { bench, on, back } = mountBench();
    on.value = true;
    back.value = true;
    await Promise.resolve();
    back.value = false;
    await flushPromises();
    expect(hosts).toHaveLength(0);
    expect(bench.phase.value).toBeUndefined();
    expect(bench.running.value).toBe(false);
    back.value = true;
    await flushPromises();
    expect(hosts).toHaveLength(1);
    expect(bench.phase.value).toBe('route');
  });

  it('a turn to the front during it stops it, unsaid; the next turn shows its end', async () => {
    const { bench, on, back } = mountBench();
    on.value = true;
    back.value = true;
    await flushPromises();
    hosts[0]?.set(benchAt(2000, 152, 11));
    back.value = false;
    await flushPromises();
    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(bench.said.value).toBe('');
    back.value = true;
    await flushPromises();
    expect(hosts).toHaveLength(1);
    expect(bench.phase.value).toBe('done');
  });

  it('Escape skips to its end and goes no further; a click skips too, but a click of SW2', async () => {
    const { bench, on, back } = mountBench();
    const page = vi.fn();
    document.addEventListener('keydown', page);
    on.value = true;
    back.value = true;
    await flushPromises();
    (document.querySelector('.sw2') as HTMLElement).click();
    expect(bench.running.value).toBe(true);
    document.querySelector('.other')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(bench.phase.value).toBe('done');
    expect(page).not.toHaveBeenCalled();
    // Done: the next Escape is the page's (it ends the mode, useDisplay).
    document.querySelector('.other')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(page).toHaveBeenCalledTimes(1);
    // A new session: a click skips.
    on.value = false;
    await flushPromises();
    on.value = true;
    await flushPromises();
    expect(bench.running.value).toBe(true);
    (document.querySelector('.other') as HTMLElement).click();
    expect(bench.phase.value).toBe('done');
    document.removeEventListener('keydown', page);
  });
});
