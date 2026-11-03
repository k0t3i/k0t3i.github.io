<script setup lang="ts">
import type { SiteContent } from '../content/types';

const props = defineProps<{ marks: SiteContent['marks'] }>();
</script>

<template>
  <ul class="pcb-marks">
    <li
      v-for="mark in props.marks"
      :key="mark.visible"
    >
      <span aria-hidden="true">{{ mark.visible }}</span>
      <span class="vh">{{ mark.hidden }}</span>
    </li>
  </ul>
</template>
