import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import { useReducedMotion } from './useReducedMotion';

/** A mouse (or a pen): the glow is a lamp over the mat, never under a finger. */
const QUERY = '(hover: hover) and (pointer: fine)';

/** The cell of the grid of the mat (base.css): the glow moves on it, so its dots fall on the mat's. */
export const GLOW_PITCH = 12;

const snap = (v: number): number => Math.round(v / GLOW_PITCH) * GLOW_PITCH;

/**
 * The glow of the page (revision 8): a soft light under a mouse, over the mat, that brings its dots
 * out, like a lamp over a workbench. Client only. The point of the pointer is written as --glow-x
 * and --glow-y with the CSSOM (as useTilt does, the CSP allows it), on the glow element only: the
 * two properties are registered as not inherited (base.css), so a frame restyles that element
 * alone; it moves by a transform (motion.css). Once a frame at most, on the grid of the mat: the
 * glow carries its own lit dots, which then fall on those of the mat. data-on while the pointer is
 * over the window; it fades out when the pointer leaves the window, or the window its focus.
 * Never with a finger, without a mouse, or under reduced motion.
 */
export function useGlow(target: Ref<HTMLElement | null>): void {
  const reduced = useReducedMotion();
  let media: MediaQueryList | undefined;
  let frame = 0;
  let x = 0;
  let y = 0;

  const active = (): boolean => Boolean(media?.matches) && !reduced.value;

  function paint(): void {
    frame = 0;
    const el = target.value;
    if (!el) return;
    el.style.setProperty('--glow-x', `${x}px`);
    el.style.setProperty('--glow-y', `${y}px`);
    el.dataset.on = '';
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerType === 'touch' || !active()) return;
    x = snap(event.clientX);
    y = snap(event.clientY);
    frame ||= requestAnimationFrame(paint);
  }

  /** The lamp goes out where it is: it fades there (motion.css). */
  function off(): void {
    cancelAnimationFrame(frame);
    frame = 0;
    if (target.value) delete target.value.dataset.on;
  }

  // Leaving the window: a pointerout towards nothing.
  const onOut = (event: PointerEvent): void => {
    if (!event.relatedTarget) off();
  };

  const onMedia = (): void => {
    if (!active()) off();
  };

  onMounted(() => {
    media = matchMedia(QUERY);
    media.addEventListener('change', onMedia);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    window.addEventListener('blur', off);
  });

  watch(reduced, onMedia);

  onBeforeUnmount(() => {
    media?.removeEventListener('change', onMedia);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerout', onOut);
    window.removeEventListener('blur', off);
    off();
  });
}
