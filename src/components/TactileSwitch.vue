<script setup lang="ts">
// The tactile switch next to DISP1. It does nothing yet: the screens come later.
const props = defineProps<{
  /** Board reference printed next to the switch, e.g. SW1. */
  designator: string;
  /** What the switch does, for assistive technologies. */
  hidden: string;
}>();
</script>

<template>
  <button
    class="sw1"
    type="button"
  >
    <svg
      class="sw1__body"
      aria-hidden="true"
      focusable="false"
    ><use href="#part-switch" /></svg>
    <span class="part__ref">{{ props.designator }}</span>
    <span class="vh">{{ props.hidden }}</span>
  </button>
</template>
