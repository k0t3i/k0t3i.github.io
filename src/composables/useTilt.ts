import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import { useReducedMotion } from './useReducedMotion';

/** A mouse (or a pen), at every width: the board leans under it. Never a finger. */
const QUERY = '(hover: hover) and (pointer: fine)';
/** The elements of the board that read the angles (depth.css): its body and its edge. */
const MOVERS = '.board__body, .board__edge';
/** The largest angle on each axis, in degrees. */
const MAX = 5;
/** Share of the way to the target covered in one frame at 60 Hz (the same feel at any refresh rate). */
const EASE = 0.12;
const FRAME = 1000 / 60;
/** Below this gap (degrees) on both axes, the board is where it should be and the loop stops. */
const EPSILON = 0.01;
/** A new target closer than this (degrees, about 16px of pointer travel on the widest board) is ignored: no twitch. */
const DEAD_ZONE = 0.1;

const clamp = (v: number): number => Math.min(1, Math.max(-1, v));

/** The part of the board in the window: its centre and its half sizes, in the coordinates of the window. */
interface View {
  x: number;
  y: number;
  hw: number;
  hh: number;
}

/**
 * The board leans a few degrees towards the mouse, the part under it going away, as if pressed.
 * Client only. The angles are written as --tilt-x and --tilt-y with the CSSOM, which the CSP allows
 * (no style attribute is ever rendered), on the body and the edge of the board only: the two
 * properties are registered as not inherited (depth.css), so a frame restyles those two elements
 * and nothing inside them. They are removed again once the board is flat. While they are set, the
 * target carries data-tilting (depth.css puts the board in 3D then).
 * The angles follow the pointer within the part of the board in the window: on the flowing board,
 * taller than the window, the board follows the pointer where it is. The middle of that part, from
 * the top of the board, is written as --tilt-oy beside the angles: the flowing board turns about it
 * and is seen from it (depth.css), so no far edge dives.
 * A requestAnimationFrame loop eases towards the target angle and stops once it is reached; it holds
 * still while the board turns over (data-turning, useFlip), so the turn stays one clean transition.
 * When a sheet opens the board is flat at once, and stays flat while it is open: the sheet is
 * anchored to its part as laid out. A pointer move costs no layout: the board is measured when the
 * pointer enters it, and again after a scroll, a resize or a turn (in the next frame, the pointer
 * still: the board follows it from the part now in view).
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
  let view: View | null = null;
  /** The middle of the part in view, from the top of the board; and the one written on the movers. */
  let pivot = '';
  let shown = '';
  /** Where the pointer is, while it is over the board. */
  let pointer: { x: number; y: number } | null = null;
  let sheet: EventTarget | null = null;

  const active = (): boolean => Boolean(media?.matches) && !reduced.value;

  function write(el: HTMLElement): void {
    el.dataset.tilting = '';
    for (const m of movers) {
      m.style.setProperty('--tilt-x', `${now.x.toFixed(3)}deg`);
      m.style.setProperty('--tilt-y', `${now.y.toFixed(3)}deg`);
      if (pivot !== shown) m.style.setProperty('--tilt-oy', pivot);
    }
    shown = pivot;
  }

  /** Flat again: nothing of the tilt is left on the board. */
  function settle(el: HTMLElement): void {
    delete el.dataset.tilting;
    for (const m of movers) {
      for (const p of ['--tilt-x', '--tilt-y', '--tilt-oy']) m.style.removeProperty(p);
      if (!m.getAttribute('style')) m.removeAttribute('style');
    }
    shown = '';
  }

  /** The part of the board in the window, and its middle from the top of the board. */
  function measure(): void {
    view = null;
    const box = target.value?.getBoundingClientRect();
    if (!box) return;
    const top = Math.max(box.top, 0);
    const bottom = Math.min(box.bottom, window.innerHeight);
    const left = Math.max(box.left, 0);
    const right = Math.min(box.right, window.innerWidth);
    if (bottom <= top || right <= left) return;
    view = { x: (left + right) / 2, y: (top + bottom) / 2, hw: (right - left) / 2, hh: (bottom - top) / 2 };
    pivot = `${Math.round(view.y - box.top)}px`;
  }

  /** The angles towards the pointer, from the part in view: rotateY > 0 sends the right edge away, rotateX > 0 the top edge. */
  function toward(p: { x: number; y: number }): [number, number] | null {
    if (!view) measure();
    if (!view) return null;
    const nx = clamp((p.x - view.x) / view.hw);
    const ny = clamp((p.y - view.y) / view.hh);
    return [-ny * MAX, nx * MAX];
  }

  /** Runs the loop if the board is not where it should be. */
  function run(): void {
    if (!frame && (goal.x !== now.x || goal.y !== now.y)) frame = requestAnimationFrame(step);
  }

  function step(time: number): void {
    frame = 0;
    const el = target.value;
    if (!el) return;
    // After a long gap (a hidden tab) the board simply reaches its target.
    const dt = last ? time - last : FRAME;
    last = time;
    // The turn is a transition of the same transform: the tilt waits for its end, then measures the
    // board again (on the flowing board, the face that is up sets its height).
    if (el.hasAttribute('data-turning')) {
      view = null;
      frame = requestAnimationFrame(step);
      return;
    }
    // The window scrolled or changed since: the board turns about the middle of the part now in
    // view, and the pointer is aimed at again from it.
    if (!view) {
      measure();
      const to = pointer && toward(pointer);
      if (to) [goal.x, goal.y] = to;
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
    run();
  }

  function onEnter(event: PointerEvent): void {
    if (event.pointerType !== 'touch') measure();
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerType === 'touch' || !target.value || !active() || sheet) return;
    pointer = { x: event.clientX, y: event.clientY };
    const to = toward(pointer);
    if (to) aim(...to);
  }

  function onLeave(): void {
    pointer = null;
    aim(0, 0);
  }

  // The part in view changes with the window and the scroll only: it is measured again in the next
  // frame, while the board leans (even on its way back to flat) or the pointer is over it, so the
  // board follows the pointer from it even if the pointer does not move.
  function onView(): void {
    view = null;
    if ((shown || pointer) && active() && !sheet && !frame) frame = requestAnimationFrame(step);
  }

  /** Back to flat at once (a sheet opens, the device loses its mouse, less motion). */
  function reset(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    now.x = now.y = goal.x = goal.y = 0;
    pointer = null;
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
    bound.addEventListener('pointerenter', onEnter, { passive: true });
    bound.addEventListener('pointermove', onMove, { passive: true });
    bound.addEventListener('pointerleave', onLeave, { passive: true });
    bound.addEventListener('toggle', onToggle, { capture: true });
    window.addEventListener('resize', onView, { passive: true });
    window.addEventListener('scroll', onView, { passive: true });
  });

  watch(reduced, onMedia);

  onBeforeUnmount(() => {
    media?.removeEventListener('change', onMedia);
    if (bound) {
      bound.removeEventListener('pointerenter', onEnter);
      bound.removeEventListener('pointermove', onMove);
      bound.removeEventListener('pointerleave', onLeave);
      bound.removeEventListener('toggle', onToggle, { capture: true });
      window.removeEventListener('resize', onView);
      window.removeEventListener('scroll', onView);
    }
    reset();
    bound = null;
    movers = [];
  });
}
