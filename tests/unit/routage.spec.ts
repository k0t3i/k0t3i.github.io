// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { COLS, GROWTH, MAX_MS, MIN_MS, ROWS, newRoutage, seeded, step, stepMs, turn, type Cell, type Dir, type Routage } from '../../src/lib/routage';

const at = (c: Cell): string => `${c.x},${c.y}`;
const trace = (g: Routage): string[] => g.trace.map(at);
const onTrace = (g: Routage, c: Cell): boolean => g.trace.some((t) => t.x === c.x && t.y === c.y);

/** A game from a seed, its pad moved out of the way (the far corner) unless a test places it. */
function game(seed = 1): Routage {
  const g = newRoutage(seeded(seed));
  g.pad = { x: COLS - 1, y: 0 };
  return g;
}

describe('Routage, the game of DISP1', () => {
  it('starts with a short trace in the middle of the left side, heading right, and a pad on a free cell', () => {
    const g = newRoutage(seeded(7));
    expect(trace(g)).toEqual(['3,7', '2,7', '1,7']);
    expect(g.dir).toBe('right');
    expect([g.score, g.over]).toEqual([0, false]);
    expect(g.pad).not.toBeNull();
    if (!g.pad) return;
    expect(onTrace(g, g.pad)).toBe(false);
    expect(g.pad.x >= 0 && g.pad.x < COLS && g.pad.y >= 0 && g.pad.y < ROWS).toBe(true);
    // A field of whole cells on the 64 x 64 screen.
    expect([COLS, ROWS]).toEqual([15, 15]);
  });

  it('moves one cell a step, its head first, the trace following', () => {
    const g = game();
    expect(step(g)).toBe('moved');
    expect(trace(g)).toEqual(['4,7', '3,7', '2,7']);
    turn(g, 'down');
    step(g);
    expect(trace(g)).toEqual(['4,8', '4,7', '3,7']);
    turn(g, 'left');
    step(g);
    expect(trace(g)).toEqual(['3,8', '4,8', '4,7']);
  });

  it('never turns back onto itself: a half turn is ignored', () => {
    const g = game();
    turn(g, 'left');
    step(g);
    expect(trace(g)[0]).toBe('4,7');
    expect(g.dir).toBe('right');
    // Two quick turns between two steps: the second one is taken from the first, so up then left is
    // a turn up, then a turn left; right then left would be a half turn, ignored.
    turn(g, 'up');
    turn(g, 'left');
    step(g);
    expect(trace(g)[0]).toBe('4,6');
    step(g);
    expect(trace(g)[0]).toBe('3,6');
    expect(g.dir).toBe('left');
    turn(g, 'right');
    turn(g, 'right');
    step(g);
    expect(trace(g)[0]).toBe('2,6');
  });

  it('keeps two turns at most: a third one, asked before the next step, is dropped', () => {
    const g = game();
    for (const d of ['up', 'left', 'down'] as Dir[]) turn(g, d);
    step(g);
    step(g);
    step(g);
    // Up, left, then on to the left: the turn down was dropped.
    expect(trace(g)[0]).toBe('1,6');
  });

  it('connects a pad: one more pad, the trace grows, and a new pad comes on a free cell', () => {
    const g = game(3);
    g.pad = { x: 4, y: 7 };
    expect(step(g)).toBe('connected');
    expect(g.score).toBe(1);
    expect(g.pad).not.toBeNull();
    if (g.pad) expect(onTrace(g, g.pad)).toBe(false);
    g.pad = { x: COLS - 1, y: 0 };
    // It grows by GROWTH (2) cells, one a step from the pad on: the tail waits, then follows again.
    expect(GROWTH).toBe(2);
    const lengths = [g.trace.length];
    for (let i = 0; i < 4; i++) {
      step(g);
      lengths.push(g.trace.length);
    }
    expect(lengths).toEqual([4, 5, 5, 5, 5]);
  });

  it('ends on the edge of the screen', () => {
    for (const [dir, steps] of [
      ['right', COLS - 3],
      ['up', 8],
      ['down', ROWS - 7],
    ] as [Dir, number][]) {
      const g = game();
      turn(g, dir);
      const results = Array.from({ length: steps }, () => step(g));
      expect(results.slice(0, -1).every((r) => r === 'moved'), dir).toBe(true);
      expect(results.at(-1), dir).toBe('over');
      expect(g.over).toBe(true);
      // Once over, it never moves again.
      const before = trace(g);
      expect(step(g)).toBe('over');
      expect(trace(g)).toEqual(before);
    }
  });

  it('ends on its own trace, but may follow its tail into the cell the tail leaves', () => {
    const g = game();
    // A trace of 6: three pads' worth of growth, then a tight square: right, down, left, up into it.
    g.trace = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
      { x: 2, y: 5 },
      { x: 1, y: 5 },
    ];
    for (const d of ['down', 'left'] as Dir[]) {
      turn(g, d);
      step(g);
    }
    turn(g, 'up');
    expect(step(g)).toBe('over');

    // A loop of four: the head goes where the tail was, which has just moved on.
    const h = game();
    h.trace = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 4, y: 6 },
      { x: 4, y: 5 },
    ];
    h.dir = 'up';
    turn(h, 'left');
    expect(step(h)).toBe('moved');
    expect(trace(h)).toEqual(['4,5', '5,5', '5,6', '4,6']);
  });

  it('never puts a pad on the trace, over many games played at random', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = newRoutage(seeded(seed));
      const pick = seeded(seed * 31 + 7);
      for (let i = 0; i < 400 && !g.over; i++) {
        if (pick() < 0.3) turn(g, (['up', 'down', 'left', 'right'] as Dir[])[Math.floor(pick() * 4)] ?? 'up');
        // Steer to the pad now and then, so games grow long.
        if (g.pad && pick() < 0.5) {
          const head = g.trace[0] as Cell;
          turn(g, g.pad.x > head.x ? 'right' : g.pad.x < head.x ? 'left' : g.pad.y > head.y ? 'down' : 'up');
        }
        step(g);
        if (g.pad) expect(onTrace(g, g.pad), `seed ${seed}, step ${i}`).toBe(false);
      }
    }
  });

  it('is the same game for the same seed', () => {
    /** The pads a greedy player connects, in order. */
    const pads = (seed: number): string[] => {
      const g = newRoutage(seeded(seed));
      const out: string[] = [];
      for (let i = 0; i < 400 && !g.over && g.pad && out.length < 5; i++) {
        const head = g.trace[0] as Cell;
        const p: Cell = g.pad;
        // The safe move that brings it closest to the pad.
        const moves = (['up', 'down', 'left', 'right'] as Dir[])
          .map((d) => {
            const n = { x: head.x + (d === 'right' ? 1 : d === 'left' ? -1 : 0), y: head.y + (d === 'down' ? 1 : d === 'up' ? -1 : 0) };
            const safe = n.x >= 0 && n.x < COLS && n.y >= 0 && n.y < ROWS && !onTrace(g, n);
            return { d, safe, far: Math.abs(n.x - p.x) + Math.abs(n.y - p.y) };
          })
          .filter((m) => m.safe)
          .sort((a, b) => a.far - b.far);
        if (moves[0]) turn(g, moves[0].d);
        if (step(g) === 'connected') out.push(at(p));
      }
      return out;
    };
    expect(pads(42).length).toBeGreaterThan(1);
    expect(pads(42)).toEqual(pads(42));
    expect(pads(42)).not.toEqual(pads(43));
    // The random source: in [0, 1), the same sequence for the same seed.
    const a = seeded(9);
    const b = seeded(9);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('goes slow at first, a little faster with each pad, never faster than its cap', () => {
    expect(stepMs(0)).toBe(MAX_MS);
    for (let n = 1; n < 40; n++) expect(stepMs(n)).toBeLessThanOrEqual(stepMs(n - 1));
    expect(stepMs(1)).toBeLessThan(stepMs(0));
    expect(stepMs(100)).toBe(MIN_MS);
    expect(Math.min(...Array.from({ length: 200 }, (_, n) => stepMs(n)))).toBe(MIN_MS);
    // Playable: about 4 cells a second at first, never more than 10.
    expect(MAX_MS).toBeGreaterThanOrEqual(200);
    expect(MIN_MS).toBeGreaterThanOrEqual(100);
  });

  it('counts the pads connected: the score', () => {
    const g = game();
    for (let i = 0; i < 3; i++) {
      const head = g.trace[0] as Cell;
      g.pad = { x: head.x + 1, y: head.y };
      expect(step(g)).toBe('connected');
    }
    expect(g.score).toBe(3);
  });
});
