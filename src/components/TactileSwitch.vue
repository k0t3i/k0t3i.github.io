<script setup lang="ts">
// The board reference of the switch, like R1 or J3. The button does nothing yet: the screens come later.
const REF = 'SW1';

const props = defineProps<{ hidden: string }>();
</script>

<template>
  <button
    class="sw1"
    type="button"
  >
    <svg
      aria-hidden="true"
      focusable="false"
    ><use href="#part-switch" /></svg>
    <span class="part__ref">{{ REF }}</span>
    <span class="vh">{{ props.hidden }}</span>
  </button>
</template>
