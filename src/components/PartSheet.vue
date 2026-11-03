<script setup lang="ts">
import type { PartContent } from '../content/types';

const props = defineProps<{ part: PartContent; close: string }>();

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
    <picture
      v-if="props.part.media"
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
        :src="fallback"
        :srcset="srcset('jpg')"
        sizes="19rem"
        width="380"
        height="475"
        loading="lazy"
        decoding="async"
        :alt="props.part.media.alt"
      >
    </picture>
    <a
      v-if="props.part.link"
      class="sheet__link"
      :href="props.part.link.href"
    >{{ props.part.link.text }}<span aria-hidden="true"> ↗</span></a>
    <ul
      v-if="props.part.contacts"
      class="sheet__links"
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
      {{ props.close }}
    </button>
  </div>
</template>
