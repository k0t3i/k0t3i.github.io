<script setup lang="ts">
import { computed } from 'vue';
import { useBench } from '../composables/useBench';
import type { SiteContent } from '../content/types';
import { layoutText, pixelPath, textWidth } from '../lib/pixelFont';

/**
 * What the test bench of the Konami mode draws on the circuit (revision 11, useBench), a component
 * of its own so that only it redraws as the traces are counted:
 * - its counter, bottom left (the traces routed out of all of them, then the design rules check);
 * - its stamp, an inspection sticker printed on a clear part of the copper (x 175–285, y 592–652 in
 *   the units of the face, between SW1, TP3, J1 and R17), once every part passed; drawn in those
 *   units, as the art, so it keeps its place at every size, its words in the pixel font of DISP1
 *   (paths, a drawing, never a text of the page).
 * Drawings (aria-hidden): what the bench says is said by the face.
 */
const props = defineProps<{ texts: SiteContent['back']['bench'] }>();

const bench = useBench();
const counter = computed(() => {
  const n = bench.routed.value;
  if (n === null) return '';
  return bench.drc.value ? props.texts.drc : props.texts.routing.replace('{n}', String(n)).replace('{total}', String(bench.total));
});
/** A word of the stamp, centred on x 230 from the top at y, `size` units high (the glyph is 7 high). */
const word = (text: string, top: number, size: number): { d: string; transform: string } => {
  const k = size / 7;
  return { d: pixelPath(layoutText(text, 1)), transform: `translate(${+(230 - (textWidth(text, 1) * k) / 2).toFixed(2)} ${top}) scale(${+k.toFixed(3)})` };
};
const words = computed(() => {
  const [first = '', ...rest] = props.texts.stamp.split(' ');
  return [word(first, 602, 10), word(rest.join(' '), 618, 21)];
});
</script>

<template>
  <p
    v-if="counter"
    class="back__counter"
    aria-hidden="true"
  >
    {{ counter }}
  </p>
  <svg
    v-if="bench.stamp.value"
    class="back__mark"
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 1600 900"
  >
    <g transform="rotate(-7 230 622)">
      <g class="back-stamp">
        <rect
          class="back-stamp__plate"
          x="175"
          y="592"
          width="110"
          height="60"
          rx="6"
        />
        <rect
          class="back-stamp__rule"
          x="180.5"
          y="597.5"
          width="99"
          height="49"
          rx="3"
        />
        <path
          v-for="(w, i) in words"
          :key="i"
          class="back-stamp__word"
          :d="w.d"
          :transform="w.transform"
        />
      </g>
    </g>
  </svg>
</template>
