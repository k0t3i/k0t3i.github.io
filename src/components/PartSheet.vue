<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { PartContent } from '../content/types';

const props = defineProps<{ part: PartContent; close: string }>();

/**
 * The picture of a sheet is rendered on its first opening only, so nothing is fetched before
 * (loading="lazy" is not enough: WebKit fetched it with the sheet closed). It stays false in the
 * prerender and the first client render, so hydration matches. Without JavaScript: no picture.
 *
 * The <img> gets its own URLs one tick later, once it sits in its <picture>: WebKit starts a load on
 * each attribute set on a detached image, so src, srcset and sizes set at creation cost three
 * requests. Inside the picture, the sources are chosen first and the fallback adds no request.
 */
const mediaReady = ref(false);
const fallbackReady = ref(false);
async function onToggle(event: Event): Promise<void> {
  if ((event as ToggleEvent).newState !== 'open' || mediaReady.value) return;
  mediaReady.value = true;
  await nextTick();
  fallbackReady.value = true;
}

/**
 * Focus that leaves an open sheet closes it: Tab past its Close button, or Shift+Tab back to its part.
 * On the flowing board the sheet would otherwise lie over the part that now has the focus. A focus
 * lost to another window (no related target) keeps it open.
 */
function onFocusOut(event: FocusEvent): void {
  const sheet = event.currentTarget as HTMLElement;
  if (event.relatedTarget instanceof Node && !sheet.contains(event.relatedTarget) && sheet.matches(':popover-open')) sheet.hidePopover();
}

const FORMATS = [
  { type: 'image/avif', ext: 'avif' },
  { type: 'image/webp', ext: 'webp' },
] as const;
const fallback = '/img/kit-urgence-380.jpg';
const srcset = (ext: string): string => `/img/kit-urgence-380.${ext} 380w, /img/kit-urgence-760.${ext} 760w`;
</script>

<template>
  <div
    :id="`sheet-${props.part.id}`"
    class="sheet"
    popover
    role="dialog"
    :aria-labelledby="`sheet-${props.part.id}-title`"
    @toggle="onToggle"
    @focusout="onFocusOut"
  >
    <p class="sheet__ref">
      {{ props.part.ref }} · {{ props.part.kind }}
    </p>
    <!-- autofocus moves the focus here when the popover opens (WCAG: focus goes to the dialog title). -->
    <!-- eslint-disable vuejs-accessibility/no-autofocus -->
    <h3
      :id="`sheet-${props.part.id}-title`"
      class="sheet__title"
      tabindex="-1"
      autofocus
      :lang="props.part.labelLang"
    >
      {{ props.part.title }}
    </h3>
    <!-- eslint-enable vuejs-accessibility/no-autofocus -->
    <p
      v-if="props.part.body"
      class="sheet__body"
    >
      {{ props.part.body }}
    </p>
    <!-- The link before the picture: it stays in view when a short window makes the sheet scroll. -->
    <a
      v-if="props.part.link"
      class="sheet__link"
      :href="props.part.link.href"
    >{{ props.part.link.text }}<span aria-hidden="true"> ↗</span></a>
    <picture
      v-if="props.part.media && mediaReady"
      class="sheet__media"
    >
      <source
        v-for="f in FORMATS"
        :key="f.ext"
        :type="f.type"
        :srcset="srcset(f.ext)"
        sizes="19rem"
      >
      <img
        sizes="19rem"
        :srcset="fallbackReady ? srcset('jpg') : undefined"
        :src="fallbackReady ? fallback : undefined"
        width="380"
        height="475"
        decoding="async"
        :alt="props.part.media.alt"
      >
    </picture>
    <!-- role=list: VoiceOver drops the list role of a list without bullets. -->
    <ul
      v-if="props.part.contacts"
      class="sheet__links"
      role="list"
    >
      <li
        v-for="c in props.part.contacts"
        :key="c.href"
      >
        {{ c.label }} <a :href="c.href">{{ c.text }}<span aria-hidden="true"> ↗</span></a>
      </li>
    </ul>
    <button
      class="sheet__close"
      type="button"
      :popovertarget="`sheet-${props.part.id}`"
      popovertargetaction="hide"
    >
      <span class="sheet__close-zone">{{ props.close }}</span>
    </button>
  </div>
</template>
