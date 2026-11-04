import { computed, inject, onBeforeUnmount, onMounted, readonly, ref, watch, type Ref } from 'vue';
import { MORSE_MESSAGE } from '../content/readouts';
import type { Locale, PartId } from '../content/types';
import { encodeMorse, morseTimeline, MORSE_UNIT_MS } from '../lib/morse';
import { useBoardState } from './useBoardState';
import { FLIP } from './useFlip';
import { useGame, type GameMode } from './useGame';
import { useKonami } from './useKonami';
import { useReducedMotion } from './useReducedMotion';

/** What DISP1 shows. */
export type Screen = 'avatar' | 'boot' | 'readout' | 'uptime' | 'morse' | 'game';

/** The screens SW1 runs through, in this order: the ones its caption names. */
export type ChosenScreen = 'avatar' | 'uptime' | 'morse';

/** A readout stays this long once its part is left: a quick sweep from part to part never shows the screen under it. */
export const READOUT_HOLD_MS = 400;

const NEXT: Record<ChosenScreen, ChosenScreen> = { avatar: 'uptime', uptime: 'morse', morse: 'avatar' };

/** LED1 is dark this long before the message and after it: it rests lit, so the message reads as one. */
const MORSE_GAP_MS = 3 * MORSE_UNIT_MS;

export interface Display {
  /** What DISP1 shows now: the boot while the board powers on, else a readout, else the screen chosen with SW1. */
  screen: Readonly<Ref<Screen>>;
  /** The screen chosen with SW1, the one the caption names: the boot and the readouts only pass over it. */
  chosen: Readonly<Ref<ChosenScreen>>;
  /** The part whose readout is shown (it stays READOUT_HOLD_MS after the part is left), else null. */
  part: Readonly<Ref<PartId | null>>;
  /** SW1: the next screen. Pressed while the Morse code is being sent, it stops it. */
  cycle(): void;
  /** LED1 is on for a dot or a dash of the Morse code. */
  ledOn: Readonly<Ref<boolean>>;
  /** While the Morse code is being sent: the signal being sent (from 0), or -1 between two; null otherwise. */
  sending: Readonly<Ref<number | null>>;
  /** The game mode of the easter egg (revision 8): on, what it draws, what it says. */
  game: Pick<GameMode, 'on' | 'view' | 'news'>;
}

/**
 * The screens of DISP1 (interactions 3 and 4 of the spec). The board state gives the part pointed at
 * and the power-on; `locale` is the language of the page.
 * - The readout of a part shows while it is pointed at (pointer or visible focus), and stays a moment
 *   after it is left.
 * - SW1 runs through the avatar, the uptime and the Morse code: HELLO sent once on LED1 along its
 *   timeline (lib/morse.ts), never in a loop, never more than three flashes a second.
 * - Escape, a language switch, a turn of the board (the front face is then not drawn: nothing may run
 *   unseen) and the unmount clear every timer: LED1 back at rest, DISP1 back on the avatar. Escape
 *   leaves a still screen as it is (it is also what closes a sheet).
 * - SW1 ends the power-on, as a part pointed at does (useBoardState).
 * - Reduced motion: nothing blinks, the Morse code is shown still (and the trace of a readout does not
 *   scroll: motion.css).
 * - The code of the easter egg (revision 8, useKonami: typed, or swiped and tapped on `screen`, the
 *   glass of DISP1) starts the game mode on the front face (useGame): DISP1 is the game's, a part
 *   pointed at no longer shows its readout, the caption names the game. Escape, SW1, the code again,
 *   a turn of the board, a language switch and the unmount end it; DISP1 is then back on the screen
 *   chosen with SW1 (on the avatar after a turn or a switch, as above). The game plays on under
 *   reduced motion: it is what the visitor asked for.
 * Client only: nothing changes before a visitor acts, so the prerender and the hydration show the avatar.
 */
