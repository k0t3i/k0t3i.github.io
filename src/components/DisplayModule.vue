<script setup lang="ts">
import type { SiteContent } from '../content/types';
import TactileSwitch from './TactileSwitch.vue';

const props = defineProps<{ display: SiteContent['display'] }>();
</script>

<template>
  <!-- figcaption must be the first or the last child of figure, hence SW1 before it. -->
  <figure
    id="disp1"
    class="disp"
    aria-labelledby="disp1-caption"
  >
    <div class="disp__screen">
      <img
        class="disp__avatar"
        src="/img/avatar.png"
        width="192"
        height="192"
        :alt="props.display.alt"
      >
      <svg
        class="disp__pixels"
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 64 64"
      />
    </div>
    <p
      class="disp__pins"
      aria-hidden="true"
    >
      {{ props.display.pins }}
    </p>
    <TactileSwitch :hidden="props.display.switchHidden" />
    <figcaption
      id="disp1-caption"
      class="disp__caption"
      aria-live="polite"
    >
      {{ props.display.captions.avatar }}
    </figcaption>
  </figure>
</template>
