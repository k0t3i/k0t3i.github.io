<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { useLocale } from '../composables/useLocale';

// Provisional: the real 404 content replaces this view in a later task.
const { content } = useLocale();
useHead({ title: content.value.notFound.title, meta: [{ name: 'robots', content: 'noindex' }] });
</script>

<template>
  <!--
    On a board, as the home page: silkscreen on the mask stays readable on both pages, light or black.
    One face, flat, its edge drawn by its own shadow (depth.css): this board never turns.
  -->
  <div class="board">
    <div class="board__body">
      <div class="board__face board__face--front">
        <main>
          <h1>{{ content.notFound.title }}</h1>
        </main>
      </div>
    </div>
  </div>
</template>
