/*
 * The test bench of the back face in the Konami mode (revision 11, spec 4.12): the autorouter, then
 * the test of the eleven parts of the bill of materials. Pure: the state of the sequence at a time
 * from its start, the times it changes at, the order the traces are drawn in. The play of it is a
 * chunk of its own (bench/run.ts); the final state is shown without it (reduced motion, a later turn).
 */

/** The copper fades out, then the traces are drawn one by one; DRC 0 ERR; the copper is back. */
export const FADE_MS = 400;
export const ROUTE_MS = 3800;
export const DRC_AT = FADE_MS + ROUTE_MS + 200;
export const CLEAR_AT = DRC_AT + 400;
/** Then each row is tested in turn, a third of a second each, and passes; the LEDs chase meanwhile. */
export const TEST_AT = CLEAR_AT + 200;
export const ROW_MS = 330;
export const PASS_AFTER = 230;
/** The LEDs D2–D5 chase one step in 350 ms: under 3 flashes a second (WCAG 2.3.1). */
export const LED_MS = 350;
const STAMP_GAP = 200;
const DONE_GAP = 400;

export interface Bench {
  /** The copper of the art is faded out, the gold of the autorouter over it. */
  routing: boolean;
  /** Traces drawn so far, out of the n of the board. */
  routed: number;
  /** The design rules check has run: DRC 0 ERR. */
  drc: boolean;
  /** Rows whose test has started, rows that passed (the first ones, in the order of the table). */
  tested: number;
  passed: number;
  /** The LED of D2–D5 lit by the chase, or -1. */
  led: number;
  /** The QC PASS stamp is printed. */
  stamp: boolean;
  /** The sequence is over: the final state. */
  done: boolean;
}

const stampAt = (rows: number): number => TEST_AT + rows * ROW_MS + STAMP_GAP;
/** The length of the whole sequence, for `rows` rows. */
export const benchLength = (rows: number): number => stampAt(rows) + DONE_GAP;

/** The state of the sequence `t` ms after its start, for `n` traces and `rows` rows; past its end, the final state. */
export function benchAt(t: number, n: number, rows: number): Bench {
  const row = (at: number): number => Math.max(0, Math.min(rows, Math.floor((t - at) / ROW_MS) + 1));
  const stamp = t >= stampAt(rows);
  return {
    routing: t < CLEAR_AT,
    routed: t < FADE_MS ? 0 : Math.min(n, Math.floor(((t - FADE_MS) * n) / ROUTE_MS) + 1),
    drc: t >= DRC_AT,
    tested: t < TEST_AT ? 0 : row(TEST_AT),
    passed: t < TEST_AT + PASS_AFTER ? 0 : row(TEST_AT + PASS_AFTER),
    led: t >= TEST_AT && !stamp ? Math.floor((t - TEST_AT) / LED_MS) % 4 : -1,
    stamp,
    done: t >= benchLength(rows),
  };
}

/** The final state: every trace routed, every row passed, the stamp printed. */
export const benchFinal = (n: number, rows: number): Bench => benchAt(Infinity, n, rows);

/** Every time the state changes, from 0 to the end, in order: a timer for each, nothing between. */
export function benchTimes(n: number, rows: number): number[] {
  const times = [0, DRC_AT, CLEAR_AT, stampAt(rows), benchLength(rows)];
  for (let i = 0; i < n; i++) times.push(FADE_MS + Math.ceil((i * ROUTE_MS) / n));
  for (let i = 0; i < rows; i++) times.push(TEST_AT + i * ROW_MS, TEST_AT + i * ROW_MS + PASS_AFTER);
  for (let t = TEST_AT; t < stampAt(rows); t += LED_MS) times.push(t);
  return [...new Set(times)].sort((a, b) => a - b);
}

/** The points of a path of the art (M, L, H and V only, absolute). */
export function pathPoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args = ''] of d.matchAll(/([MLHV])([^MLHV]*)/g)) {
    const v = args.trim().split(/[\s,]+/).map(Number);
    if (cmd === 'H') x = v[0] ?? x;
    else if (cmd === 'V') y = v[0] ?? y;
    else [x, y] = [v[0] ?? x, v[1] ?? y];
    out.push([x, y]);
  }
  return out;
}

/**
 * The order the autorouter draws the traces in, as a router would: the power first (the widest
 * traces), then the fan-out of the microcontroller, from the traces nearest to its centre outwards.
 */
export function routeOrder(traces: { w: number; d: string }[], centre: [number, number]): number[] {
  const near = traces.map((t) => Math.min(...pathPoints(t.d).map(([x, y]) => Math.hypot(x - centre[0], y - centre[1]))));
  return traces.map((_, i) => i).sort((a, b) => (traces[b]?.w ?? 0) - (traces[a]?.w ?? 0) || (near[a] ?? 0) - (near[b] ?? 0) || a - b);
}
