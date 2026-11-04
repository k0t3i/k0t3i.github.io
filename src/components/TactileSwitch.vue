<script setup lang="ts">
// The tactile switch next to DISP1: a press asks DISP1 for its next screen (DisplayModule).
const props = defineProps<{
  /** Board reference printed next to the switch, e.g. SW1. */
  designator: string;
  /** What the switch does, for assistive technologies. */
  hidden: string;
}>();

const emit = defineEmits<{ press: [] }>();
</script>

<template>
  <button
    class="sw1"
    type="button"
    @click="emit('press')"
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
