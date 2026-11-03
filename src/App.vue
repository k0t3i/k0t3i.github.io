<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useHead } from '@unhead/vue';
import { useThemeHead } from './composables/usePageHead';

const route = useRoute();
// The 404 page has no locale of its own: it is written in French.
const lang = computed(() => route.meta.locale ?? 'fr');

useHead({ htmlAttrs: { lang } });
useThemeHead();
</script>

<template>
  <RouterView />
</template>
