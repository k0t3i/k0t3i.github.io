import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import { useReducedMotion } from './useReducedMotion';

/** The wide board, with a mouse (or a pen): the only case where the board leans. */
const QUERY = '(min-width: 79rem) and (hover: hover) and (pointer: fine)';
/** The elements of the board that read the angles (depth.css): its body and its edge. */
const MOVERS = '.board__body, .board__edge';
/** The largest angle on each axis, in degrees. */
const MAX = 4;
/** Share of the way to the target covered in one frame at 60 Hz (the same feel at any refresh rate). */
const EASE = 0.12;
const FRAME = 1000 / 60;
/** Below this gap (degrees) on both axes, the board is where it should be and the loop stops. */
const EPSILON = 0.01;
/** A new target closer than this (degrees, about 19px of pointer travel on the widest board) is ignored: no twitch. */
const DEAD_ZONE = 0.1;

const clamp = (v: number): number => Math.min(1, Math.max(-1, v));

/**
 * The board leans a few degrees towards the mouse, the part under it going away, as if pressed.
 * Client only. The angles are written as --tilt-x and --tilt-y with the CSSOM, which the CSP allows
 * (no style attribute is ever rendered), on the body and the edge of the board only: the two
 * properties are registered as not inherited (depth.css), so a frame restyles those two elements
 * and nothing inside them. They are removed again once the board is flat. While they are set, the
 * target carries data-tilting (depth.css puts the board in 3D then).
 * A requestAnimationFrame loop eases towards the target angle and stops once it is reached; it holds
 * still while the board turns over (data-turning, useFlip), so the turn stays one clean transition.
 * When a sheet opens the board is flat at once, and stays flat while it is open: the sheet is
 * anchored to its part as laid out. A pointer move costs no layout: the box of the board is measured
 * when the pointer enters it, and again after a resize or a scroll.
 */
export function useTilt(target: Ref<HTMLElement | null>): void {
  const reduced = useReducedMotion();
  let media: MediaQueryList | undefined;
  let frame = 0;
  let last = 0;
  const now = { x: 0, y: 0 };
  const goal = { x: 0, y: 0 };
  let bound: HTMLElement | null = null;
  let movers: HTMLElement[] = [];
  let box: DOMRect | null = null;
  let sheet: EventTarget | null = null;

  const active = (): boolean => Boolean(media?.matches) && !reduced.value;

  function write(el: HTMLElement): void {
    el.dataset.tilting = '';
    for (const m of movers) {
      m.style.setProperty('--tilt-x', `${now.x.toFixed(3)}deg`);
      m.style.setProperty('--tilt-y', `${now.y.toFixed(3)}deg`);
    }
  }

  /** Flat again: nothing of the tilt is left on the board. */
  function settle(el: HTMLElement): void {
    delete el.dataset.tilting;
    for (const m of movers) {
      m.style.removeProperty('--tilt-x');
      m.style.removeProperty('--tilt-y');
      if (!m.getAttribute('style')) m.removeAttribute('style');
    }
  }

  function step(time: number): void {
    frame = 0;
    const el = target.value;
    if (!el) return;
    // After a long gap (a hidden tab) the board simply reaches its target.
    const dt = last ? time - last : FRAME;
    last = time;
    // The turn is a transition of the same transform: the tilt waits for its end.
    if (el.hasAttribute('data-turning')) {
      frame = requestAnimationFrame(step);
      return;
    }
    const k = 1 - (1 - EASE) ** (dt / FRAME);
    now.x += (goal.x - now.x) * k;
    now.y += (goal.y - now.y) * k;
    const arrived = Math.abs(goal.x - now.x) < EPSILON && Math.abs(goal.y - now.y) < EPSILON;
    if (arrived) {
      now.x = goal.x;
      now.y = goal.y;
    }
    if (arrived && now.x === 0 && now.y === 0) {
      settle(el);
      last = 0;
      return;
    }
    write(el);
    if (arrived) last = 0;
    else frame = requestAnimationFrame(step);
  }

  function aim(x: number, y: number): void {
    const flat = x === 0 && y === 0;
    if (!flat && Math.abs(x - goal.x) < DEAD_ZONE && Math.abs(y - goal.y) < DEAD_ZONE) return;
    goal.x = x;
    goal.y = y;
    if (!frame && (goal.x !== now.x || goal.y !== now.y)) frame = requestAnimationFrame(step);
  }

  const measure = (): void => {
    box = target.value?.getBoundingClientRect() ?? null;
  };

  // The box changes with the window and the scroll only: the next move measures it again.
  const forget = (): void => {
    box = null;
  };

  function onMove(event: PointerEvent): void {
    if (!target.value || !active() || sheet) return;
    if (!box) measure();
    if (!box || box.width === 0 || box.height === 0) return;
    const nx = clamp((event.clientX - (box.left + box.width / 2)) / (box.width / 2));
    const ny = clamp((event.clientY - (box.top + box.height / 2)) / (box.height / 2));
    // rotateY > 0 sends the right edge away, rotateX > 0 the top edge: the side under the pointer dips.
    aim(-ny * MAX, nx * MAX);
  }

  const onLeave = (): void => aim(0, 0);

  /** Back to flat at once (a sheet opens, the device stops being a wide window with a mouse, less motion). */
  function reset(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    now.x = now.y = goal.x = goal.y = 0;
    if (target.value) settle(target.value);
  }

  // The toggle of a popover does not bubble: it is caught on its way down to the sheet.
  const onToggle = (event: Event): void => {
    if ((event as ToggleEvent).newState === 'open') {
      sheet = event.target;
      reset();
    } else if (event.target === sheet) {
      sheet = null;
    }
  };

  const onMedia = (): void => {
    if (!active()) reset();
  };

  onMounted(() => {
    media = matchMedia(QUERY);
    media.addEventListener('change', onMedia);
    bound = target.value;
    if (!bound) return;
    movers = [...bound.querySelectorAll<HTMLElement>(MOVERS)].filter((m) => m.parentElement === bound);
    bound.addEventListener('pointerenter', measure, { passive: true });
    bound.addEventListener('pointermove', onMove, { passive: true });
    bound.addEventListener('pointerleave', onLeave, { passive: true });
    bound.addEventListener('toggle', onToggle, { capture: true });
    window.addEventListener('resize', forget, { passive: true });
    window.addEventListener('scroll', forget, { passive: true });
  });

  watch(reduced, onMedia);

  onBeforeUnmount(() => {
    media?.removeEventListener('change', onMedia);
    if (bound) {
      bound.removeEventListener('pointerenter', measure);
      bound.removeEventListener('pointermove', onMove);
      bound.removeEventListener('pointerleave', onLeave);
      bound.removeEventListener('toggle', onToggle, { capture: true });
      window.removeEventListener('resize', forget);
      window.removeEventListener('scroll', forget);
    }
    reset();
    bound = null;
    movers = [];
  });
}
