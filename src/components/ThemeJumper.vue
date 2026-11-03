<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useTheme } from '../composables/useTheme';
import type { SiteContent } from '../content/types';

/**
 * JP1: a 3-pin jumper whose shunt sits on pins 1-2 (green board) or 2-3 (black board). A toggle
 * button, pressed when the black board is on. Without JavaScript it would do nothing, so it is
 * prerendered hidden and shown once mounted; its slot in the header is kept, so nothing moves.
 */
const props = defineProps<{ theme: SiteContent['theme'] }>();

const { theme: current, toggle } = useTheme();
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
// The shunt and the lit position follow aria-pressed in CSS: one source for the state.
const pressed = computed(() => (current.value === 'dark' ? 'true' : 'false'));
</script>

<template>
  <button
    class="jp1"
    type="button"
    :aria-pressed="pressed"
    :hidden="!mounted"
    @click="toggle"
  >
    <span
      class="jp1__pos jp1__pos--green"
      aria-hidden="true"
    >{{ props.theme.green }}</span>
    <svg
      class="jp1__body"
      aria-hidden="true"
      focusable="false"
    ><use href="#part-jumper" /></svg>
    <span
      class="jp1__pos jp1__pos--dark"
      aria-hidden="true"
    >{{ props.theme.dark }}</span>
    <span class="part__ref">{{ props.theme.ref }}</span> <span class="vh">{{ props.theme.switchHidden }}</span>
  </button>
</template>
