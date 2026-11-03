<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { Locale, SiteContent } from '../content/types';

const props = defineProps<{ nav: SiteContent['langNav'] }>();

/** A click is a choice: it is remembered, and the redirect of "/" then respects it. */
function remember(lang: Locale): void {
  try {
    localStorage.setItem('k0t3i.lang', lang);
  } catch {
    // Storage can be blocked; the link still works.
  }
}
</script>

<template>
  <nav
    class="lang"
    :aria-label="props.nav.label"
  >
    <RouterLink
      v-for="link in props.nav.links"
      :key="link.lang"
      class="lang__link"
      active-class=""
      exact-active-class=""
      :to="link.href"
      :hreflang="link.lang"
      :lang="link.lang"
      :aria-label="link.label"
      @click="remember(link.lang)"
    >
      {{ link.text }}
    </RouterLink>
  </nav>
</template>