export function useDisplay(locale: () => Locale, screen: Ref<HTMLElement | null> = ref(null)): Display {
  const { activePart, booting, endBoot } = useBoardState();
  const reduced = useReducedMotion();
  const flip = inject(FLIP, null);
  const game = useGame(screen);

  const chosen = ref<ChosenScreen>('avatar');
  const part = ref<PartId | null>(null);
  const sending = ref<number | null>(null);
  let hold: ReturnType<typeof setTimeout> | undefined;
  let key: ReturnType<typeof setTimeout> | undefined;

  // A part pointed at shows its readout at once; left, the readout stays a moment, unless another part
  // is pointed at meanwhile.
  watch(activePart, (id) => {
    clearTimeout(hold);
    hold = undefined;
    if (id) {
      part.value = id;
      return;
    }
    hold = setTimeout(() => {
      hold = undefined;
      part.value = null;
    }, READOUT_HOLD_MS);
  });

  function stopMorse(): void {
    clearTimeout(key);
    key = undefined;
    sending.value = null;
  }

  /** HELLO on LED1, once: dark for a letter gap, the code, dark again, then LED1 is back at rest. */
  function sendMorse(): void {
    stopMorse();
    if (reduced.value) return;
    const steps = [...morseTimeline(encodeMorse(MORSE_MESSAGE), MORSE_UNIT_MS), { on: false, ms: MORSE_GAP_MS }];
    let next = 0;
    let signal = -1;
    // Each step is timed from the end of the one before: a late timer only makes the code slower, never
    // faster, so it never flashes more often than its timeline.
    const run = (): void => {
      const step = steps[next++];
      if (!step) {
        stopMorse();
        return;
      }
      if (step.on) signal++;
      sending.value = step.on ? signal : -1;
      key = setTimeout(run, step.ms);
    };
    sending.value = -1;
    key = setTimeout(run, MORSE_GAP_MS);
  }

  function cycle(): void {
    // SW1 is also a way out of the game: DISP1 then shows the screen it had chosen.
    if (game.on.value) return game.quit(true);
    // The visitor acts: the power-on ends, and the readout of a part left a moment ago goes, so the
    // screen shows what the caption now names (a part still pointed at keeps its readout).
    endBoot();
    if (!activePart.value) {
      clearTimeout(hold);
      hold = undefined;
      part.value = null;
    }
    chosen.value = NEXT[chosen.value];
    if (chosen.value === 'morse') sendMorse();
    else stopMorse();
  }

  /**
   * Every timer cleared: LED1 at rest, the readout of a part left gone. DISP1 goes back on the avatar
   * (or on the readout of a part still pointed at), unless `keepStill`: then a screen that ran nothing,
   * the uptime say, stays.
   */
  function rest(keepStill = false): void {
    const running = sending.value !== null || hold !== undefined;
    stopMorse();
    clearTimeout(hold);
    hold = undefined;
    part.value = activePart.value;
    if (running || !keepStill) chosen.value = 'avatar';
  }

  /** The code of the easter egg: the game mode starts (the visitor acts: the power-on ends, LED1 rests), or ends. */
  function toggleGame(): void {
    if (game.on.value) return game.quit(true);
    endBoot();
    stopMorse();
    game.start();
  }
  useKonami(screen, toggleGame, { enabled: () => !flip?.flipped.value, touch: () => !game.on.value });

  // Escape stops what DISP1 runs, the game first; it also closes sheets, which should not change a
  // still screen (nor have the caption announce it).
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (game.on.value) game.quit(true);
    else rest(true);
  };
  onMounted(() => document.addEventListener('keydown', onKey));
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey);
    stopMorse();
    clearTimeout(hold);
    hold = undefined;
  });

  watch(locale, () => {
    game.quit();
    rest();
  });
  watch(reduced, (now) => {
    if (now) stopMorse();
  });
  if (flip)
    watch(flip.flipped, (back) => {
      if (!back) return;
      game.quit();
      rest();
    });

  return {
    screen: computed(() => (game.on.value ? 'game' : booting.value ? 'boot' : part.value ? 'readout' : chosen.value)),
    chosen: readonly(chosen),
    part: readonly(part),
    cycle,
    ledOn: computed(() => (sending.value ?? -1) >= 0),
    sending: readonly(sending),
    game,
  };
}
