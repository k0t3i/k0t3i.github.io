<script setup lang="ts">
import type { SiteContent } from '../content/types';
import BackBom from './BackBom.vue';
import FlipSwitch from './FlipSwitch.vue';

/**
 * The back face of the board: its silkscreen title and its own SW2 (in the same place as the one of
 * the front face), then the bill of materials.
 */
const props = defineProps<{ back: SiteContent['back'] }>();
</script>

<template>
  <section
    class="board__face board__face--back"
    aria-labelledby="back-title"
  >
    <div class="back__header">
      <h2
        id="back-title"
        class="silk-heading back__title"
      >
        {{ props.back.title }}
      </h2>
      <!-- The slot of SW2, laid out in the prerender like the one of the front face. -->
      <div class="board__sw2">
        <FlipSwitch :back="props.back" />
      </div>
    </div>
    <BackBom :back="props.back" />
  </section>
</template>
