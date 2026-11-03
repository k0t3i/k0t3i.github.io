<script setup lang="ts">
import type { SiteContent } from '../content/types';
import LangSwitch from './LangSwitch.vue';

const props = defineProps<{ header: SiteContent['header']; nav: SiteContent['langNav'] }>();
</script>

<template>
  <header class="board__header">
    <p class="board__name">
      {{ props.header.name }}
    </p>
    <p class="board__rev">
      {{ props.header.rev }}
    </p>
    <LangSwitch :nav="props.nav" />
  </header>
</template>
