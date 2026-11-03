<script setup lang="ts">
import BoardPage from '../components/BoardPage.vue';
import { useLocale } from '../composables/useLocale';
import { usePageHead } from '../composables/usePageHead';

const { content } = useLocale();
usePageHead(content);
</script>

<template>
  <BoardPage :content="content" />
</template>
