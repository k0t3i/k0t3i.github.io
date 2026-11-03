<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { useLocale } from '../composables/useLocale';

// Provisional: the real 404 content replaces this view in a later task.
const { content } = useLocale();
useHead({ title: content.value.notFound.title, meta: [{ name: 'robots', content: 'noindex' }] });
</script>

<template>
  <!-- On a board, as the home page: silkscreen on the mask stays readable on both pages, light or black. -->
  <div class="board">
    <main>
      <h1>{{ content.notFound.title }}</h1>
    </main>
  </div>
</template>
