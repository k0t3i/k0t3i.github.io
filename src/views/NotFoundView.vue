<script setup lang="ts">
import { useHead } from '@unhead/vue';

// Provisional: the real 404 content replaces this view in a later task.
useHead({ title: '404', meta: [{ name: 'robots', content: 'noindex' }] });
</script>

<template>
  <main>
    <h1>404</h1>
  </main>
</template>
