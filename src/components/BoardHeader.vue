<script setup lang="ts">
import type { SiteContent } from '../content/types';
import FlipSwitch from './FlipSwitch.vue';
import LangSwitch from './LangSwitch.vue';
import ThemeJumper from './ThemeJumper.vue';

const props = defineProps<{
  header: SiteContent['header'];
  nav: SiteContent['langNav'];
  theme: SiteContent['theme'];
  back: SiteContent['back'];
}>();
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
    <!-- The slots of JP1 and SW2 are laid out in the prerender, so the switches appear without moving anything. -->
    <div class="board__jp1">
      <ThemeJumper :theme="props.theme" />
    </div>
    <div class="board__sw2">
      <FlipSwitch :back="props.back" />
    </div>
  </header>
</template>
