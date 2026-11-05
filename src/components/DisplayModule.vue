<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useDisplay } from '../composables/useDisplay';
import type { Locale, PartId, SiteContent } from '../content/types';
import PixelScreen from './PixelScreen.vue';
import TactileSwitch from './TactileSwitch.vue';
import TestKeypad from './TestKeypad.vue';

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
const glass = ref<HTMLElement | null>(null);
const { screen, chosen, part, cycle, pad, ledOn, sending, game } = useDisplay(() => props.locale, glass);
const led = computed(() => (sending.value === null ? undefined : ledOn.value ? 'on' : 'off'));
// The avatar is out of sight under the other screens, still in the figure with its text alternative;
// under the boot, the veil of the power-on lifts onto it.
const avatarOff = computed(() => screen.value !== 'avatar' && screen.value !== 'boot');

/*
 * The game mode (revision 8): the caption names it, and what it says is said politely by a
 * visually hidden live text, empty otherwise (so a game over is said even with the same score
 * twice: a new game clears it). The count of pads takes the plural of the language.
 */
const said = computed(() => {
  const news = game.news.value;
  const copy = props.display.game;
  if (!news) return '';
  if (news.kind === 'intro') return copy.intro;
  const form = new Intl.PluralRules(props.locale).select(news.pads) === 'one' ? 'one' : 'other';
  return `${copy.over[form].replace('{n}', String(news.pads))} ${copy.again}`;
});

/*
 * The SON switch (Task 20): the sound of the game, in the game mode only, after SW1 and the keypad.
 * Focused as the mode ends, it hands the focus to SW1 before it goes.
 */
const snd = ref<HTMLElement | null>(null);
watch(game.on, (on) => {
  if (!on && snd.value === document.activeElement) snd.value?.parentElement?.querySelector<HTMLElement>('.sw1')?.focus();
});
</script>

<template>
  <!-- figcaption must be the first or the last child of figure, hence SW1 before it. -->
  <!-- disp--game: the game runs on DISP1, its swipes steer it (touch-action: none, board.css). -->
  <figure
    id="disp1"
    class="disp"
    :class="{ 'disp--game': game.on.value }"
    aria-labelledby="disp1-caption"
    :data-led="led"
  >
    <div
      ref="glass"
      class="disp__screen"
    >
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
        :game="game.view.value"
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
    <p
      class="vh"
      aria-live="polite"
    >
      {{ said }}
    </p>
    <TactileSwitch
      :designator="props.display.switchRef"
      :hidden="props.display.switchHidden"
      :exit="game.on.value ? props.display.game.exit : ''"
      @press="cycle"
    />
    <!-- The test keypad (revision 10): it types the code, then plays; placed on the art of the wide board. -->
    <TestKeypad
      :keypad="props.display.keypad"
      :game="game.on.value"
      @press="pad"
    />
    <button
      v-if="game.on.value"
      ref="snd"
      class="snd"
      type="button"
      :aria-pressed="game.sound.value"
      :aria-label="props.display.game.sound.name"
      @click="game.toggleSound"
    >
      <span
        class="snd__pos snd__pos--off"
        aria-hidden="true"
      >{{ props.display.game.sound.off }}</span>
      <svg
        class="snd__body"
        aria-hidden="true"
        focusable="false"
      ><use href="#part-slide-switch" /></svg>
      <span
        class="snd__pos snd__pos--on"
        aria-hidden="true"
      >{{ props.display.game.sound.on }}</span>
      <span
        class="part__ref"
        aria-hidden="true"
      >{{ props.display.game.sound.label }}</span>
    </button>
    <figcaption
      id="disp1-caption"
      class="disp__caption"
      aria-live="polite"
    >
      {{ props.display.captions[game.on.value ? 'game' : chosen] }}
    </figcaption>
  </figure>
</template>
