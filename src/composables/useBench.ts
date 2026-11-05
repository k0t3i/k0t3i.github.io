import { computed, inject, onBeforeUnmount, provide, readonly, ref, shallowRef, watch, type InjectionKey, type Ref } from 'vue';
import { BOM_REFS } from '../circuit/bom';
import LIVE from '../circuit/live.json';
import { benchAt, benchFinal, type Bench } from '../lib/bench';
import { FLIP } from './useFlip';
import { useMode } from './useMode';
import { useReducedMotion } from './useReducedMotion';

export interface BenchView {
  /** The state of the sequence, or null outside the Konami mode. */
  state: Readonly<Ref<Bench | null>>;
  /** It is playing: the parts take no pointer, a click or a key skips to its end. */
  running: Readonly<Ref<boolean>>;
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

/**
 * The test bench of the back face in the Konami mode (revision 11, spec 4.12). The first time the
 * back face is up in a session of the mode (the board turned in it, or the code typed on the back),
 * it plays its sequence: the autorouter, then the test of the eleven rows (lib/bench.ts, played by
 * bench/run.ts, a chunk of its own, fetched only then). Later turns, and reduced motion, show its
 * final state at once. A click, a tap or any key skips to the end; an Escape that skips goes no
 * further (the next one ends the mode, useDisplay). Turning to the front stops it (its final state
 * waits for the next turn); the end of the mode clears it. Every timer and listener goes with it.
 * BoardBack provides it to the circuit and the table. Client only: the prerender shows none of it.
 */
export function provideBench(texts: () => { start: string; end: string }, face: Ref<HTMLElement | null>): BenchView {
  const mode = useMode();
  const flip = inject(FLIP, null);
  const reduced = useReducedMotion();
  const state = shallowRef<Bench | null>(null);
  const running = ref(false);
  const said = ref('');
  let played = false;
  let stop: (() => void) | undefined;
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
  const onPointer = (): void => finish(true);

  function halt(): void {
    round++;
    stop?.();
    stop = undefined;
    running.value = false;
    document.removeEventListener('keydown', onKey, { capture: true });
    document.removeEventListener('pointerdown', onPointer, { capture: true });
  }

  /** The final state, said if asked. */
  function finish(announce: boolean): void {
    halt();
    state.value = benchFinal(TOTAL, ROWS);
    if (announce) say(texts().end);
  }

  function begin(): void {
    if (played || reduced.value) {
      // Reduced motion: no sequence, its end at once, said the first time.
      finish(!played);
      played = true;
      return;
    }
    played = true;
    const mine = ++round;
    running.value = true;
    state.value = benchAt(0, TOTAL, ROWS);
    say(texts().start);
    document.addEventListener('keydown', onKey, { capture: true });
    document.addEventListener('pointerdown', onPointer, { capture: true });
    import('../bench/run')
      .then(({ run }) => {
        if (mine !== round) return;
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
          set: (s) => (state.value = s),
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
        // Turned to the front during the sequence: its end waits for the next turn, unsaid.
        finish(false);
        say('');
      }
    },
  );
  onBeforeUnmount(clear);

  const view: BenchView = { state: readonly(state) as Readonly<Ref<Bench | null>>, running: readonly(running), said: readonly(said), total: TOTAL };
  provide(BENCH, view);
  return view;
}

/** The bench of the back face this component is on. */
export const useBench = (): BenchView => inject(BENCH, { state: computed(() => null), running: computed(() => false), said: computed(() => ''), total: TOTAL });
