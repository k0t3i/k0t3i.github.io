<script setup lang="ts">
import type { PartContent } from '../content/types';
import { PART_SYMBOLS } from '../lib/partSymbols';

const props = defineProps<{ part: PartContent }>();
</script>

<template>
  <button
    class="part__trigger"
    type="button"
    :popovertarget="`sheet-${props.part.id}`"
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
