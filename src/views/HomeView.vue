<script setup lang="ts">
import { useLocale } from '../composables/useLocale';
import { usePageHead } from '../composables/usePageHead';

// Provisional: the real page replaces this view in a later task.
const { content } = useLocale();
usePageHead(content);
</script>

<template>
  <main>
    <h1>{{ content.hero.lead }} {{ content.hero.strong }}</h1>
  </main>
</template>
