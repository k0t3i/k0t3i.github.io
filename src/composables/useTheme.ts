import { nextTick, onBeforeUnmount, onMounted, readonly, ref, type Ref } from 'vue';
import { resolveTheme, THEME_KEY, type Theme } from '../lib/theme';
import { useReducedMotion } from './useReducedMotion';

const DARK = '(prefers-color-scheme: dark)';

function savedChoice(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

/**
 * The board shown, and the switch of JP1. The page attribute is set before the first paint by the
 * head script (lib/theme.ts); this composable only reads the result once mounted ('green' on the
 * server), then sets the attribute and saves the choice on each toggle.
 */
export function useTheme(): { theme: Readonly<Ref<Theme>>; toggle(): void } {
  const theme = ref<Theme>('green');
  const reduced = useReducedMotion();
  let scheme: MediaQueryList | undefined;

  // Without a choice, the CSS follows the device scheme: the state of JP1 follows it too.
  const followScheme = (event: MediaQueryListEvent): void => {
    if (!document.documentElement.dataset.theme) theme.value = event.matches ? 'dark' : 'green';
  };

  onMounted(() => {
    scheme = matchMedia(DARK);
    theme.value = resolveTheme({ saved: savedChoice(), prefersDark: scheme.matches });
    scheme.addEventListener('change', followScheme);
  });
  onBeforeUnmount(() => scheme?.removeEventListener('change', followScheme));

  // The board the last click asked for, until it is applied: a view transition applies it later,
  // so a second quick click must start from it, not from the board still shown.
  let pending: Theme | null = null;

  function apply(next: Theme): void {
    document.documentElement.dataset.theme = next;
    theme.value = next;
    if (pending === next) pending = null;
  }

  function toggle(): void {
    const next: Theme = (pending ?? theme.value) === 'dark' ? 'green' : 'dark';
    pending = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be blocked: the board still switches, for this page.
    }
    if (reduced.value || !('startViewTransition' in document)) {
      apply(next);
      return;
    }
    // A short cross-fade of the whole board; the new state includes JP1 redrawn by Vue.
    document.startViewTransition(async () => {
      apply(next);
      await nextTick();
    });
  }

  return { theme: readonly(theme), toggle };
}
