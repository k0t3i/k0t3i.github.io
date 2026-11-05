import { computed, inject, onBeforeUnmount, provide, readonly, ref, shallowRef, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import { BOM_REFS } from '../circuit/bom';
import LIVE from '../circuit/live.json';
import { benchAt, benchFinal, type Bench } from '../lib/bench';
import { FLIP } from './useFlip';
import { useMode } from './useMode';
import { useReducedMotion } from './useReducedMotion';

/** The state of a row on the bench: being tested, passed, or neither. */
export type RowTest = 'run' | 'pass' | undefined;

export interface BenchView {
  /** The phase of the sequence (data-bench of the face), or undefined outside the Konami mode. */
  phase: ComputedRef<'route' | 'test' | 'done' | undefined>;
  /** It is playing: the parts take no pointer, a click or a key skips to its end. */
  running: Readonly<Ref<boolean>>;
  /** The traces routed so far, and whether the design rules check has run (the counter). */
  routed: ComputedRef<number | null>;
  drc: ComputedRef<boolean>;
  /** The stamp is printed. */
  stamp: ComputedRef<boolean>;
  /** The state of each row, in the order of the table: one computed each, so a row redraws only when it changes. */
  rows: ComputedRef<RowTest>[];
  /** What is said politely: as it starts, as it ends; empty otherwise. */
  said: Readonly<Ref<string>>;
  /** The traces of the back, as its autorouter counts them. */
  total: number;
}

const BENCH: InjectionKey<BenchView> = Symbol('bench');
const ROWS = BOM_REFS.length;
const TOTAL = LIVE.bench.traces;
/** A live region just drawn (the face was inert) is given its text a moment later, so it is read. */
const SAY_MS = 150;

/** The views of a state: a computed for each thing the page draws, each changing only when it does. */
function views(state: Readonly<Ref<Bench | null>>): Omit<BenchView, 'running' | 'said' | 'total'> {
  return {
    phase: computed(() => {
      const s = state.value;
      if (!s) return undefined;
      return s.done ? 'done' : s.routing ? 'route' : 'test';
    }),
    routed: computed(() => state.value?.routed ?? null),
    drc: computed(() => state.value?.drc ?? false),
    stamp: computed(() => state.value?.stamp ?? false),
    rows: BOM_REFS.map((_, i) =>
      computed((): RowTest => {
        const s = state.value;
        if (!s) return undefined;
        return i < s.passed ? 'pass' : i < s.tested ? 'run' : undefined;
      }),
    ),
  };
}

/** Resolves once the board is no longer turning (useFlip: data-turning), at once if it is not; `cancel` stops the wait. */
function turned(board: Element | null | undefined): { done: Promise<void>; cancel(): void } {
  let cancel = (): void => {};
  const done = new Promise<void>((resolve) => {
    if (!board?.hasAttribute('data-turning')) return resolve();
    const watcher = new MutationObserver(() => {
      if (board.hasAttribute('data-turning')) return;
      watcher.disconnect();
      resolve();
    });
    watcher.observe(board, { attributes: true, attributeFilter: ['data-turning'] });
    cancel = () => watcher.disconnect();
  });
  return { done, cancel: () => cancel() };
}

/**
 * The test bench of the back face in the Konami mode (revision 11, spec 4.12). The first time the
 * back face is up in a session of the mode (the board turned in it, or the code typed on the back),
 * it plays its sequence once the board has turned: the autorouter, then the test of the eleven rows
 * (lib/bench.ts, played by bench/run.ts, a chunk of its own, fetched only then). Later turns, and
 * reduced motion, show its final state at once. A click (a tap, never a scroll) or any key skips to
 * the end, but a click of SW2, which turns the board; an Escape that skips goes no further (the next
 * one ends the mode, useDisplay). Turning to the front stops it, unsaid: its end waits for the next
 * turn, or, if it had not started yet, it plays then. The end of the mode clears it. Every timer,
 * observer and listener goes with it. BoardBack provides it to the circuit and the table. Client
 * only: the prerender shows none of it.
 */
export function provideBench(texts: () => { start: string; end: string }, face: Ref<HTMLElement | null>): BenchView {
  const mode = useMode();
  const flip = inject(FLIP, null);
  const reduced = useReducedMotion();
  const state = shallowRef<Bench | null>(null);
  const running = ref(false);
  const said = ref('');
  /** The sequence has played (its first tick) in this session of the mode. */
  let played = false;
  let stop: (() => void) | undefined;
  let wait: { cancel(): void } | undefined;
  let saying: ReturnType<typeof setTimeout> | undefined;
  /** The run now playing: a chunk that loads for an earlier one never plays. */
  let round = 0;

  function say(text: string): void {
    clearTimeout(saying);
    said.value = '';
    saying = text ? setTimeout(() => (said.value = text), SAY_MS) : undefined;
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') event.stopImmediatePropagation();
    finish(true);
  };
  // A click only: a finger that scrolls the page clicks nothing. SW2 turns the board (the silent stop).
  const onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element && event.target.closest('.sw2'))) finish(true);
  };

  function halt(): void {
    round++;
    wait?.cancel();
    wait = undefined;
    stop?.();
    stop = undefined;
    running.value = false;
    document.removeEventListener('keydown', onKey, { capture: true });
    document.removeEventListener('click', onClick, { capture: true });
  }

  /** The final state, said if asked. */
  function finish(announce: boolean): void {
    halt();
    played = true;
    state.value = benchFinal(TOTAL, ROWS);
    if (announce) say(texts().end);
  }

  function begin(): void {
    if (played || reduced.value) {
      // Reduced motion: no sequence, its end at once, said the first time.
      finish(!played);
      return;
    }
    const mine = ++round;
    running.value = true;
    state.value = benchAt(0, TOTAL, ROWS);
    say(texts().start);
    document.addEventListener('keydown', onKey, { capture: true });
    document.addEventListener('click', onClick, { capture: true });
    const board = face.value?.closest('.board');
    const turn = turned(board);
    wait = turn;
    Promise.all([import('../bench/run'), turn.done])
      .then(([{ run }]) => {
        if (mine !== round) return;
        wait = undefined;
        const circuit = face.value?.querySelector<HTMLElement>('.back__circuit') ?? null;
        const img = circuit?.querySelector('img');
        const [x = 0, y = 0, w = 0, h = 0] = LIVE.parts.find((p) => p.ref === 'U10')?.box ?? [];
        stop = run({
          circuit,
          art: img?.currentSrc || img?.src || '',
          total: TOTAL,
          rows: ROWS,
          centre: [x + w / 2, y + h / 2],
          leds: LIVE.bench.leds as [number, number][],
          set: (s) => {
            played = true;
            state.value = s;
          },
          done: () => finish(true),
        });
      })
      .catch(() => {
        if (mine === round) finish(true);
      });
  }

  /** The mode is over: nothing left of the bench. */
  function clear(): void {
    halt();
    clearTimeout(saying);
    saying = undefined;
    said.value = '';
    state.value = null;
    played = false;
  }

  watch(
    () => [mode?.on.value ?? false, flip?.flipped.value ?? false] as const,
    ([on, back]) => {
      if (!on) clear();
      else if (back) begin();
      else if (running.value) {
        // Turned to the front during the sequence: unsaid. Started, its end waits for the next turn;
        // not yet started (a quick turn and back), it plays then.
        if (played) finish(false);
        else {
          halt();
          state.value = null;
        }
        say('');
      }
    },
  );
  onBeforeUnmount(clear);

  const view: BenchView = { ...views(state), running: readonly(running), said: readonly(said), total: TOTAL };
  provide(BENCH, view);
  return view;
}

/** The bench of the back face this component is on; outside one, a bench that never plays. */
export const useBench = (): BenchView => inject(BENCH, () => ({ ...views(ref(null)), running: ref(false), said: ref(''), total: TOTAL }), true);
