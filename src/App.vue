<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useHead } from '@unhead/vue';
import { useGlow } from './composables/useGlow';
import { useThemeHead } from './composables/usePageHead';

const route = useRoute();
// The 404 page has no locale of its own: it is written in French.
const lang = computed(() => route.meta.locale ?? 'fr');

useHead({ htmlAttrs: { lang } });
useThemeHead();

// The glow of the page follows a mouse over the mat (useGlow.ts).
const glow = ref<HTMLElement | null>(null);
useGlow(glow);

// Two frames after the mount the page has been styled with its stylesheet at least once: from then
// on motion.css lets its transitions run (data-live), never on the way to the first styled frame.
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('app')?.setAttribute('data-live', ''))));
</script>

<template>
  <!--
    The page under every board (revision 8): a workbench mat, a fine grid of dots (base.css), its
    wave and the glow of a mouse over it (motion.css). Decoration, under everything.
  -->
  <div
    class="mat"
    aria-hidden="true"
  >
    <div class="mat__wave" />
    <div
      ref="glow"
      class="mat__glow"
    />
  </div>
  <RouterView />
</template>
