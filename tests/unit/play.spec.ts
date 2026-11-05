import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { play, type Game, type GameView } from '../../src/game/play';
import { COLS, newRoutage, ROWS, seeded, step, stepMs, turn, type Cell, type Dir, type Routage } from '../../src/lib/routage';
import { layoutText, textWidth } from '../../src/lib/pixelFont';
import { GAME_WORDS } from '../helpers/copy';
import { notes, padHz } from '../../src/game/sound';

/*
 * The play of « Routage » on DISP1 (the chunk loaded when the code is typed): its screens, its keys
 * and swipes, its pauses, a whole game. The seed makes the game the same as a mirror game of
 * lib/routage.ts played here with the same turns.
 */

/** A sheet is open over the board (lib/sheet.ts: :popover-open, which happy-dom does not know). */
let sheetIsOpen = false;
vi.mock('../../src/lib/sheet', () => ({ sheetOpen: () => sheetIsOpen }));

const SEED = 5;
let el: HTMLElement;
let view: GameView = [];
let draws = 0;
let overs: number[] = [];
let starts = 0;
let stop: Game = Object.assign(() => {}, { press: () => {}, hold: () => {}, sound: () => {} });

/** The lit pixels of a path of squares, as "x,y". */
function pixels(d = ''): Set<string> {
  const out = new Set<string>();
  for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < Number(w); i++) out.add(`${Number(x) + i},${y}`);
  return out;
}
const part = (name: string): Set<string> => pixels(view.find((l) => l.part === name)?.d);
const parts = (): string[] => view.map((l) => l.part);
/** A word as drawn: its pixels from its top left corner. */
function shape(set: Set<string>): string[] {
  const xy = [...set].map((p) => p.split(',').map(Number) as [number, number]);
  const x0 = Math.min(...xy.map(([x]) => x));
  const y0 = Math.min(...xy.map(([, y]) => y));
  return xy.map(([x, y]) => `${x - x0},${y - y0}`).sort();
}
const word = (text: string, scale: 1 | 2): string[] => shape(new Set(layoutText(text, scale).map((p) => `${p.x},${p.y}`)));
const left = (set: Set<string>): number => Math.min(...[...set].map((p) => Number(p.split(',')[0])));
const top = (set: Set<string>): number => Math.min(...[...set].map((p) => Number(p.split(',')[1])));
/** The cell of the field under a pixel: cells of 4 px from (2, 2). */
const cellAt = (set: Set<string>): Cell => ({ x: Math.floor((left(set) - 2) / 4), y: Math.floor((top(set) - 2) / 4) });

const key = (k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(e);
  return e;
};
const ARROW: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const touch = (type: string, x: number, y: number): void => {
  const t = { identifier: 1, target: el, clientX: x, clientY: y } as unknown as Touch;
  el.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
};

beforeEach(() => {
  vi.useFakeTimers();
  el = document.createElement('div');
  document.body.append(el);
  view = [];
  draws = 0;
  overs = [];
  starts = 0;
  stop = play({
    el,
    seed: SEED,
    draw: (v) => {
      view = v;
      draws++;
    },
    over: (n) => overs.push(n),
    playing: () => starts++,
  });
});

