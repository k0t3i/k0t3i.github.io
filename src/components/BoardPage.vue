<script setup lang="ts">
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
</script>

<template>
  <a
    class="skip-link"
    href="#contenu"
  >{{ props.content.skipLink }}</a>
  <div class="board">
    <PartSprite />
    <BoardSignal />
    <BoardHeader
      :header="props.content.header"
      :nav="props.content.langNav"
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
