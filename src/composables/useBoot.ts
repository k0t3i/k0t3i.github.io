import { onBeforeUnmount, onMounted, readonly, ref, watch, type Ref } from 'vue';
import { BOOT_KEY, BOOT_MS } from '../lib/boot';
import { useReducedMotion } from './useReducedMotion';

/** Whether the board has powered on in this session; a blocked storage counts as yes (no boot). */
function bootedBefore(): boolean {
  try {
    return sessionStorage.getItem(BOOT_KEY) !== null;
  } catch {
    return true;
  }
}

/**
 * The power-on of the board, once per session: for BOOT_MS after the app has mounted, `booting` is
 * true (BoardPage reflects it in data-booting, motion.css draws it: a gold sweep along the traces,
 * LED1 coming on, the screen of DISP1 lit last). Then the session key is set.
 *
 * It plays only when the head script has put the board in standby before the first paint
 * (data-boot on <html>, lib/boot.ts), so it never hides what was already drawn: no standby means no
 * head script (the dev server), a session that has booted, reduced motion, or an app that mounted
 * after the standby gave up. The power-on takes the standby over, in the same frame.
 * Never with reduced motion, nor in a tab in the background (it would play unseen: the board is then
 * at rest, and a later page of the session may still power on). A switch to reduced motion, or a
 * sheet opened, during the boot ends it at once; so does end(), called when the visitor points at a
 * part (BoardPage): the board is on, and the current runs to that part.
 * Client only: `booting` is false on the server and in the first client render (hydration).
 */
export function useBoot(): { booting: Readonly<Ref<boolean>>; end(): void } {
  const reduced = useReducedMotion();
  const booting = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  // A sheet opened during the boot ends it: the visitor acts, the decor gets out of the way (and an
  // anchored sheet is placed once the board is still: WebKit misplaced it over the running sweep).
  // beforetoggle does not bubble: it is caught on its way down, before the sheet is laid out.
  const onToggle = (event: Event): void => {
    if ((event as ToggleEvent).newState === 'open') finish();
  };

  function finish(): void {
    clearTimeout(timer);
    timer = undefined;
    document.removeEventListener('beforetoggle', onToggle, { capture: true });
    if (!booting.value) return;
    booting.value = false;
    try {
      sessionStorage.setItem(BOOT_KEY, '1');
    } catch {
      // Storage can be blocked: the next page simply finds no standby to take over.
    }
  }

  // Registered after the one of useReducedMotion: `reduced` is the device setting by now.
  onMounted(() => {
    const root = document.documentElement;
    const standby = root.hasAttribute('data-boot');
    delete root.dataset.boot;
    if (!standby || reduced.value || document.visibilityState === 'hidden' || bootedBefore()) return;
    booting.value = true;
    timer = setTimeout(finish, BOOT_MS);
    document.addEventListener('beforetoggle', onToggle, { capture: true });
  });

  watch(reduced, (now) => {
    if (now) finish();
  });

  // Seen, if only in part: a later page of the session does not play it again.
  onBeforeUnmount(finish);

  return { booting: readonly(booting), end: finish };
}
