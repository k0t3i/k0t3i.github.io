import type { Dir } from './konami';

export type { Dir };

/**
 * « Routage », the mini-game of DISP1 (revision 8, an idea of its own): the player steers a signal
 * whose path leaves a copper trace behind it. A pad (a via) comes on a free cell; reaching it
 * connects it and the trace grows. The edge of the screen or the trace itself ends the game. Pure
 * and deterministic (a seeded random source): the play of game/play.ts runs it, the tests too.
 */

/** The field: 15 x 15 cells of 4 x 4 pixels on the 64 x 64 screen. */
export const COLS = 15;
export const ROWS = 15;
/** Cells the trace grows by for each pad connected. */
export const GROWTH = 2;
/** Milliseconds a step: slow at first, a little faster for each pad, never faster than MIN_MS. */
export const MAX_MS = 240;
export const MIN_MS = 110;
const FASTER_MS = 10;

export interface Cell {
  x: number;
  y: number;
}

export interface Routage {
  /** The cells of the trace, its head (the signal) first. */
  trace: Cell[];
  /** Where the last step went. */
  dir: Dir;
  /** The turns asked for since, two at most, each one from the one before. */
  turns: Dir[];
  /** The pad to connect (null once no cell is free). */
  pad: Cell | null;
  /** The pads connected. */
  score: number;
  /** Cells the trace still has to grow by. */
  grow: number;
  over: boolean;
  rand: () => number;
}

/** A random source in [0, 1), the same sequence for the same seed (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOVE: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const BACK: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

/** A free cell for the next pad, drawn from the free cells: never on the trace; null when none is left. */
function placePad(g: Routage): Cell | null {
  const free: Cell[] = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!g.trace.some((c) => c.x === x && c.y === y)) free.push({ x, y });
  return free[Math.floor(g.rand() * free.length)] ?? null;
}

/** A new game: a short trace in the middle of the left side, heading right, and its first pad. */
export function newRoutage(rand: () => number): Routage {
  const g: Routage = {
    trace: [
      { x: 3, y: 7 },
      { x: 2, y: 7 },
      { x: 1, y: 7 },
    ],
    dir: 'right',
    turns: [],
    pad: null,
    score: 0,
    grow: 0,
    over: false,
    rand,
  };
  g.pad = placePad(g);
  return g;
}

/** A turn asked for: kept for the next step unless it goes straight on or back onto the trace. */
export function turn(g: Routage, d: Dir): void {
  const from = g.turns.at(-1) ?? g.dir;
  if (g.turns.length < 2 && d !== from && d !== BACK[from]) g.turns.push(d);
}

/** One step of the signal: it moves on, or connects a pad, or the game is over. */
export function step(g: Routage): 'moved' | 'connected' | 'over' {
  if (g.over) return 'over';
  g.dir = g.turns.shift() ?? g.dir;
  const head = g.trace[0] as Cell;
  const next = { x: head.x + MOVE[g.dir].x, y: head.y + MOVE[g.dir].y };
  // The tail leaves its cell in this step unless the trace is growing: the head may take it.
  const body = g.grow > 0 ? g.trace : g.trace.slice(0, -1);
  if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS || body.some((c) => same(c, next))) {
    g.over = true;
    return 'over';
  }
  g.trace.unshift(next);
  const connected = g.pad !== null && same(g.pad, next);
  if (connected) {
    g.score++;
    g.grow += GROWTH;
  }
  if (g.grow > 0) g.grow--;
  else g.trace.pop();
  if (connected) g.pad = placePad(g);
  return connected ? 'connected' : 'moved';
}

/** The time of a step for a score: slow at first, faster for each pad, capped. */
export function stepMs(score: number): number {
  return Math.max(MIN_MS, MAX_MS - FASTER_MS * score);
}
