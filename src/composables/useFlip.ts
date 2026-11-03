import { onBeforeUnmount, onMounted, readonly, ref, type InjectionKey, type Ref } from 'vue';
import { useReducedMotion } from './useReducedMotion';

export interface Flip {
  /** The back face is up, or turning up. */
  flipped: Readonly<Ref<boolean>>;
  /** The app has mounted: the faces are stacked and SW2 works. */
  ready: Readonly<Ref<boolean>>;
  toggle(): void;
}

/** The flip state of the home board, provided by BoardPage to the two SW2 (FlipSwitch.vue). */
export const FLIP: InjectionKey<Flip> = Symbol('flip');

/** The turn takes 600ms (motion.css); without its transitionend, the turn ends a little after. */
const TURN_FALLBACK = 700;

/**
 * SW2: turns the board over to show its back face. The state lives on the board, written here:
 * - data-flip-ready once mounted: the two faces are stacked (before that, and without JavaScript,
 *   the back face follows the front one, flat);
 * - data-flipped while the back face is up; the face that is down is inert;
 * - data-turning during the turn: "prep" puts the board in 3D on the side that is up (nothing moves
 *   on screen), then "run" lets the transform transition to the other side (depth.css, motion.css).
 * Once the turn is over the board is back at rest (no 3D) and the focus moves to the SW2 of the face
 * that is up; at once under reduced motion, where there is no turn. Never remembered: a visit always
 * starts on the front face.
 */
export function useFlip(board: Ref<HTMLElement | null>): Flip {
  const flipped = ref(false);
  const ready = ref(false);
  const reduced = useReducedMotion();
  let body: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** The state on the board: which face is up, and which one is inert. */
  function apply(el: HTMLElement): void {
    el.toggleAttribute('data-flipped', flipped.value);
    el.querySelector('.board__face--front')?.toggleAttribute('inert', flipped.value);
    el.querySelector('.board__face--back')?.toggleAttribute('inert', !flipped.value);
  }

  function focusUp(el: HTMLElement): void {
    el.querySelector<HTMLElement>(`.board__face--${flipped.value ? 'back' : 'front'} .sw2`)?.focus();
  }

  function end(): void {
    clearTimeout(timer);
    timer = undefined;
    const el = board.value;
    if (!el?.hasAttribute('data-turning')) return;
    delete el.dataset.turning;
    focusUp(el);
  }

  // The body turns, and so does the edge: the end of the body's own transform ends the turn.
  const onEnd = (event: Event): void => {
    if (event.target === body && (event as TransitionEvent).propertyName === 'transform') end();
  };

  function toggle(): void {
    const el = board.value;
    if (!ready.value || !el) return;
    flipped.value = !flipped.value;
    if (reduced.value) {
      apply(el);
      focusUp(el);
      return;
    }
    // From rest, the 3D layout is computed before the side changes, so the transition starts from
    // the side that is up. A second press during the turn only reverses it.
    if (el.dataset.turning !== 'run') {
      el.dataset.turning = 'prep';
      if (body) void getComputedStyle(body).transform;
      el.dataset.turning = 'run';
    }
    apply(el);
    clearTimeout(timer);
    timer = setTimeout(end, TURN_FALLBACK);
  }

  onMounted(() => {
    const el = board.value;
    if (!el) return;
    body = el.querySelector<HTMLElement>('.board__body');
    body?.addEventListener('transitionend', onEnd);
    el.dataset.flipReady = '';
    apply(el);
    ready.value = true;
  });

  onBeforeUnmount(() => {
    clearTimeout(timer);
    timer = undefined;
    body?.removeEventListener('transitionend', onEnd);
    body = null;
  });

  return { flipped: readonly(flipped), ready: readonly(ready), toggle };
}