afterEach(() => {
  stop();
  sheetIsOpen = false;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the play of Routage', () => {
  it('opens on its title: ROUTE, and the key A to play, in a frame', () => {
    expect(parts().sort()).toEqual(['frame', 'key', 'word']);
    const title = part('word');
    expect(shape(title)).toEqual(word(GAME_WORDS.title, 2));
    // Centred, and inside the screen.
    expect(left(title)).toBe(Math.floor((64 - textWidth(GAME_WORDS.title, 2)) / 2));
    expect([...part('key')].length).toBeGreaterThan(word(GAME_WORDS.key, 1).length);
    for (const p of [...part('frame'), ...title, ...part('key')]) {
      const [x = -1, y = -1] = p.split(',').map(Number);
      expect(x >= 0 && x < 64 && y >= 0 && y < 64, p).toBe(true);
    }
    // Nothing runs before A: no step, no redraw.
    const before = draws;
    vi.advanceTimersByTime(5000);
    expect(draws).toBe(before);
    expect(starts).toBe(0);
  });

  it('A plays: the trace, its signal and a pad on the field; the signal steps on by itself', () => {
    key('a');
    expect(starts).toBe(1);
    expect(parts().sort()).toEqual(['frame', 'head', 'pad', 'trace']);
    const mirror = newRoutage(seeded(SEED));
    expect(cellAt(part('head'))).toEqual(mirror.trace[0]);
    expect(cellAt(part('pad'))).toEqual(mirror.pad);
    vi.advanceTimersByTime(stepMs(0));
    expect(cellAt(part('head'))).toEqual({ x: 4, y: 7 });
    // The trace: a line two pixels wide through the centres of its cells, under the signal.
    const trace = part('trace');
    expect(trace.has(`${2 + 4 * 2 + 1},${2 + 4 * 7 + 1}`)).toBe(true);
    expect(trace.has(`${2 + 4 * 2 + 3},${2 + 4 * 7 + 1}`)).toBe(true);
    expect(trace.has(`${2 + 4 * 2 + 1},${2 + 4 * 7 + 3}`)).toBe(false);
  });

  it('the arrows steer while it runs, and only then are kept from scrolling the page', () => {
    // On the title: an arrow is the page's.
    expect(key('ArrowDown').defaultPrevented).toBe(false);
    key('A');
    const up = key('ArrowUp');
    expect(up.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(stepMs(0));
    expect(cellAt(part('head'))).toEqual({ x: 3, y: 6 });
    // A held arrow repeats: kept from scrolling too.
    expect(key('ArrowUp', { repeat: true }).defaultPrevented).toBe(true);
    // A shortcut is the browser's: not taken, and no turn.
    expect(key('ArrowLeft', { altKey: true }).defaultPrevented).toBe(false);
    expect(key('ArrowLeft', { ctrlKey: true }).defaultPrevented).toBe(false);
    vi.advanceTimersByTime(stepMs(0));
    expect(cellAt(part('head'))).toEqual({ x: 3, y: 5 });
    // Other keys are left alone.
    expect(key(' ').defaultPrevented).toBe(false);
    expect(key('Tab').defaultPrevented).toBe(false);
  });

  it('B pauses and goes on; so does a hidden tab or a window that loses the focus, until B', () => {
    key('a');
    key('b');
    expect(parts()).toContain('pause');
    const head = cellAt(part('head'));
    vi.advanceTimersByTime(stepMs(0) * 5);
    expect(cellAt(part('head'))).toEqual(head);
    // Paused, the arrows are the page's again.
    expect(key('ArrowUp').defaultPrevented).toBe(false);
    key('B');
    expect(parts()).not.toContain('pause');
    vi.advanceTimersByTime(stepMs(0));
    expect(cellAt(part('head'))).toEqual({ x: head.x + 1, y: head.y });

    window.dispatchEvent(new Event('blur'));
    expect(parts()).toContain('pause');
    vi.advanceTimersByTime(stepMs(0) * 3);
    expect(cellAt(part('head'))).toEqual({ x: head.x + 1, y: head.y });
    key('b');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(parts()).toContain('pause');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(parts()).toContain('pause');
    key('b');
    expect(parts()).not.toContain('pause');
  });

  it('a sheet open over the board pauses it and keeps its keys; closed, the game goes on, unless B paused it', () => {
    key('a');
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const link = document.createElement('a');
    sheet.append(link);
    document.body.append(sheet);
    const toggle = (state: 'open' | 'closed') => sheet.dispatchEvent(Object.assign(new Event('toggle'), { newState: state }));
    toggle('open');
    expect(parts()).toContain('pause');
    const head = cellAt(part('head'));
    vi.advanceTimersByTime(stepMs(0) * 4);
    expect(cellAt(part('head'))).toEqual(head);
    // A key in the sheet is the sheet's: it scrolls it, it steers nothing, B and A do nothing.
    const fromSheet = (k: string) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      link.dispatchEvent(e);
      return e;
    };
    expect(fromSheet('ArrowDown').defaultPrevented).toBe(false);
    fromSheet('b');
    expect(parts()).toContain('pause');
    toggle('closed');
    expect(parts()).not.toContain('pause');
    vi.advanceTimersByTime(stepMs(0));
    expect(cellAt(part('head'))).toEqual({ x: head.x + 1, y: head.y });
    // Paused with B, it stays paused after a sheet.
    key('b');
    toggle('open');
    toggle('closed');
    expect(parts()).toContain('pause');
    // Keys from inside a sheet are ignored while it runs too.
    key('b');
    expect(fromSheet('ArrowUp').defaultPrevented).toBe(false);
  });

  it('a sheet open takes every key, tap and press from the game: none plays it, goes on with it or steers it', () => {
    key('a');
    sheetIsOpen = true;
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    document.body.append(sheet);
    sheet.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
    expect(parts()).toContain('pause');
    // B typed, the focus outside the sheet: still paused (the issue left from Task 16).
    key('b');
    expect(parts()).toContain('pause');
    // A tap of DISP1, a press of the keypad: still paused.
    touch('touchstart', 100, 100);
    touch('touchend', 100, 100);
    stop.press('b');
    stop.press('a');
    expect(parts()).toContain('pause');
    // A tap that closes the sheet (a light dismiss, on the lift of the finger) does not go on with the game either:
    // the sheet closed does.
    touch('touchstart', 100, 100);
    sheetIsOpen = false;
    touch('touchend', 100, 100);
    expect(parts()).toContain('pause');
    sheet.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
    expect(parts()).not.toContain('pause');
    // Over a sheet, the end screen does not play again.
    for (let i = 0; i < 40 && overs.length === 0; i++) vi.advanceTimersByTime(stepMs(0));
    expect(overs).toHaveLength(1);
    sheetIsOpen = true;
    key('a');
    stop.press('a');
    touch('touchstart', 100, 100);
    touch('touchend', 100, 100);
    expect(starts).toBe(1);
    sheetIsOpen = false;
    stop.press('a');
    expect(starts).toBe(2);
  });

  it('the keypad presses as the keys do: A plays, the arrows steer, B pauses and goes on', () => {
    // On the title, the arrows and B do nothing.
    stop.press('down');
    stop.press('b');
    expect(starts).toBe(0);
    stop.press('a');
    expect(starts).toBe(1);
    // A again while it runs: no new game.
    stop.press('a');
    expect(starts).toBe(1);
    stop.press('up');
    vi.advanceTimersByTime(stepMs(0));
    expect(cellAt(part('head'))).toEqual({ x: 3, y: 6 });
    stop.press('b');
    expect(parts()).toContain('pause');
    // Paused, an arrow steers nothing.
    stop.press('left');
    vi.advanceTimersByTime(stepMs(0) * 3);
    expect(cellAt(part('head'))).toEqual({ x: 3, y: 6 });
    stop.press('b');
    expect(parts()).not.toContain('pause');
    vi.advanceTimersByTime(stepMs(0));
    expect(cellAt(part('head'))).toEqual({ x: 3, y: 5 });
    // Stopped: a press does nothing.
    stop();
    const before = draws;
    stop.press('b');
    stop.press('a');
    expect(draws).toBe(before);
  });

  it('a whole game: the signal connects the pad, then meets the edge: DRC ERR and the score, A plays again', () => {
    key('a');
    // The same game, played here: each step, the safe move that brings it closest to the pad.
    const mirror: Routage = newRoutage(seeded(SEED));
    const goTo = (target: Cell | null): Dir => {
      const head = mirror.trace[0] as Cell;
      const moves = (['up', 'down', 'left', 'right'] as Dir[])
        .map((d) => {
          const n = { x: head.x + (d === 'right' ? 1 : d === 'left' ? -1 : 0), y: head.y + (d === 'down' ? 1 : d === 'up' ? -1 : 0) };
          const safe = n.x >= 0 && n.x < COLS && n.y >= 0 && n.y < ROWS && !mirror.trace.some((c) => c.x === n.x && c.y === n.y);
          return { d, safe, far: target ? Math.abs(n.x - target.x) + Math.abs(n.y - target.y) : 0 };
        })
        .filter((m) => m.safe && m.d !== { up: 'down', down: 'up', left: 'right', right: 'left' }[mirror.dir])
        .sort((a, b) => a.far - b.far);
      return moves[0]?.d ?? mirror.dir;
    };
    let result = '';
    for (let i = 0; i < 100 && result !== 'connected'; i++) {
      const d = goTo(mirror.pad);
      key(ARROW[d]);
      turn(mirror, d);
      const ms = stepMs(mirror.score);
      result = step(mirror);
      vi.advanceTimersByTime(ms);
      expect(cellAt(part('head')), `step ${i}`).toEqual(mirror.trace[0]);
    }
    expect(result).toBe('connected');
    expect(mirror.score).toBe(1);
    expect(cellAt(part('pad'))).toEqual(mirror.pad);
    // Then straight up into the edge of the screen.
    if (mirror.dir === 'down') {
      key('ArrowLeft');
      turn(mirror, 'left');
      vi.advanceTimersByTime(stepMs(1));
      step(mirror);
    }
    key('ArrowUp');
    for (let i = 0; i < 40 && overs.length === 0; i++) vi.advanceTimersByTime(stepMs(1));
    expect(overs).toEqual([1]);
    expect(parts().sort()).toEqual(['frame', 'key', 'score', 'word']);
    expect(shape(part('word'))).toEqual(word(GAME_WORDS.over, 1));
    expect(shape(part('score'))).toEqual(word('1', 2));
    // A still screen: it redraws once, it never blinks.
    const after = draws;
    vi.advanceTimersByTime(10_000);
    expect(draws).toBe(after);
    // On the end screen the arrows are the page's; A plays again, from a new trace.
    expect(key('ArrowUp').defaultPrevented).toBe(false);
    key('a');
    expect(starts).toBe(2);
    expect(cellAt(part('head'))).toEqual({ x: 3, y: 7 });
  });

  it('by touch: a tap plays, a swipe on the screen steers, a tap on the end screen plays again', () => {
    touch('touchstart', 100, 100);
    touch('touchend', 102, 101);
    expect(starts).toBe(1);
    touch('touchstart', 100, 100);
    touch('touchmove', 101, 60);
    touch('touchend', 101, 60);
    vi.advanceTimersByTime(stepMs(0));
    expect(cellAt(part('head'))).toEqual({ x: 3, y: 6 });
    // One finger keeps steering: from where it last turned.
    touch('touchstart', 100, 100);
    touch('touchmove', 60, 100);
    touch('touchmove', 60, 140);
    touch('touchend', 60, 140);
    vi.advanceTimersByTime(stepMs(0) * 2);
    expect(cellAt(part('head'))).toEqual({ x: 2, y: 7 });
    // A tap while it runs changes nothing.
    touch('touchstart', 100, 100);
    touch('touchend', 100, 100);
    expect(parts()).not.toContain('pause');
    for (let i = 0; i < 40 && overs.length === 0; i++) vi.advanceTimersByTime(stepMs(0));
    expect(overs).toHaveLength(1);
    touch('touchstart', 100, 100);
    touch('touchend', 100, 100);
    expect(starts).toBe(2);
  });

  // Revision 11 (Anthony, 05/11/2026): the board turned to its back keeps the game, held where it was.
  it('held while the back face is up: paused, its timers stopped, no key, tap or press; let go, B or A goes on', () => {
    key('a');
    vi.advanceTimersByTime(stepMs(0) * 2);
    const head = cellAt(part('head'));
    stop.hold(true);
    expect(parts()).toContain('pause');
    expect(vi.getTimerCount()).toBe(0);
    for (const k of ['b', 'a', 'ArrowDown']) expect(key(k).defaultPrevented).toBe(false);
    stop.press('b');
    touch('touchstart', 100, 100);
    touch('touchend', 100, 100);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(stepMs(0) * 5);
    expect(parts()).toContain('pause');
    expect(cellAt(part('head'))).toEqual(head);
    // Let go: still paused, where it was, until B (or A) goes on.
    stop.hold(false);
    expect(parts()).toContain('pause');
    vi.advanceTimersByTime(stepMs(0) * 3);
    expect(cellAt(part('head'))).toEqual(head);
    key('a');
    expect(parts()).not.toContain('pause');
    vi.advanceTimersByTime(stepMs(0));
    expect(cellAt(part('head'))).toEqual({ x: head.x + 1, y: head.y });
  });

  it('held on its title, it stays on its title, and A plays once let go', () => {
    stop.hold(true);
    key('a');
    expect(starts).toBe(0);
    stop.hold(false);
    expect(parts()).toContain('word');
    key('a');
    expect(starts).toBe(1);
  });

  it('stops for good: no timer, no listener, no drawing', () => {
    key('a');
    stop();
    expect(vi.getTimerCount()).toBe(0);
    const before = draws;
    expect(key('ArrowUp').defaultPrevented).toBe(false);
    key('a');
    touch('touchstart', 100, 100);
    touch('touchend', 100, 100);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(5000);
    expect(draws).toBe(before);
    expect(starts).toBe(1);
  });
});

