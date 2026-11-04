<script setup lang="ts">
import { provideBackState } from '../composables/useBackState';
import type { SiteContent } from '../content/types';
import BackFace from './BackFace.vue';
import FlipSwitch from './FlipSwitch.vue';

/**
 * The back face of the board: its silkscreen title and its own SW2 (in the same place as the one of
 * the front face), then its circuit and its bill of materials. The part that is lit is on the
 * section (data-active), for the CSS; the prerender lights nothing.
 */
const props = defineProps<{ back: SiteContent['back'] }>();

const { active } = provideBackState();
</script>

<template>
  <section
    class="board__face board__face--back"
    aria-labelledby="back-title"
    :data-active="active ?? undefined"
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
    <BackFace :back="props.back" />
  </section>
</template>
