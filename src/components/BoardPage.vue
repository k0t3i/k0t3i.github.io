<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import type { SiteContent } from '../content/types';
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
 * iOS Safari applies :active on a tap only when the page listens to touchstart: this passive no-op
 * listener is enough for the pressed states of the parts, SW1, JP1 and Close. Client only (mounted).
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
  <div class="board board--home">
    <PartSprite />
    <BoardSignal />
    <BoardHeader
      :header="props.content.header"
      :nav="props.content.langNav"
      :theme="props.content.theme"
    />
    <main id="contenu">
      <HeroBlock :hero="props.content.hero" />
      <DisplayModule :display="props.content.display" />
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
</template>
