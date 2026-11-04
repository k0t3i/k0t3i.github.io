<script setup lang="ts">
import { computed } from 'vue';
import type { Screen } from '../composables/useDisplay';
import type { GameView } from '../game/play';
import { BOOT_LINES, MORSE_MESSAGE, READOUTS, UPTIME_UNIT } from '../content/readouts';
import type { PartId } from '../content/types';
import { encodeMorse } from '../lib/morse';
import { layoutText, pixelPath, textWidth, type Pixel } from '../lib/pixelFont';
import { uptimeHours } from '../lib/uptime';

const props = defineProps<{
  screen: Screen;
  /** The part of the readout, and its reference on the board (R1...). */
  part: PartId | null;
  designator: string;
  /** The signal of the Morse code being sent, lit on the screen as on LED1 (useDisplay). */
  sending: number | null;
  /** What the mini-game draws (game/play.ts): one path a part of it, its class from the part. */
  game: GameView | null;
}>();

/*
 * The screens of DISP1 drawn in pixels, on the 64 x 64 grid of the avatar (3 CSS px each): one path of
 * squares per colour (board.css), crisp edges. Decor only: the caption of DISP1 names the screen.
 * The avatar is the image under this layer, which then draws nothing.
 */
const text = (s: string, scale: 1 | 2, x: number, y: number): string => pixelPath(layoutText(s, scale), x, y);
const MARGIN = 4;

/* The boot: BOOT, its dots one by one, then OK on the next line (motion.css times them). */
const [BOOT_FIRST, BOOT_SECOND] = BOOT_LINES;
const BOOT_WORD = BOOT_FIRST.replace(/\.+$/, '');
const BOOT: string[] = [
  text(BOOT_WORD, 1, MARGIN, MARGIN),
  ...Array.from(BOOT_FIRST.slice(BOOT_WORD.length), (dot, i) => text(dot, 1, MARGIN + (BOOT_WORD.length + i) * 6, MARGIN)),
  text(BOOT_SECOND, 1, MARGIN, MARGIN + 10),
];

/*
 * A readout: the reference large, the value under it, and the trace of an oscilloscope in the lower
 * part of the screen, a signal each kind of part could carry. One period is 16 pixels; the trace is
 * drawn one period longer than its window, which motion.css scrolls by one period, pixel by pixel.
 */
const SCOPE = { x: MARGIN, y: 36, w: 56, h: 24 };
const PERIOD = 16;
const bits = (pattern: string) => (x: number) => (pattern[Math.floor(x / 2)] === '1' ? 13 : 3);
/** The level of each signal (0 at the bottom, 16 at the top) along one period. */
const SIGNALS: Record<PartId, (x: number) => number> = {
  // A resistor in an AC circuit: a sine.
  r1: (x) => 8 + 7 * Math.sin((2 * Math.PI * x) / PERIOD),
  // A capacitor charging and discharging through a resistor.
  c1: (x) => (x < 8 ? 3 + 11 * (1 - Math.exp(-x / 2.2)) : 3 + 11 * Math.exp(-(x - 8) / 2.2)),
  // An LED dimmed by PWM: short pulses.
  led1: (x) => (x < 4 ? 13 : 3),
  // A diode: a half-wave rectified sine.
  d1: (x) => (x < 8 ? 3 + 11 * Math.sin((Math.PI * x) / 8) : 3),
  // A chip: its clock.
  u2: (x) => (x < 8 ? 13 : 3),
  // The connectors: data, a few bits each period.
  j1: bits('11100110'),
  j2: bits('11011000'),
  j3: bits('10110100'),
  j4: bits('11101010'),
  j5: bits('10001110'),
};

/** A signal as a polyline of horizontal and vertical runs, through the centres of its pixels. */
function trace(level: (x: number) => number): string {
  const y = (x: number) => SCOPE.h - 4 - Math.round(level(x % PERIOD));
  const points: string[] = [];
  const at = (x: number, py: number) => points.push(`${x + 0.5},${py + 0.5}`);
  at(0, y(0));
  for (let x = 1; x < SCOPE.w + PERIOD; x++) {
    if (y(x) === y(x - 1)) continue;
    at(x, y(x - 1));
    at(x, y(x));
  }
  at(SCOPE.w + PERIOD - 1, y(SCOPE.w + PERIOD - 1));
  return points.join(' ');
}

const WAVES = Object.fromEntries(Object.entries(SIGNALS).map(([id, level]) => [id, trace(level)])) as Record<PartId, string>;

