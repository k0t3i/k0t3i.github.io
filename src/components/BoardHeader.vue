<script setup lang="ts">
import type { SiteContent } from '../content/types';
import LangSwitch from './LangSwitch.vue';
import ThemeJumper from './ThemeJumper.vue';

const props = defineProps<{ header: SiteContent['header']; nav: SiteContent['langNav']; theme: SiteContent['theme'] }>();
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
    <!-- The slot of JP1 is laid out in the prerender, so the jumper appears without moving anything. -->
    <div class="board__jp1">
      <ThemeJumper :theme="props.theme" />
    </div>
  </header>
</template>
