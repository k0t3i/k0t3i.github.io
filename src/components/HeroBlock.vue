<script setup lang="ts">
import type { SiteContent } from '../content/types';

const props = defineProps<{ hero: SiteContent['hero'] }>();
</script>

<template>
  <div class="hero">
    <h1
      id="hero-title"
      class="hero__title"
    >
      {{ props.hero.lead }}<br> <span class="hero__strong">{{ props.hero.strong }}</span>
    </h1>
    <p class="hero__sub">
      {{ props.hero.sub }}
    </p>
  </div>
</template>
