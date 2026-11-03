<script setup lang="ts">
import type { SiteContent } from '../content/types';
// A static drawing of the wide board (1600 x 900 units), theme-neutral like its art.
import art from '../assets/img/back-populated.svg?url';

/**
 * The populated variant of the back side: a dense, realistic face (a microcontroller, its crystal,
 * regulators, resistor networks, many capacitors), purely decorative, shown as one image with a
 * simple text alternative. No HTML text.
 */
const props = defineProps<{ back: SiteContent['back'] }>();
</script>

<template>
  <img
    class="back-populated"
    :src="art"
    width="1600"
    height="900"
    :alt="props.back.populatedAlt"
    decoding="async"
    loading="lazy"
  >
</template>