/* The graticule: a dot every 8 pixels on the edges of the window, and its centre line, dotted. */
const GRID = pixelPath([
  ...Array.from({ length: SCOPE.w / 8 + 1 }, (_, i) => [
    { x: SCOPE.x + Math.min(i * 8, SCOPE.w - 1), y: SCOPE.y },
    { x: SCOPE.x + Math.min(i * 8, SCOPE.w - 1), y: SCOPE.y + SCOPE.h - 1 },
  ]).flat(),
  ...Array.from({ length: SCOPE.w / 4 }, (_, i) => ({ x: SCOPE.x + i * 4 + 2, y: SCOPE.y + SCOPE.h / 2 })),
]);

/* The uptime: its digits large, centred, with H under the last one. */
const uptime = computed(() => {
  const digits = String(uptimeHours(new Date()));
  const w = textWidth(digits, 2);
  const x = Math.floor((64 - w) / 2);
  return { digits: text(digits, 2, x, 21), unit: text(UPTIME_UNIT, 1, x + w - textWidth(UPTIME_UNIT, 1), 39) };
});

/*
 * The Morse code: one row per letter, the letter then its dots and dashes, drawn to the scale of
 * their timing (a dot 3 pixels long, a dash 9, 3 between them). Each row is encoded from its own
 * letter, so a space between words (' / ' in the code) never shifts a row; the screen holds five
 * rows of 12 pixels, a word the length of HELLO (the signals are counted in the same order as
 * useDisplay sends them).
 */
const MORSE_ROWS = (() => {
  const letters = [...MORSE_MESSAGE].filter((ch) => encodeMorse(ch) !== '');
  const codes = letters.map((ch) => encodeMorse(ch));
  const width = Math.max(...codes.map((c) => [...c].reduce((w, s) => w + (s === '-' ? 9 : 3) + 3, -3)));
  const x0 = Math.floor((64 - (5 + 5 + width)) / 2);
  const y0 = Math.floor((64 - (letters.length * 12 - 5)) / 2);
  const glyphs: Pixel[] = [];
  const signals: Pixel[][] = [];
  letters.forEach((letter, row) => {
    const y = y0 + row * 12;
    glyphs.push(...layoutText(letter, 1).map((p) => ({ x: p.x + x0, y: p.y + y })));
    let x = x0 + 10;
    for (const s of codes[row] ?? '') {
      const w = s === '-' ? 9 : 3;
      signals.push(Array.from({ length: w * 3 }, (_, i) => ({ x: x + (i % w), y: y + 2 + Math.floor(i / w) })));
      x += w + 3;
    }
  });
  return { letters: pixelPath(glyphs), signals };
})();

const morse = computed(() => {
  const lit = props.sending ?? -1;
  return {
    signals: pixelPath(MORSE_ROWS.signals.filter((_, i) => i !== lit).flat()),
    sending: lit >= 0 ? pixelPath(MORSE_ROWS.signals[lit] ?? []) : '',
  };
});

const readout = computed(() =>
  props.part ? { ref: text(props.designator, 2, MARGIN, MARGIN), value: text(READOUTS[props.part], 1, MARGIN, 22), wave: WAVES[props.part] } : null,
);
</script>

<template>
  <svg
    class="disp__pixels"
    :data-screen="props.screen"
    viewBox="0 0 64 64"
    shape-rendering="crispEdges"
    aria-hidden="true"
    focusable="false"
  >
    <g
      v-if="props.screen === 'boot'"
      class="disp__boot"
    >
      <path
        v-for="(d, i) in BOOT"
        :key="i"
        class="px px--text"
        :d="d"
      />
    </g>
    <template v-else-if="props.screen === 'readout' && readout">
      <path
        class="px px--ref"
        :d="readout.ref"
      />
      <path
        class="px px--value"
        :d="readout.value"
      />
      <path
        class="px px--grid"
        :d="GRID"
      />
      <svg
        class="disp__scope"
        :x="SCOPE.x"
        :y="SCOPE.y"
        :width="SCOPE.w"
        :height="SCOPE.h"
        :viewBox="`0 0 ${SCOPE.w} ${SCOPE.h}`"
      >
        <polyline
          class="disp__wave"
          :points="readout.wave"
        />
      </svg>
    </template>
    <template v-else-if="props.screen === 'uptime'">
      <path
        class="px px--digits"
        :d="uptime.digits"
      />
      <path
        class="px px--unit"
        :d="uptime.unit"
      />
    </template>
    <template v-else-if="props.screen === 'game'">
      <path
        v-for="layer in props.game ?? []"
        :key="layer.part"
        :class="`px px--${layer.part}`"
        :d="layer.d"
      />
    </template>
    <template v-else-if="props.screen === 'morse'">
      <path
        class="px px--letters"
        :d="MORSE_ROWS.letters"
      />
      <path
        class="px px--signals"
        :d="morse.signals"
      />
      <path
        v-if="morse.sending"
        class="px px--sending"
        :d="morse.sending"
      />
    </template>
  </svg>
</template>
