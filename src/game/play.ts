import { GAME_WORDS } from '../content/readouts';
import { codeKey, gesture, type Dir } from '../lib/konami';
import { layoutText, pixelPath, textWidth, type Pixel } from '../lib/pixelFont';
import { newRoutage, seeded, step, stepMs, turn, type Cell, type Routage } from '../lib/routage';
import { sheetOpen } from '../lib/sheet';

/*
 * The play of « Routage » on DISP1 (revision 8): a chunk of its own, loaded when the code of the
 * easter egg is typed (useGame.ts). It runs the game of lib/routage.ts on the 64 x 64 pixel screen:
 * its title, the game, its pauses, the end of a game. Its own look: a copper trace two pixels wide
 * through the centres of its cells, the signal at its head, a via to reach, the frame of the screen.
 */

/** A part of what DISP1 draws, each one a path of its own, coloured by its class (board.css, retro.css). */
export type GamePart = 'frame' | 'trace' | 'head' | 'pad' | 'word' | 'score' | 'key' | 'glass' | 'pause';
export type GameView = { part: GamePart; d: string }[];

export interface GameHost {
  /** The glass of DISP1: its swipes steer, a tap plays. */
  el: HTMLElement | null;
  draw(view: GameView): void;
  /** A game is over, `pads` connected. */
  over(pads: number): void;
  /** A game starts. */
  playing(): void;
  /** The seed of the pads (the unit tests); else the time. */
  seed?: number;
}

/** A key of the test keypad (TestKeypad.vue): an arrow, B or A. */
export type PadKey = Dir | 'b' | 'a';

/** The running game: called, it stops for good; press() is a key of the test keypad. */
export type Game = (() => void) & { press(key: PadKey): void };

const rect = (x: number, y: number, w: number, h: number): Pixel[] =>
  Array.from({ length: w * h }, (_, i) => ({ x: x + (i % w), y: y + Math.floor(i / w) }));
/** The outline of a box. */
const box = (x: number, y: number, w: number, h: number): Pixel[] => [...rect(x, y, w, 1), ...rect(x, y + h - 1, w, 1), ...rect(x, y, 1, h), ...rect(x + w - 1, y, 1, h)];
const centred = (text: string, scale: 1 | 2): number => Math.floor((64 - textWidth(text, scale)) / 2);
const words = (text: string, scale: 1 | 2, y: number): string => pixelPath(layoutText(text, scale), centred(text, scale), y);

const FRAME = pixelPath(box(0, 0, 64, 64));
/** The key that plays, in its key cap, from the top at y. */
const keyCap = (y: number): { part: GamePart; d: string } => ({
  part: 'key',
  d: pixelPath([...box(26, y, 11, 11), ...layoutText(GAME_WORDS.key, 1).map((p) => ({ x: p.x + 29, y: p.y + y + 2 }))]),
});
/** Paused: two bars on a patch of glass, in the middle of the field. */
const PAUSED: GameView = [
  { part: 'glass', d: pixelPath(rect(26, 25, 11, 13)) },
  { part: 'pause', d: pixelPath([...rect(28, 28, 2, 7), ...rect(33, 28, 2, 7)]) },
];

/** The top left pixel of a cell of the field: 15 x 15 cells of 4 px, inside the frame. */
const at = (c: Cell): Pixel => ({ x: 2 + 4 * c.x, y: 2 + 4 * c.y });

/** The trace: two pixels wide, from the centre of each cell to the next. */
function traceOf(cells: Cell[]): string {
  const px: Pixel[] = [];
  for (let i = 1; i < cells.length; i++) {
    const a = at(cells[i - 1] as Cell);
    const b = at(cells[i] as Cell);
    px.push(...rect(Math.min(a.x, b.x) + 1, Math.min(a.y, b.y) + 1, Math.abs(a.x - b.x) + 2, Math.abs(a.y - b.y) + 2));
  }
  return pixelPath(px);
}

/** A cell of the field, its pixels kept by where they are in it (0 to 3 across and down). */
const cell = (c: Cell, keep: (dx: number, dy: number) => boolean): string =>
  pixelPath(rect(at(c).x, at(c).y, 4, 4).filter((p) => keep(p.x - at(c).x, p.y - at(c).y)));
/** The signal: its cell lit but the corners. The via: a ring around its drill. */
const head = (c: Cell): string => cell(c, (dx, dy) => dx % 3 !== 0 || dy % 3 !== 0);
const via = (c: Cell): string => cell(c, (dx, dy) => dx % 3 === 0 || dy % 3 === 0);

/**
 * Runs the game on DISP1 until the returned stop(). On its title, A (or a tap of the screen, or A of
 * the keypad: press()) plays;
 * the arrows (or swipes on the screen) steer, and only while a game runs are they kept from
 * scrolling the page; B pauses and goes on; a hidden tab or a window that loses the focus pauses
 * too, and so does a sheet opened over the board until it closes. At the end of a game, A or a tap
 * plays again. Each change is drawn once: nothing blinks. While a sheet is open, the game takes no
 * key, tap or press at all: none plays it, goes on with it or steers it under the sheet, even with
 * the focus outside the sheet; a tap that began over an open sheet (and closed it) is no tap.
 */
