import { computed, inject, provide, shallowRef, type InjectionKey, type Ref } from 'vue';

/**
 * The Konami mode of the board (revisions 8 and 11), as the back face sees it: on or not, and a way
 * to end it. The mode itself is DISP1's (useDisplay, useGame), on the front face; it lives on while
 * the board is turned (revision 11), so the back plays its test bench in it and offers a way out.
 * BoardPage provides it, useDisplay attaches the game mode to it, BoardBack reads it.
 */
export interface Mode {
  on: Readonly<Ref<boolean>>;
  quit(): void;
  attach(mode: { on: Readonly<Ref<boolean>>; quit(): void }): void;
}

const MODE: InjectionKey<Mode> = Symbol('mode');

export function provideMode(): Mode {
  const target = shallowRef<{ on: Readonly<Ref<boolean>>; quit(): void } | null>(null);
  const mode: Mode = {
    on: computed(() => target.value?.on.value ?? false),
    quit: () => target.value?.quit(),
    attach: (m) => (target.value = m),
  };
  provide(MODE, mode);
  return mode;
}

/** The mode of the board this component is on, or null outside one. */
export const useMode = (): Mode | null => inject(MODE, null);
