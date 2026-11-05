<script setup lang="ts">
import type { SiteContent } from '../content/types';

const props = defineProps<{ marks: SiteContent['marks'] }>();
</script>

<template>
  <!-- role=list: VoiceOver drops the list role of a list without bullets. -->
  <ul
    class="pcb-marks"
    role="list"
  >
    <li
      v-for="mark in props.marks"
      :key="mark.visible"
    >
      <span
        aria-hidden="true"
        :class="{ 'pcb-mark--framed': mark.framed }"
      >{{ mark.visible }}</span>
      <span class="vh">{{ mark.hidden }}</span>
    </li>
  </ul>
</template>
