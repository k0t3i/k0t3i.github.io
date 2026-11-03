<script setup lang="ts">
import { computed, inject } from 'vue';
import { FLIP } from '../composables/useFlip';
import type { SiteContent } from '../content/types';

/**
 * SW2: a slide switch, TOP or BOT, rendered once on each face of the board. A toggle button,
 * pressed while the back face is up; its slider is drawn on the side that is up. Without
 * JavaScript it would do nothing, so it is prerendered hidden and shown once the board is ready;
 * its slot keeps its room, so nothing moves.
 */
const props = defineProps<{ back: SiteContent['back'] }>();

const flip = inject(FLIP);
if (!flip) throw new Error('FlipSwitch needs the flip state of its board (useFlip)');
const { flipped, ready, toggle } = flip;
// The slider and the lit position follow aria-pressed in CSS: one source for the state.
const pressed = computed(() => (flipped.value ? 'true' : 'false'));
</script>

<template>
  <button
    class="sw2"
    type="button"
    :aria-pressed="pressed"
    :hidden="!ready"
    @click="toggle"
  >
    <span
      class="sw2__pos sw2__pos--top"
      aria-hidden="true"
    >{{ props.back.top }}</span>
    <svg
      class="sw2__body"
      aria-hidden="true"
      focusable="false"
    ><use href="#part-slide-switch" /></svg>
    <span
      class="sw2__pos sw2__pos--bot"
      aria-hidden="true"
    >{{ props.back.bot }}</span>
    <span class="part__ref">{{ props.back.ref }}</span> <span class="vh">{{ props.back.switchHidden }}</span>
  </button>
</template>
