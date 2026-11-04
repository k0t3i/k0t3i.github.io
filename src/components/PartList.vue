<script setup lang="ts">
import { useBoardState } from '../composables/useBoardState';
import type { PartContent } from '../content/types';
import PartSheet from './PartSheet.vue';
import PartTrigger from './PartTrigger.vue';

const props = defineProps<{ section: { id: string; title: string }; parts: PartContent[]; close: string; newTab: string }>();

// The active part of the board is lit (data-lit: parts.css lights its trace to the bus). Client only.
const { activePart } = useBoardState();
</script>

<template>
  <section
    :id="props.section.id"
    class="parts"
    :aria-labelledby="`${props.section.id}-title`"
  >
    <h2
      :id="`${props.section.id}-title`"
      class="silk-heading"
    >
      {{ props.section.title }}
    </h2>
    <!-- role=list: VoiceOver drops the list role of a list without bullets. -->
    <ul
      class="parts__list"
      role="list"
    >
      <li
        v-for="part in props.parts"
        :id="`part-${part.id}`"
        :key="part.id"
        class="part"
        :data-lit="activePart === part.id ? '' : undefined"
      >
        <PartTrigger :part="part" />
        <PartSheet
          :part="part"
          :close="props.close"
          :new-tab="props.newTab"
        />
      </li>
    </ul>
  </section>
</template>
