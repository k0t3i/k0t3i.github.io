<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useHead } from '@unhead/vue';
import { useThemeHead } from './composables/usePageHead';

const route = useRoute();
// The 404 page has no locale of its own: it is written in French.
const lang = computed(() => route.meta.locale ?? 'fr');

useHead({ htmlAttrs: { lang } });
useThemeHead();

// Two frames after the mount the page has been styled with its stylesheet at least once: from then
// on motion.css lets its transitions run (data-live), never on the way to the first styled frame.
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('app')?.setAttribute('data-live', ''))));
</script>

<template>
  <RouterView />
</template>