/** A stand-in for AudioContext (Task 20): the contexts made, the pitch of each note started, the calls on its state. */
class Ctx {
  static made: Ctx[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  freqs: number[] = [];
  log: string[] = [];
  constructor() {
    Ctx.made.push(this);
  }
  createGain() {
    return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (n: unknown) => n };
  }
  createOscillator() {
    const freqs = this.freqs;
    const o = { type: '', frequency: { value: 0 }, connect: (n: unknown) => n, start: () => freqs.push(o.frequency.value), stop() {} };
    return o;
  }
  resume() {
    this.log.push('resume');
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.log.push('suspend');
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.log.push('close');
    this.state = 'closed';
    return Promise.resolve();
  }
}
const pitches = (s: Parameters<typeof notes>[0], score?: number): number[] => notes(s, score).map((n) => n.f);

describe('the sound of the game (Task 20)', () => {
  beforeEach(() => {
    Ctx.made = [];
    vi.stubGlobal('AudioContext', Ctx);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const ctx = (): Ctx => Ctx.made[0] as Ctx;

  it('no AudioContext on its title: a game started on A, a tap or the keypad makes it, and plays the jingle', () => {
    key('b');
    key('ArrowUp');
    vi.advanceTimersByTime(5000);
    expect(Ctx.made).toHaveLength(0);
    key('a');
    expect(Ctx.made).toHaveLength(1);
    expect(ctx().freqs).toEqual(pitches('start'));
    stop();
    expect(ctx().log.at(-1)).toBe('close');
    for (const go of [() => stop.press('a'), () => (touch('touchstart', 100, 100), touch('touchend', 100, 100))]) {
      Ctx.made = [];
      stop = play({ el, seed: SEED, draw: () => {}, over: () => {}, playing: () => {} });
      go();
      expect(ctx().freqs).toEqual(pitches('start'));
      stop();
    }
  });

  it('a pad connected bips, higher for each pad; the game over plays its falling phrase, then the context sleeps', () => {
    key('a');
    const mirror: Routage = newRoutage(seeded(SEED));
    const head = (): Cell => mirror.trace[0] as Cell;
    let result = '';
    for (let i = 0; i < 100 && result !== 'connected'; i++) {
      const pad = mirror.pad as Cell;
      const d: Dir = pad.x > head().x && mirror.dir !== 'left' ? 'right' : pad.y > head().y && mirror.dir !== 'up' ? 'down' : pad.y < head().y && mirror.dir !== 'down' ? 'up' : mirror.dir;
      key(ARROW[d]);
      turn(mirror, d);
      const ms = stepMs(mirror.score);
      result = step(mirror);
      vi.advanceTimersByTime(ms);
    }
    expect(result).toBe('connected');
    expect(ctx().freqs).toEqual([...pitches('start'), ...pitches('pad', 1)]);
    expect(ctx().freqs.at(-2)).toBe(padHz(1));
    for (let i = 0; i < 40 && overs.length === 0; i++) vi.advanceTimersByTime(stepMs(1));
    expect(overs).toEqual([1]);
    expect(ctx().freqs.slice(-pitches('over').length)).toEqual(pitches('over'));
    expect(ctx().log).not.toContain('suspend');
    vi.advanceTimersByTime(1000);
    expect(ctx().log).toEqual(['suspend']);
    // A plays again: the same context, woken.
    key('a');
    expect(Ctx.made).toHaveLength(1);
    expect(ctx().log).toEqual(['suspend', 'resume']);
  });

  it('B pauses on a click, then sleeps; B goes on with a click, awake; a hidden tab, a blur, a hold sleep at once', () => {
    key('a');
    const n = ctx().freqs.length;
    key('b');
    expect(ctx().freqs.slice(n)).toEqual(pitches('click'));
    expect(ctx().log).toEqual([]);
    // After the last note (the clock of the stand-in stands still: the jingle is still due).
    vi.advanceTimersByTime(1000);
    expect(ctx().log).toEqual(['suspend']);
    key('b');
    expect(ctx().log).toEqual(['suspend', 'resume']);
    expect(ctx().freqs.slice(n)).toEqual([...pitches('click'), ...pitches('click')]);
    window.dispatchEvent(new Event('blur'));
    expect(ctx().log.at(-1)).toBe('suspend');
    key('b');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect(ctx().log.at(-1)).toBe('suspend');
    key('b');
    stop.hold(true);
    expect(ctx().log.at(-1)).toBe('suspend');
    expect(vi.getTimerCount()).toBe(0);
    stop();
    expect(ctx().log.at(-1)).toBe('close');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('muted: no AudioContext at all; muted in a game, it sleeps at once and stays silent; sound back, it wakes', () => {
    stop();
    stop = play({ el, seed: SEED, draw: () => {}, over: () => {}, playing: () => {}, sound: false });
    key('a');
    key('b');
    key('b');
    expect(Ctx.made).toHaveLength(0);
    stop.sound(true);
    expect(Ctx.made).toHaveLength(1);
    expect(ctx().freqs).toEqual([]);
    key('b');
    stop.sound(false);
    expect(ctx().log.at(-1)).toBe('suspend');
    const n = ctx().freqs.length;
    key('b');
    expect(ctx().freqs.length).toBe(n);
    stop.sound(true);
    expect(ctx().log.at(-1)).toBe('resume');
  });
});
