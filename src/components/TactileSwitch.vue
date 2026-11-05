<script setup lang="ts">
// The tactile switch next to DISP1: a press asks DISP1 for its next screen (DisplayModule).
const props = defineProps<{
  /** Board reference printed next to the switch, e.g. SW1. */
  designator: string;
  /** What the switch does, for assistive technologies. */
  hidden: string;
  /**
   * While the game mode is on (hotfix of 05/11/2026): a silkscreen by the switch, « QUITTER » / "EXIT",
   * the way out shown on a phone. Drawn only (aria-hidden): the rules said at the start name SW1 as the
   * way out. Empty: none. Placed out of the flow (board.css), so nothing moves as it comes and goes.
   */
  exit?: string;
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
    <span
      v-if="props.exit"
      class="sw1__exit"
      aria-hidden="true"
    >{{ props.exit }}</span>
  </button>
</template>
