/*
 * The bleeps of « Routage » (Task 20), in the chunk of the game: nothing of it is fetched or made
 * before the code is typed, and no AudioContext before a game starts on the visitor's own key or tap.
 * Original sounds, synthesised (square and triangle waves, short envelopes, no audio file): a short
 * jingle as a game starts, a rising bip for each pad (a semitone higher a pad, an octave at most), a
 * falling phrase at the game over, a soft click on a pause and on a resume. Each lasts under 1 s, so
 * WCAG 1.4.2 is met (the SON switch is the audio control anyway). Reduced motion does not mute
 * them: motion and sound are two choices.
 */

/** What the game plays. */
export type Sfx = 'start' | 'pad' | 'over' | 'click';

/** A note: its pitch (Hz), when it starts and how long it lasts (s), its wave, its level (0 to 1). */
export interface Note {
  f: number;
  at: number;
  d: number;
  wave: OscillatorType;
  v: number;
}

/** The master volume: low. */
export const GAIN = 0.1;
/** The bip of the first pad (Hz), then a semitone higher a pad, PAD_STEPS steps at most. */
export const PAD_HZ = 660;
export const PAD_STEPS = 12;

/** The bip of the pad `score` (1 for the first). */
export const padHz = (score: number): number => PAD_HZ * 2 ** ((Math.min(Math.max(score, 1), PAD_STEPS + 1) - 1) / 12);

const n = (f: number, at: number, d: number, wave: OscillatorType = 'square', v = 0.5): Note => ({ f, at, d, wave, v });

/** The notes of an event; `score` is the pads connected, for the bip of a pad. */
export function notes(sfx: Sfx, score = 1): Note[] {
  if (sfx === 'start') return [n(440, 0, 0.08), n(587.33, 0.1, 0.08), n(880, 0.2, 0.18)];
  if (sfx === 'pad') return [n(padHz(score), 0, 0.05), n(padHz(score) * 1.5, 0.045, 0.06)];
  if (sfx === 'over') return [n(523.25, 0, 0.12, 'triangle', 0.9), n(392, 0.14, 0.12, 'triangle', 0.9), n(311.13, 0.28, 0.12, 'triangle', 0.9), n(233.08, 0.42, 0.34, 'triangle', 0.9)];
  return [n(1800, 0, 0.025, 'triangle', 0.35)];
}

/** How long an event plays (s). */
export const length = (sfx: Sfx): number => Math.max(...notes(sfx).map((x) => x.at + x.d));

export interface Synth {
  /** On the visitor's key or tap: makes the context (the first time) or resumes it. */
  wake(): void;
  /** Plays an event, if awake. */
  play(sfx: Sfx, score?: number): void;
  /** Suspends the context after its last note, or at once. */
  sleep(now?: boolean): void;
  /** Closes the context for good, and clears its timer. */
  close(): void;
}

/** A synth on the context `make` gives (null: no Web Audio, silence). */
export function synth(make: () => AudioContext | null): Synth {
  let ctx: AudioContext | null = null;
  let out: GainNode | null = null;
  /** When its last note ends, on the clock of the context. */
  let until = 0;
  let nap: ReturnType<typeof setTimeout> | undefined;
  const calm = (): void => {
    clearTimeout(nap);
    nap = undefined;
  };
  return {
    wake() {
      calm();
      if (!ctx && (ctx = make())) {
        out = ctx.createGain();
        out.gain.value = GAIN;
        out.connect(ctx.destination);
      }
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    },
    play(sfx, score) {
      if (!ctx || !out) return;
      const t0 = ctx.currentTime + 0.01;
      for (const x of notes(sfx, score)) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const a = t0 + x.at;
        o.type = x.wave;
        o.frequency.value = x.f;
        // From silence to silence, with short ramps: no click.
        g.gain.setValueAtTime(0, a);
        g.gain.linearRampToValueAtTime(x.v, a + 0.005);
        g.gain.linearRampToValueAtTime(0, a + x.d);
        o.connect(g).connect(out);
        o.start(a);
        o.stop(a + x.d + 0.02);
      }
      until = Math.max(until, t0 + length(sfx));
    },
    sleep(now) {
      calm();
      const c = ctx;
      if (!c) return;
      const go = (): void => {
        nap = undefined;
        if (c.state !== 'closed') c.suspend().catch(() => {});
      };
      if (now) go();
      else nap = setTimeout(go, Math.max(0, until - c.currentTime) * 1000 + 50);
    },
    close() {
      calm();
      ctx?.close().catch(() => {});
      ctx = out = null;
      until = 0;
    },
  };
}
