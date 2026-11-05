import { describe, expect, it } from 'vitest';
import { CLEAR_AT, FADE_MS, LED_MS, ROUTE_MS, TEST_AT, benchAt, benchFinal, benchLength, benchTimes, pathPoints, routeOrder } from '../../src/lib/bench';

/*
 * The sequence of the back face in the Konami mode (revision 11, spec 4.12): the autorouter, about
 * 5 s, then the bench, about 4 s; its order, its timing, its LEDs, and its final state (a skip).
 */
const N = 152;
const ROWS = 11;

describe('the test bench of the back face', () => {
  it('takes about 5 s to route and 4 s to test, under 10 s in all', () => {
    expect(CLEAR_AT).toBeGreaterThanOrEqual(4500);
    expect(CLEAR_AT).toBeLessThanOrEqual(5200);
    expect(benchLength(ROWS) - TEST_AT).toBeGreaterThanOrEqual(3500);
    expect(benchLength(ROWS) - TEST_AT).toBeLessThanOrEqual(4500);
    expect(benchLength(ROWS)).toBeLessThanOrEqual(10_000);
  });

  it('starts with the copper faded out, nothing routed, nothing tested', () => {
    expect(benchAt(0, N, ROWS)).toEqual({ routing: true, routed: 0, drc: false, tested: 0, passed: 0, led: -1, stamp: false, done: false });
  });

  it('draws the traces one by one, all of them, then runs the design rules check, then gives the copper back', () => {
    const times = benchTimes(N, ROWS);
    let last = 0;
    for (const t of times) {
      const s = benchAt(t, N, ROWS);
      expect(s.routed - last, `at ${t} ms`).toBeGreaterThanOrEqual(0);
      expect(s.routed - last, `at ${t} ms`).toBeLessThanOrEqual(1);
      last = s.routed;
    }
    expect(benchAt(FADE_MS + ROUTE_MS, N, ROWS).routed).toBe(N);
    expect(benchAt(FADE_MS + ROUTE_MS, N, ROWS).drc).toBe(false);
    const drc = times.find((t) => benchAt(t, N, ROWS).drc) ?? 0;
    expect(benchAt(drc, N, ROWS).routed).toBe(N);
    expect(benchAt(drc, N, ROWS).routing).toBe(true);
    expect(benchAt(CLEAR_AT, N, ROWS).routing).toBe(false);
    // No row is tested while the board is being routed.
    expect(benchAt(CLEAR_AT, N, ROWS).tested).toBe(0);
  });

  it('tests the rows in the order of the table, one at a time, each passing before the next starts', () => {
    let tested = 0;
    for (const t of benchTimes(N, ROWS)) {
      const s = benchAt(t, N, ROWS);
      expect(s.passed).toBeLessThanOrEqual(s.tested);
      expect(s.tested - s.passed).toBeLessThanOrEqual(1);
      expect(s.tested - tested).toBeLessThanOrEqual(1);
      tested = s.tested;
    }
    expect(tested).toBe(ROWS);
  });

  it('chases the LEDs D2 to D5 during the test only, never more than 3 changes a second', () => {
    const changes: number[] = [];
    let led = -1;
    for (let t = 0; t <= benchLength(ROWS); t += 10) {
      const s = benchAt(t, N, ROWS);
      if (s.led !== led) changes.push(t);
      if (t < TEST_AT || s.stamp) expect(s.led, `at ${t} ms`).toBe(-1);
      else expect([0, 1, 2, 3]).toContain(s.led);
      led = s.led;
    }
    for (const t of changes) expect(changes.filter((u) => u >= t && u < t + 1000).length, `from ${t} ms`).toBeLessThanOrEqual(3);
    expect(LED_MS).toBeGreaterThanOrEqual(334);
  });

  it('ends on every row passed and the stamp: the final state, the same as a skip', () => {
    const end = benchAt(benchLength(ROWS), N, ROWS);
    expect(end).toEqual({ routing: false, routed: N, drc: true, tested: ROWS, passed: ROWS, led: -1, stamp: true, done: true });
    expect(benchFinal(N, ROWS)).toEqual(end);
    expect(benchAt(benchLength(ROWS) - 1, N, ROWS).done).toBe(false);
    expect(benchAt(benchLength(ROWS) - 1, N, ROWS).stamp).toBe(true);
  });

  it('changes only at the times it gives, in order', () => {
    const times = benchTimes(N, ROWS);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(benchLength(ROWS));
    for (let i = 1; i < times.length; i++) {
      const [a, b] = [times[i - 1] ?? 0, times[i] ?? 0];
      if (b - a > 2) expect(benchAt(b - 1, N, ROWS), `between ${a} and ${b} ms`).toEqual(benchAt(a, N, ROWS));
    }
  });
});

describe('the order of the autorouter', () => {
  it('reads the points of a path of the art', () => {
    expect(pathPoints('M555 266V296')).toEqual([
      [555, 266],
      [555, 296],
    ]);
    expect(pathPoints('M602 403L596 397H575')).toEqual([
      [602, 403],
      [596, 397],
      [575, 397],
    ]);
  });

  it('routes the power first, the widest traces, then the fan-out of U10 from its centre outwards', () => {
    const traces = [
      { w: 2, d: 'M500 500H520' },
      { w: 4, d: 'M100 100H120' },
      { w: 2, d: 'M410 400H420' },
      { w: 3, d: 'M700 700V720' },
      { w: 2, d: 'M600 600V650' },
    ];
    expect(routeOrder(traces, [400, 400])).toEqual([1, 3, 2, 0, 4]);
  });
});
