import { onBeforeUnmount, onMounted } from 'vue';
import { codeDetector, codeKey, gesture, type CodeKey } from '../lib/konami';
import { sheetOpen } from '../lib/sheet';

export interface Konami {
  /** A step of the code from the test keypad (TestKeypad.vue, revision 10): the same detector as the keys and the swipes. */
  press(key: CodeKey): void;
}

/**
 * Listens for the code of the easter egg (revision 8, lib/konami.ts): typed on the keyboard
 * anywhere on the page, on either face (revision 11), or swiped then tapped where `area(target)`
 * says a touch is a step of it (DISP1 on the front, the circuit on the back: useDisplay). Never a
 * preventDefault, never a key taken from the page: the touch listeners are passive, so the page
 * still scrolls there. A held key, a shortcut (Ctrl, Alt, Meta) are no step of it.
 * While a sheet is open (lib/sheet.ts) no key, swipe or press is a step of the code: the sheet takes
 * them, and nothing starts or ends under it (the review of Task 18).
 * The keys of the test keypad come through press(), into the same detector. Client only.
 */
export function useKonami(onCode: () => void, opts: { area: (target: Element) => boolean }): Konami {
  const detect = codeDetector();
  let from: { x: number; y: number } | null = null;

  const step = (key: CodeKey | null | undefined): void => {
    if (key !== undefined && !sheetOpen() && detect(key)) onCode();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (!event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) step(codeKey(event.key));
  };

  const onStart = (event: TouchEvent): void => {
    const t = event.touches.length === 1 ? event.touches[0] : undefined;
    from = t && event.target instanceof Element && opts.area(event.target) ? { x: t.clientX, y: t.clientY } : null;
  };

  const onEnd = (event: TouchEvent): void => {
    const t = event.changedTouches[0];
    const start = from;
    from = null;
    const g = start && t && event.target instanceof Element && opts.area(event.target) ? gesture(t.clientX - start.x, t.clientY - start.y) : null;
    // Between a tap and a swipe: no step at all.
    if (g) step(g);
  };

  const onCancel = (): void => {
    from = null;
  };

  onMounted(() => {
    document.addEventListener('keydown', onKey);
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
  });

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('touchstart', onStart);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onCancel);
  });

  return { press: (key) => step(key) };
}
