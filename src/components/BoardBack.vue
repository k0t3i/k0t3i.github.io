<script setup lang="ts">
import { computed } from 'vue';
import type { SiteContent } from '../content/types';
import BackBom from './BackBom.vue';
import BackPopulated from './BackPopulated.vue';
import FlipSwitch from './FlipSwitch.vue';

/**
 * The back face of the board: its silkscreen title and its own SW2 (in the same place as the one of
 * the front face), then the variant of this build (vite.config.ts, BACK_VARIANT): the bill of
 * materials or the populated side, each with its own title. The constant leaves the other variant
 * out of the bundle.
 */
const props = defineProps<{ back: SiteContent['back'] }>();

const populated = __BACK_VARIANT__ === 'populated';
const Variant = populated ? BackPopulated : BackBom;
const title = computed(() => (populated ? props.back.populatedTitle : props.back.title));
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
        {{ title }}
      </h2>
      <!-- The slot of SW2, laid out in the prerender like the one of the front face. -->
      <div class="board__sw2">
        <FlipSwitch :back="props.back" />
      </div>
    </div>
    <component
      :is="Variant"
      :back="props.back"
    />
  </section>
</template>
