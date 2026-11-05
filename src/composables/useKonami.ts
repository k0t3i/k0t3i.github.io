import { onBeforeUnmount, onMounted, type Ref } from 'vue';
import { codeDetector, codeKey, gesture, type CodeKey } from '../lib/konami';
import { sheetOpen } from '../lib/sheet';

export interface Konami {
  /** A step of the code from the test keypad (TestKeypad.vue, revision 10): the same detector as the keys and the swipes. */
  press(key: CodeKey): void;
}

/**
 * Listens for the code of the easter egg (revision 8, lib/konami.ts): typed on the keyboard
 * anywhere on the page, or swiped then tapped on DISP1 (`screen`). Never a preventDefault, never a
 * key taken from the page: the touch listeners are passive, so the page still scrolls over DISP1.
 * A held key, a shortcut (Ctrl, Alt, Meta) are no step of it.
 * - enabled(): false while the back face is up, where the code does nothing;
 * - touch(): false while the game runs, its swipes and taps then steer it (game/play.ts): the
 *   keyboard still follows the code, so the code typed again ends the game.
 * The keys of the test keypad come through press(), into the same detector, while enabled() too.
 * While a sheet is open (lib/sheet.ts) no key, swipe or press is a step of the code: the sheet takes
 * them, and nothing starts or ends under it (the review of Task 18).
 * Client only.
 */
export function useKonami(screen: Ref<HTMLElement | null>, onCode: () => void, opts: { enabled: () => boolean; touch: () => boolean }): Konami {
  const detect = codeDetector();
  let from: { x: number; y: number } | null = null;
  let el: HTMLElement | null = null;

  const onKey = (event: KeyboardEvent): void => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || !opts.enabled() || sheetOpen()) return;
    const key = codeKey(event.key);
    if (key !== undefined && detect(key)) onCode();
  };

  const onStart = (event: TouchEvent): void => {
    const t = event.touches.length === 1 ? event.touches[0] : undefined;
    from = t ? { x: t.clientX, y: t.clientY } : null;
  };

  const onEnd = (event: TouchEvent): void => {
    const t = event.changedTouches[0];
    const start = from;
    from = null;
    if (!start || !t || !opts.enabled() || !opts.touch() || sheetOpen()) return;
    const step = gesture(t.clientX - start.x, t.clientY - start.y);
    if (step && detect(step)) onCode();
  };

  const onCancel = (): void => {
    from = null;
  };

  onMounted(() => {
    document.addEventListener('keydown', onKey);
    el = screen.value;
    el?.addEventListener('touchstart', onStart, { passive: true });
    el?.addEventListener('touchend', onEnd, { passive: true });
    el?.addEventListener('touchcancel', onCancel, { passive: true });
  });

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey);
    el?.removeEventListener('touchstart', onStart);
    el?.removeEventListener('touchend', onEnd);
    el?.removeEventListener('touchcancel', onCancel);
    el = null;
  });

  return {
    press(key) {
      if (opts.enabled() && !sheetOpen() && detect(key)) onCode();
    },
  };
}
