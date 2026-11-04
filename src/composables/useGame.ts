import { onBeforeUnmount, onMounted, readonly, ref, type Ref } from 'vue';
import type { GameView } from '../game/play';
import { useReducedMotion } from './useReducedMotion';

/** What the game mode says, politely: its rules as it starts, or the end of a game with its score. */
export type GameNews = { kind: 'intro' } | { kind: 'over'; pads: number };

export interface GameMode {
  /** The game mode is on: DISP1 is the game's, the page is in its retro colours. */
  on: Readonly<Ref<boolean>>;
  /** What the game draws on DISP1 (null until it has loaded). */
  view: Readonly<Ref<GameView | null>>;
  /** What is to be said, or null. */
  news: Readonly<Ref<GameNews | null>>;
  start(): void;
  /** Ends the game mode; `fade` cross-fades the colours back (an exit in place: Escape, SW1, the code). */
  quit(fade?: boolean): void;
}

/**
 * The game mode of DISP1 (revision 8), from the code typed to its end. On start: <html> takes
 * data-retro (the old LCD greens of retro.css, set with the DOM API, never in the prerender), the
 * rules are said, and the game « Routage » is loaded (game/play.ts, a chunk of its own: nothing of it
 * is fetched before) and runs on `screen`. quit() stops it, its timers and listeners with it, and
 * gives the page its colours back. The colours change in a short cross-fade of the page where the
 * browser has view transitions and motion is welcome, else at once. Leaving the page ends it, also
 * when the browser keeps the page for its back button (pagehide). Client only.
 */
export function useGame(screen: Ref<HTMLElement | null>): GameMode {
  const reduced = useReducedMotion();
  const on = ref(false);
  const view = ref<GameView | null>(null);
  const news = ref<GameNews | null>(null);
  let stop: (() => void) | undefined;
  /** The game mode now on: a game that loads for an earlier one never starts. */
  let round = 0;

  function retro(set: boolean, fade: boolean): void {
    const apply = (): void => {
      document.documentElement.toggleAttribute('data-retro', set);
    };
    if (fade && !reduced.value && 'startViewTransition' in document) document.startViewTransition(apply);
    else apply();
  }

  function quit(fade = false): void {
    if (!on.value) return;
    round++;
    stop?.();
    stop = undefined;
    on.value = false;
    view.value = null;
    news.value = null;
    retro(false, fade);
  }

  function start(): void {
    if (on.value) return;
    const mine = ++round;
    on.value = true;
    news.value = { kind: 'intro' };
    retro(true, true);
    import('../game/play')
      .then(({ play }) => {
        if (mine !== round) return;
        stop = play({
          el: screen.value,
          draw: (v) => (view.value = v),
          over: (pads) => (news.value = { kind: 'over', pads }),
          playing: () => (news.value = null),
        });
      })
      .catch(() => {
        if (mine === round) quit();
      });
  }

  const leave = (): void => quit();
  onMounted(() => addEventListener('pagehide', leave));
  onBeforeUnmount(() => {
    removeEventListener('pagehide', leave);
    quit();
  });

  return { on: readonly(on), view: readonly(view) as Readonly<Ref<GameView | null>>, news: readonly(news) as Readonly<Ref<GameNews | null>>, start, quit };
}
