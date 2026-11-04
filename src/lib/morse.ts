/**
 * International Morse code, for SW1: DISP1 shows the dots and dashes, LED1 sends them.
 * One unit of time: a dot is 1 unit on, a dash 3; 1 unit off between the signals of a letter,
 * 3 between letters, 7 between words.
 */

/**
 * The length of one unit. A dot then starts every 480 ms at best, so LED1 flashes at most 3 times in
 * any second (WCAG 2.3.1, three flashes): maxFlashesPerSecond checks it on the whole message.
 */
export const MORSE_UNIT_MS = 240;

const CODES: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  0: '-----',
  1: '.----',
  2: '..---',
  3: '...--',
  4: '....-',
  5: '.....',
  6: '-....',
  7: '--...',
  8: '---..',
  9: '----.',
};

/** One stretch of the light: on or off, for so long. */
export interface MorseStep {
  on: boolean;
  ms: number;
}

/** Text as Morse code: letters apart by a space, words by ' / '. Characters without a code are left out. */
export function encodeMorse(text: string): string {
  return text
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map((word) =>
      [...word]
        .map((ch) => CODES[ch])
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join(' / ');
}

/** The light that sends some Morse code: on for each signal, off between them; nothing after the last one. */
export function morseTimeline(code: string, unitMs: number): MorseStep[] {
  const steps: MorseStep[] = [];
  code
    .trim()
    .split(' / ')
    .forEach((word, w) => {
      if (w) steps.push({ on: false, ms: 7 * unitMs });
      word.split(' ').forEach((letter, l) => {
        if (l) steps.push({ on: false, ms: 3 * unitMs });
        [...letter].forEach((signal, s) => {
          if (s) steps.push({ on: false, ms: unitMs });
          steps.push({ on: true, ms: (signal === '-' ? 3 : 1) * unitMs });
        });
      });
    });
  return steps;
}

/** The most flashes (the light coming on) that start within any 1000 ms of a timeline. */
export function maxFlashesPerSecond(timeline: readonly MorseStep[]): number {
  const starts: number[] = [];
  let at = 0;
  let wasOn = false;
  for (const step of timeline) {
    if (step.on && !wasOn) starts.push(at);
    wasOn = step.on;
    at += step.ms;
  }
  let most = 0;
  for (let last = 0, first = 0; last < starts.length; last++) {
    while ((starts[last] ?? 0) - (starts[first] ?? 0) >= 1000) first++;
    most = Math.max(most, last - first + 1);
  }
  return most;
}
