<script setup lang="ts">
import { computed } from 'vue';
import { useDisplay } from '../composables/useDisplay';
import type { Locale, PartId, SiteContent } from '../content/types';
import PixelScreen from './PixelScreen.vue';
import TactileSwitch from './TactileSwitch.vue';

const props = defineProps<{
  display: SiteContent['display'];
  locale: Locale;
  /** The reference of each part on the board (R1...), printed on its readout. */
  refs: Record<PartId, string>;
}>();

// One label per pad of the module header, printed under its pad.
const pins = computed(() => props.display.pins.split(' '));

/*
 * A live screen (useDisplay): the boot, the readout of the part pointed at, and the screens of SW1.
 * The caption names only the screens chosen with SW1, politely. While the Morse code is being sent,
 * DISP1 keys LED1 (data-led, on or off: motion.css; the LED is a part of the principles, after DISP1).
 */
const { screen, chosen, part, cycle, ledOn, sending } = useDisplay(() => props.locale);
const led = computed(() => (sending.value === null ? undefined : ledOn.value ? 'on' : 'off'));
// The avatar is out of sight under the other screens, still in the figure with its text alternative;
// under the boot, the veil of the power-on lifts onto it.
const avatarOff = computed(() => screen.value !== 'avatar' && screen.value !== 'boot');
</script>

<template>
  <!-- figcaption must be the first or the last child of figure, hence SW1 before it. -->
  <figure
    id="disp1"
    class="disp"
    aria-labelledby="disp1-caption"
    :data-led="led"
  >
    <div class="disp__screen">
      <img
        class="disp__avatar"
        :class="{ 'disp__avatar--off': avatarOff }"
        src="/img/avatar.png"
        width="192"
        height="192"
        :alt="props.display.alt"
      >
      <PixelScreen
        :screen="screen"
        :part="part"
        :designator="part ? props.refs[part] : ''"
        :sending="sending"
      />
    </div>
    <p
      class="disp__pins"
      aria-hidden="true"
    >
      <template
        v-for="(pin, i) in pins"
        :key="pin"
      >
        {{ i ? ' ' : '' }}<span class="disp__pin">{{ pin }}</span>
      </template>
    </p>
    <TactileSwitch
      :designator="props.display.switchRef"
      :hidden="props.display.switchHidden"
      @press="cycle"
    />
    <figcaption
      id="disp1-caption"
      class="disp__caption"
      aria-live="polite"
    >
      {{ props.display.captions[chosen] }}
    </figcaption>
  </figure>
</template>
