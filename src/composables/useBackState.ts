import { computed, inject, provide, readonly, ref, type InjectionKey, type Ref } from 'vue';
import type { BackRef } from '../content/backNets';

/**
 * The live state of the back face, shared by its parts and the rows of its bill of materials:
 * - active: the part that is lit (with its row, its traces and its neighbours, back.css): the one
 *   under the pointer, else the one with the keyboard focus, else the pinned one;
 * - pinned: the part pinned by a tap, a click, Enter or Space (aria-pressed); one at most;
 * - hover(id), focus(id): a part, or a row, is pointed at or focused (id), or no longer (null);
 * - toggle(id): pins a part, moves the pin to it, or unpins it if it was the pinned one.
 */
export interface BackState {
  active: Readonly<Ref<BackRef | null>>;
  pinned: Readonly<Ref<BackRef | null>>;
  hover(id: BackRef | null): void;
  focus(id: BackRef | null): void;
  toggle(id: BackRef): void;
}

const BACK_STATE: InjectionKey<BackState> = Symbol('back-state');

export function createBackState(): BackState {
  // One slot per source: a pointer passing over the face gives the light back to the focus, then
  // to the pinned part, when it leaves.
  const hovered = ref<BackRef | null>(null);
  const focused = ref<BackRef | null>(null);
  const pinned = ref<BackRef | null>(null);
  return {
    active: computed(() => hovered.value ?? focused.value ?? pinned.value),
    pinned: readonly(pinned),
    hover(id) {
      hovered.value = id;
    },
    focus(id) {
      focused.value = id;
    },
    toggle(id) {
      pinned.value = pinned.value === id ? null : id;
    },
  };
}

/** The state of the back face, created by BoardBack for the section (data-active) and its content. */
export function provideBackState(): BackState {
  const state = createBackState();
  provide(BACK_STATE, state);
  return state;
}

/** The state of the back face this component is on; outside one, a state of its own. */
export function useBackState(): BackState {
  return inject(BACK_STATE, createBackState, true);
}
