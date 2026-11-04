<script setup lang="ts">
import { nextTick } from 'vue';
import { RouterLink } from 'vue-router';
import { useReducedMotion } from '../composables/useReducedMotion';
import type { Locale, SiteContent } from '../content/types';
import { rememberLang } from '../lib/langRedirect';

const props = defineProps<{ nav: SiteContent['langNav'] }>();
const reduced = useReducedMotion();

/**
 * The other page is shown in a view transition when the browser has them and motion is welcome:
 * the route changes inside the update callback, so the old page is captured before anything moves.
 * A click with a modifier (new tab, new window) is left to the router, which leaves it to the browser.
 */
function go(event: MouseEvent, lang: Locale, navigate: (e?: MouseEvent) => Promise<unknown>): void {
  // A click is a choice: the redirect of "/" respects it from then on.
  rememberLang(lang);
  const plain = !event.defaultPrevented && event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
  if (!plain || reduced.value || !('startViewTransition' in document)) {
    void navigate(event);
    return;
  }
  event.preventDefault();
  document.startViewTransition(async () => {
    await navigate();
    await nextTick();
  });
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
      v-slot="{ href, navigate, isExactActive }"
      :to="link.href"
      custom
    >
      <a
        class="lang__link"
        :href="href"
        :hreflang="link.lang"
        :lang="link.lang"
        :aria-label="link.label"
        :aria-current="isExactActive ? 'page' : undefined"
        @click="go($event, link.lang, navigate)"
      >{{ link.text }}</a>
    </RouterLink>
  </nav>
</template>
