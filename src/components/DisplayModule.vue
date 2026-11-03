<script setup lang="ts">
import { computed } from 'vue';
import type { SiteContent } from '../content/types';
import TactileSwitch from './TactileSwitch.vue';

const props = defineProps<{ display: SiteContent['display'] }>();

// One label per pad of the module header, printed under its pad.
const pins = computed(() => props.display.pins.split(' '));
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
      <template
        v-for="(pin, i) in pins"
        :key="pin"
      >
        {{ i ? ' ' : '' }}<span class="disp__pin">{{ pin }}</span>
      </template>
    </p>
    <TactileSwitch
      :designator="props.display.switchRef"
      :hidden="props.display.switchHidden"
    />
    <figcaption
      id="disp1-caption"
      class="disp__caption"
      aria-live="polite"
    >
      {{ props.display.captions.avatar }}
    </figcaption>
  </figure>
</template>
