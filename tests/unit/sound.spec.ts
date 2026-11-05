import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAIN, length, notes, padHz, PAD_HZ, PAD_STEPS, synth, type Sfx } from '../../src/game/sound';

/*
 * The bleeps of « Routage » (Task 20): what each event plays (pure: notes and lengths), and the synth
 * that plays them on an AudioContext, mocked here: made only when woken, its master volume, its
 * envelopes from silence to silence, suspended after its last note or at once, closed for good.
 */

const ALL: Sfx[] = ['start', 'pad', 'over', 'click'];

describe('the notes of each event', () => {
  it('each sound lasts 1 s at most, its notes short, audible and in order', () => {
    for (const s of ALL) {
      const n = notes(s, 3);
      expect(n.length).toBeGreaterThan(0);
      expect(length(s)).toBeLessThanOrEqual(1);
      expect(length(s)).toBe(Math.max(...n.map((x) => x.at + x.d)));
      for (const x of n) {
        expect(x.d).toBeGreaterThan(0.01);
        expect(x.f).toBeGreaterThan(100);
        expect(x.f).toBeLessThan(4000);
        expect(x.v).toBeGreaterThan(0);
        expect(x.v).toBeLessThanOrEqual(1);
      }
      expect(n.map((x) => x.at)).toEqual([...n.map((x) => x.at)].sort((a, b) => a - b));
    }
  });

  it('a game starts on a jingle of three rising notes', () => {
    const f = notes('start').map((n) => n.f);
    expect(f).toHaveLength(3);
    expect(f[0]).toBeLessThan(f[1] as number);
    expect(f[1]).toBeLessThan(f[2] as number);
  });

  it('a pad connected: a rising bip, a step higher for each pad, capped', () => {
    const [a, b] = notes('pad', 1);
    expect((b as { f: number }).f).toBeGreaterThan((a as { f: number }).f);
    expect(padHz(1)).toBe(PAD_HZ);
    for (let s = 1; s <= PAD_STEPS; s++) expect(padHz(s + 1) / padHz(s)).toBeCloseTo(2 ** (1 / 12), 6);
    expect(padHz(PAD_STEPS + 1)).toBeCloseTo(PAD_HZ * 2, 6);
    expect(padHz(PAD_STEPS + 9)).toBe(padHz(PAD_STEPS + 1));
    expect(padHz(0)).toBe(PAD_HZ);
    expect(notes('pad', 4)[0]?.f).toBe(padHz(4));
  });

  it('the game over falls, its last note the longest', () => {
    const n = notes('over');
    for (let i = 1; i < n.length; i++) expect((n[i] as { f: number }).f).toBeLessThan((n[i - 1] as { f: number }).f);
    expect(n.at(-1)?.d).toBe(Math.max(...n.map((x) => x.d)));
  });

  it('a pause or a resume: one soft, short click', () => {
    const [c, more] = notes('click');
    expect(more).toBeUndefined();
    expect(c?.d).toBeLessThan(0.05);
    expect(c?.v).toBeLessThan(0.5);
  });

  it('a low master volume', () => {
    expect(GAIN).toBeGreaterThanOrEqual(0.08);
    expect(GAIN).toBeLessThanOrEqual(0.12);
  });
});

/** A stand-in for AudioContext: it records its nodes and the ramps of their gains. */
class FakeParam {
  value = 0;
  calls: [string, number, number][] = [];
  setValueAtTime(v: number, t: number): void {
    this.calls.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.calls.push(['ramp', v, t]);
  }
}
class FakeContext {
  state: AudioContextState = 'running';
  currentTime = 2;
  destination = {};
  gains: { gain: FakeParam; connect: (n: unknown) => unknown }[] = [];
  oscs: { type: string; frequency: FakeParam; started: number; stopped: number }[] = [];
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  suspend = vi.fn(() => {
    this.state = 'suspended';
    return Promise.resolve();
  });
  close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
  createGain() {
    const g = { gain: new FakeParam(), connect: (n: unknown) => n };
    this.gains.push(g);
    return g;
  }
  createOscillator() {
    const o = {
      type: 'sine',
      frequency: new FakeParam(),
      started: -1,
      stopped: -1,
      connect: (n: unknown) => n,
      start(t: number) {
        o.started = t;
      },
      stop(t: number) {
        o.stopped = t;
      },
    };
    this.oscs.push(o);
    return o;
  }
}

describe('the synth', () => {
  let made: FakeContext[];
  const make = (): AudioContext => {
    const c = new FakeContext();
    made.push(c);
    return c as unknown as AudioContext;
  };
  beforeEach(() => {
    made = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes no context until woken: nothing plays before', () => {
    const s = synth(make);
    s.play('start');
    s.sleep(true);
    s.close();
    expect(made).toHaveLength(0);
  });

  it('woken, it makes one context with its master volume, and resumes it if suspended', () => {
    const s = synth(make);
    s.wake();
    s.wake();
    expect(made).toHaveLength(1);
    const c = made[0] as FakeContext;
    expect(c.gains[0]?.gain.value).toBe(GAIN);
    c.state = 'suspended';
    s.wake();
    expect(c.resume).toHaveBeenCalledTimes(1);
  });

  it('plays the notes of an event, each from silence to silence (no click), on its wave', () => {
    const s = synth(make);
    s.wake();
    s.play('start');
    const c = made[0] as FakeContext;
    const want = notes('start');
    expect(c.oscs.map((o) => [o.type, o.frequency.value])).toEqual(want.map((n) => [n.wave, n.f]));
    // One gain per note after the master one: from 0, up to its level, back to 0 at its end.
    c.gains.slice(1).forEach((g, i) => {
      const n = want[i] as { at: number; d: number; v: number };
      const [first, up, down] = g.gain.calls;
      expect(first?.[0]).toBe('set');
      expect(first?.[1]).toBe(0);
      expect(up).toEqual(['ramp', n.v, expect.any(Number)]);
      expect(down?.[1]).toBe(0);
      expect((down?.[2] as number) - (first?.[2] as number)).toBeCloseTo(n.d, 6);
      expect(c.oscs[i]?.stopped).toBeGreaterThan(down?.[2] as number);
      expect(c.oscs[i]?.started).toBeGreaterThanOrEqual(c.currentTime);
    });
  });

  it('sleeps after its last note, or at once; a wake meanwhile keeps it awake', () => {
    const s = synth(make);
    s.wake();
    s.play('over');
    const c = made[0] as FakeContext;
    s.sleep();
    vi.advanceTimersByTime(length('over') * 1000 - 50);
    expect(c.suspend).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(c.suspend).toHaveBeenCalledTimes(1);
    s.wake();
    s.play('click');
    s.sleep();
    s.wake();
    vi.advanceTimersByTime(2000);
    expect(c.suspend).toHaveBeenCalledTimes(1);
    s.sleep(true);
    expect(c.suspend).toHaveBeenCalledTimes(2);
  });

  it('closed, it is gone for good: no timer left, nothing plays, a wake makes a new one', () => {
    const s = synth(make);
    s.wake();
    s.play('pad', 2);
    s.sleep();
    s.close();
    const c = made[0] as FakeContext;
    expect(c.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const n = c.oscs.length;
    s.play('pad', 3);
    expect(c.oscs.length).toBe(n);
    s.close();
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it('without Web Audio (no context made), it stays silent', () => {
    const s = synth(() => null);
    s.wake();
    s.play('start');
    s.sleep();
    s.close();
    expect(vi.getTimerCount()).toBe(0);
  });
});
