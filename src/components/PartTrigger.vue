<script setup lang="ts">
import { useBoardState } from '../composables/useBoardState';
import type { PartContent } from '../content/types';
import { PART_SYMBOLS } from '../lib/partSymbols';

const props = defineProps<{ part: PartContent }>();

/*
 * The current follows the pointer and the keyboard: the part under the pointer, or the one with a
 * visible focus, is the active part of the board (its trace lit, motion.css). A focus left by a
 * click shows no ring, and lights nothing either.
 */
const { setActive } = useBoardState();

function onFocus(event: FocusEvent): void {
  if ((event.currentTarget as HTMLElement).matches(':focus-visible')) setActive(props.part.id, 'focus');
}
</script>

<template>
  <button
    class="part__trigger"
    type="button"
    :popovertarget="`sheet-${props.part.id}`"
    @pointerenter="setActive(props.part.id)"
    @pointerleave="setActive(null)"
    @focus="onFocus"
    @blur="setActive(null, 'focus')"
  >
    <svg
      class="part__body"
      aria-hidden="true"
      focusable="false"
    >
      <use :href="`#${PART_SYMBOLS[props.part.id]}`" />
    </svg>
    <span class="part__ref">{{ props.part.ref }}</span>
    <span
      class="part__label"
      :lang="props.part.labelLang"
    >{{ props.part.label }}</span>
  </button>
</template>