export function play(host: GameHost): Game {
  const rand = seeded(host.seed ?? Date.now());
  let state: 'title' | 'play' | 'pause' | 'over' = 'title';
  let game: Routage | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let from: { x: number; y: number } | null = null;
  let moved = false;

  function view(): GameView {
    const out: GameView = [{ part: 'frame', d: FRAME }];
    if (state === 'title' || !game) return [...out, { part: 'word', d: words(GAME_WORDS.title, 2, 12) }, keyCap(38)];
    if (state === 'over') return [...out, { part: 'word', d: words(GAME_WORDS.over, 1, 10) }, { part: 'score', d: words(String(game.score), 2, 22) }, keyCap(42)];
    out.push({ part: 'trace', d: traceOf(game.trace) });
    if (game.pad) out.push({ part: 'pad', d: via(game.pad) });
    out.push({ part: 'head', d: head(game.trace[0] as Cell) });
    return state === 'pause' ? [...out, ...PAUSED] : out;
  }

  const draw = (): void => host.draw(view());

  function schedule(): void {
    clearTimeout(timer);
    timer = game ? setTimeout(tick, stepMs(game.score)) : undefined;
  }

  function tick(): void {
    timer = undefined;
    if (!game || state !== 'play') return;
    if (step(game) === 'over') {
      state = 'over';
      host.over(game.score);
    } else schedule();
    draw();
  }

  function begin(): void {
    game = newRoutage(rand);
    state = 'play';
    host.playing();
    schedule();
    draw();
  }

  function pause(): void {
    if (state !== 'play') return;
    clearTimeout(timer);
    timer = undefined;
    state = 'pause';
    draw();
  }

  function resume(): void {
    if (state !== 'pause') return;
    state = 'play';
    schedule();
    draw();
  }

  /** A key of the game, typed or pressed on the keypad: an arrow turns, A plays, B pauses or goes on. */
  function input(key: PadKey): void {
    if (key === 'a') {
      if (state === 'title' || state === 'over') begin();
    } else if (key === 'b') {
      if (state === 'play') pause();
      else resume();
    } else if (state === 'play' && game) turn(game, key);
  }

  // A key typed in a sheet is the sheet's: it scrolls it, it never steers the game under it.
  const onKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey || (event.target as Element | null)?.closest?.('.sheet') || sheetOpen()) return;
    const key = codeKey(event.key);
    if (key === 'up' || key === 'down' || key === 'left' || key === 'right') {
      if (state !== 'play' || !game) return;
      event.preventDefault();
      if (!event.repeat) input(key);
    } else if (!event.repeat && (key === 'a' || key === 'b')) input(key);
  };

  // One finger: each swipe turns, from where the last one turned; a tap plays, or goes on.
  const onStart = (event: TouchEvent): void => {
    const t = event.touches.length === 1 ? event.touches[0] : undefined;
    from = t && !sheetOpen() ? { x: t.clientX, y: t.clientY } : null;
    moved = false;
  };
  const onMove = (event: TouchEvent): void => {
    const t = event.touches[0];
    if (!from || !t) return;
    const dir = gesture(t.clientX - from.x, t.clientY - from.y);
    if (dir === 'tap') return;
    moved = true;
    if (dir && state === 'play' && game) {
      turn(game, dir);
      from = { x: t.clientX, y: t.clientY };
    }
  };
  const onEnd = (event: TouchEvent): void => {
    const t = event.changedTouches[0];
    const tap = from && t && !moved && gesture(t.clientX - from.x, t.clientY - from.y) === 'tap';
    from = null;
    if (!tap || sheetOpen()) return;
    if (state === 'title' || state === 'over') begin();
    else resume();
  };
  const onHide = (): void => {
    if (document.visibilityState === 'hidden') pause();
  };
  // A sheet open over the board pauses the game, the sheet closed lets it go on (unless B paused it).
  // The toggle of a popover does not bubble: it is caught on its way down.
  let bySheet = false;
  const onSheet = (event: Event): void => {
    if (!(event.target as Element | null)?.closest?.('.sheet')) return;
    if ((event as ToggleEvent).newState === 'open') {
      bySheet ||= state === 'play';
      pause();
    } else if (bySheet) {
      bySheet = false;
      resume();
    }
  };

  const el = host.el;
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHide);
  document.addEventListener('toggle', onSheet, { capture: true });
  window.addEventListener('blur', pause);
  el?.addEventListener('touchstart', onStart, { passive: true });
  el?.addEventListener('touchmove', onMove, { passive: true });
  el?.addEventListener('touchend', onEnd, { passive: true });
  draw();

  let stopped = false;
  const stop = (): void => {
    stopped = true;
    clearTimeout(timer);
    timer = undefined;
    game = null;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    document.removeEventListener('toggle', onSheet, { capture: true });
    window.removeEventListener('blur', pause);
    el?.removeEventListener('touchstart', onStart);
    el?.removeEventListener('touchmove', onMove);
    el?.removeEventListener('touchend', onEnd);
  };
  // The keypad has no listener of its own here: its presses come through useGame, as long as the game runs.
  return Object.assign(stop, {
    press: (key: PadKey): void => {
      if (!stopped && !sheetOpen()) input(key);
    },
  });
}
