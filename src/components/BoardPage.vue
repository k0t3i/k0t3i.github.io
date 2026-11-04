<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { provideBoardState } from '../composables/useBoardState';
import { useBoot } from '../composables/useBoot';
import { FLIP, useFlip } from '../composables/useFlip';
import { useTilt } from '../composables/useTilt';
import type { PartId, SiteContent } from '../content/types';
import BoardBack from './BoardBack.vue';
import BoardHeader from './BoardHeader.vue';
import BoardSignal from './BoardSignal.vue';
import DisplayModule from './DisplayModule.vue';
import HeroBlock from './HeroBlock.vue';
import PartList from './PartList.vue';
import PartSprite from './PartSprite.vue';
import PcbMarks from './PcbMarks.vue';
import UptimeCounter from './UptimeCounter.vue';

const props = defineProps<{ content: SiteContent }>();

/*
 * The board is an object with two faces and an edge. It leans towards a mouse on the wide board
 * (useTilt) and SW2 turns it over (useFlip): both write their state on the board element itself,
 * on the client only.
 */
const board = ref<HTMLElement | null>(null);
provide(FLIP, useFlip(board));
useTilt(board);

/*
 * The live state of the board, for the parts and DISP1: the part the current runs to, and the
 * power-on of the first visit. Both are reflected on the board for the CSS (data-active,
 * data-booting); neither is in the prerender, which renders the board at rest.
 * The first part pointed at ends the power-on: the visitor acts, the board is on, and the current
 * runs to that part (its trace never plays the sweep, so nothing is cut when the boot would end).
 */
const { booting, end: endBoot } = useBoot();
const { activePart } = provideBoardState(booting);
watch(activePart, (id) => {
  if (id) endBoot();
});

/** The reference of each part, for its readout on DISP1. */
const refs = computed(
  () => Object.fromEntries([...props.content.principles, ...props.content.connectors].map((p) => [p.id, p.ref])) as Record<PartId, string>,
);

/*
 * iOS Safari applies :active on a tap only when the page listens to touchstart: this passive no-op
 * listener is enough for the pressed states of the parts, SW1, JP1, SW2 and Close. Client only (mounted).
 */
const touchActive = (): void => {};
onMounted(() => document.addEventListener('touchstart', touchActive, { passive: true }));
onBeforeUnmount(() => document.removeEventListener('touchstart', touchActive));
</script>

<template>
  <a
    class="skip-link"
    href="#contenu"
  >{{ props.content.skipLink }}</a>
  <!-- board--home: the board of the home page, the one that turns into the wide board (wide.css). -->
  <div
    ref="board"
    class="board board--home"
    :data-active="activePart ?? undefined"
    :data-booting="booting ? '' : undefined"
  >
    <PartSprite />
    <div class="board__body">
      <!-- A div, not a section: its header and footer stay the banner and the contentinfo of the page. -->
      <div class="board__face board__face--front">
        <BoardSignal />
        <BoardHeader
          :header="props.content.header"
          :nav="props.content.langNav"
          :theme="props.content.theme"
          :back="props.content.back"
        />
        <main id="contenu">
          <HeroBlock :hero="props.content.hero" />
          <DisplayModule
            :display="props.content.display"
            :locale="props.content.locale"
            :refs="refs"
          />
          <PartList
            :section="props.content.sections.principles"
            :parts="props.content.principles"
            :close="props.content.close"
          />
          <PartList
            :section="props.content.sections.connectors"
            :parts="props.content.connectors"
            :close="props.content.close"
          />
        </main>
        <footer class="board__footer">
          <UptimeCounter
            :uptime="props.content.uptime"
            :locale="props.content.locale"
          />
          <PcbMarks :marks="props.content.marks" />
        </footer>
      </div>
      <BoardBack :back="props.content.back" />
    </div>
    <!-- The side of the board: FR4 between two layers of solder mask, under the face (depth.css). -->
    <div
      class="board__edge"
      aria-hidden="true"
    />
  </div>
</template>
