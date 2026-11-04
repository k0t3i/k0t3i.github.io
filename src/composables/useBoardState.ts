import { computed, inject, provide, ref, type InjectionKey, type Ref } from 'vue';
import type { PartId } from '../content/types';

/** What points at a part: the pointer (hover, touch) or the keyboard focus. */
export type ActiveSource = 'pointer' | 'focus';

/**
 * The live state of the home board, shared by its parts and DISP1:
 * - activePart: the part the current runs to (its trace lit, DISP1 showing its readout), the one
 *   under the pointer, else the one with the keyboard focus, else null;
 * - setActive(id, source): a part is pointed at or focused (id), or no longer (null);
 * - booting: the board is powering on (useBoot.ts);
 * - endBoot(): the visitor acts (a part pointed at, SW1 pressed): the power-on ends at once, so what
 *   the visitor asked for (the current to that part, a screen of DISP1) shows without waiting.
 */
export interface BoardState {
  activePart: Readonly<Ref<PartId | null>>;
  setActive(id: PartId | null, source?: ActiveSource): void;
  booting: Readonly<Ref<boolean>>;
  endBoot(): void;
}

const BOARD_STATE: InjectionKey<BoardState> = Symbol('board-state');

function createBoardState(booting: Readonly<Ref<boolean>>, endBoot: () => void): BoardState {
  // One slot per source, so a pointer passing over the board gives the current back to the part
  // that has the focus when it leaves.
  const pointed = ref<PartId | null>(null);
  const focused = ref<PartId | null>(null);
  return {
    activePart: computed(() => pointed.value ?? focused.value),
    setActive(id, source = 'pointer') {
      (source === 'focus' ? focused : pointed).value = id;
      // A part pointed at during the power-on ends it: its trace takes the current at once and never
      // plays the sweep, so nothing is cut when the boot would have ended.
      if (id) endBoot();
    },
    booting,
    endBoot,
  };
}

/** The state of the board, created by BoardPage for everything on it, with the end of its power-on. */
export function provideBoardState(booting: Readonly<Ref<boolean>>, endBoot: () => void = () => {}): BoardState {
  const state = createBoardState(booting, endBoot);
  provide(BOARD_STATE, state);
  return state;
}

/** The state of the board this component is on; a part outside a board gets a state of its own. */
export function useBoardState(): BoardState {
  return inject(BOARD_STATE, () => createBoardState(ref(false), () => {}), true);
}
