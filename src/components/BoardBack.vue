<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { provideBackState } from '../composables/useBackState';
import { provideBench } from '../composables/useBench';
import { useMode } from '../composables/useMode';
import type { SiteContent } from '../content/types';
import BackFace from './BackFace.vue';
import FlipSwitch from './FlipSwitch.vue';

/**
 * The back face of the board: its silkscreen title and its own SW2 (in the same place as the one of
 * the front face), then its circuit and its bill of materials. The part that is lit is on the
 * section (data-active), for the CSS; the prerender lights nothing.
 * In the Konami mode (revision 11) the back plays its test bench (useBench): the section carries its
 * phase (data-bench: route, test, then done), what it says is said politely by a visually hidden
 * live text, and a real button by SW2, « QUITTER », ends the mode (the way out on a phone).
 */
const props = defineProps<{ back: SiteContent['back'] }>();

const { active } = provideBackState();
const face = ref<HTMLElement | null>(null);
const mode = useMode();
const bench = provideBench(() => props.back.bench, face);
const phase = computed(() => {
  const s = bench.state.value;
  if (!s) return undefined;
  return s.done ? 'done' : s.routing ? 'route' : 'test';
});

/* The way out goes with the mode: the focus it had goes to SW2 beside it, never to the page. */
const exit = ref<HTMLButtonElement | null>(null);
watch(
  () => mode?.on.value,
  (on) => {
    if (!on && exit.value && exit.value === document.activeElement) face.value?.querySelector<HTMLElement>('.sw2')?.focus({ preventScroll: true });
  },
  { flush: 'pre' },
);
</script>

<template>
  <section
    ref="face"
    class="board__face board__face--back"
    aria-labelledby="back-title"
    :data-active="active ?? undefined"
    :data-bench="phase"
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
        <button
          v-if="mode?.on.value"
          ref="exit"
          class="back__exit"
          type="button"
          :aria-label="props.back.bench.exitName"
          @click="mode.quit()"
        >
          {{ props.back.bench.exit }}
        </button>
      </div>
    </div>
    <p
      class="vh"
      aria-live="polite"
    >
      {{ bench.said.value }}
    </p>
    <BackFace :back="props.back" />
  </section>
</template>
