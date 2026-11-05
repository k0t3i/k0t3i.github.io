<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { KEYPAD, KEYPAD_FLOW, KEY_BODY, KEY_HIT, KEY_MARKS, type Key } from '../circuit/keypad';
import type { SiteContent } from '../content/types';
import { adoptKeypadPlaces } from '../lib/keypadPlaces';
import { sheetOpen } from '../lib/sheet';

/**
 * The test keypad under DISP1 (spec 4.11, revision 10): six tactile switches, SW3 to SW8, a cross and
 * B and A. Where they are comes from circuit/keypad.ts, the module the netlist and the art read too.
 * - On the wide board the art draws each switch whole: the buttons are clear hit areas over them,
 *   placed in front units (styles/keypad.css reads --kx… and --x…, adopted here once mounted).
 * - On the flowing board there is no art: the block draws its six switches itself (aria-hidden), in
 *   cells of KEYPAD_FLOW, and the buttons lie over them.
 * - Without JavaScript the pad would do nothing: it reads as a drawing only. The group of buttons is
 *   prerendered hidden and shown once mounted (as JP1), so hydration meets the same nodes, no dead
 *   button is announced, and the block keeps its size (nothing moves).
 * - One tab stop (a roving tabindex): outside the game mode, the arrows go from key to key in the
 *   order of the references, round, and Home and End to the ends. In the game mode the arrows are the
 *   game's, as everywhere on the page (they steer, game/play.ts): the keypad takes only Home and End.
 *   Enter and Space press the key (the button's click): they go no further, the press is the step
 *   of the code (useKonami). The arrows, Home and End move the focus without scrolling the page, and
 *   still reach the document: the code typed on the keyboard with the focus on the keypad is the
 *   code (the review of Task 18).
 * - A press is the button's click, mouse, finger, pen, keyboard or assistive technology alike: one
 *   event, never a touch and then a click (and nothing on the way down: WCAG 2.5.2). A press that
 *   meets an open sheet, or that began over one (a tap outside a sheet closes it), presses nothing.
 */
const props = defineProps<{
  keypad: SiteContent['display']['keypad'];
  /** The game mode is on: the arrows are the game's. */
  game: boolean;
}>();

const emit = defineEmits<{ press: [key: Key] }>();

const ready = ref(false);
const buttons = ref<HTMLButtonElement[]>([]);
const current = ref<Key>(KEYPAD[0]?.key ?? 'up');

/** The drawing of the flowing board, in cells: each switch body (its tin) KEY_BODY of a KEY_HIT cell. */
const size = ((KEY_BODY / KEY_HIT) * 32) / 26;
const drawn = KEYPAD.map((k) => {
  const [cx, cy] = KEYPAD_FLOW.centres[k.key];
  return { key: k.key, x: cx - size / 2, y: cy - size / 2 };
});
const view = `0 0 ${KEYPAD_FLOW.w} ${KEYPAD_FLOW.h}`;

/**
 * The printed marks of the keys (KEY_MARKS), as on the art of the wide board: a small filled arrow
 * off the end of each arm of the cross, B and A drawn as strokes (paths, not text: a mark of the
 * silkscreen, never a text of the page).
 */
const r = 0.11;
const glyph = (key: Key, x: number, y: number): { d: string; letter: boolean } => {
  const n = (v: number) => +v.toFixed(3);
  if (key === 'up') return { d: `M${n(x)} ${n(y - r)}L${n(x + r)} ${n(y + 0.8 * r)}H${n(x - r)}Z`, letter: false };
  if (key === 'down') return { d: `M${n(x - r)} ${n(y - 0.8 * r)}H${n(x + r)}L${n(x)} ${n(y + r)}Z`, letter: false };
  if (key === 'left') return { d: `M${n(x - r)} ${n(y)}L${n(x + 0.8 * r)} ${n(y - r)}V${n(y + r)}Z`, letter: false };
  if (key === 'right') return { d: `M${n(x + r)} ${n(y)}L${n(x - 0.8 * r)} ${n(y - r)}V${n(y + r)}Z`, letter: false };
  if (key === 'a') return { d: `M${n(x - 0.08)} ${n(y + 0.12)}L${n(x)} ${n(y - 0.12)}L${n(x + 0.08)} ${n(y + 0.12)}M${n(x - 0.05)} ${n(y + 0.04)}H${n(x + 0.05)}`, letter: true };
  return {
    d: `M${n(x - 0.07)} ${n(y + 0.12)}V${n(y - 0.12)}H${n(x + 0.01)}A0.055 0.06 0 0 1 ${n(x + 0.01)} ${n(y)}H${n(x - 0.07)}M${n(x + 0.01)} ${n(y)}H${n(x + 0.02)}A0.06 0.06 0 0 1 ${n(x + 0.02)} ${n(y + 0.12)}H${n(x - 0.07)}`,
    letter: true,
  };
};
const marks = KEYPAD.map((k) => {
  const [cx, cy] = KEYPAD_FLOW.centres[k.key];
  const [dx, dy] = KEY_MARKS[k.key].flow;
  return { key: k.key, ...glyph(k.key, cx + dx, cy + dy) };
});

/**
 * The places of the keys come in a stylesheet of their own, made from the module (lib/keypadPlaces.ts)
 * and adopted once by the document: no style attribute in the page. An engine without constructed
 * stylesheets keeps the keypad a drawing, as without JavaScript.
 */
onMounted(() => {
  ready.value = adoptKeypadPlaces(document);
});

function onKeydown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.stopPropagation();
    return;
  }
  const n = KEYPAD.length;
  const i = KEYPAD.findIndex((k) => k.key === current.value);
  const roving: Record<string, number> = props.game ? {} : { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1 + n, ArrowUp: i - 1 + n };
  const next = { ...roving, Home: 0, End: n - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  const to = KEYPAD[next % n]?.key ?? current.value;
  current.value = to;
  buttons.value.find((b) => b.dataset.key === to)?.focus();
}

/** A pointer went down over an open sheet: its click only closed the sheet. */
let downOverSheet = false;
const onPointerDown = (): void => {
  downOverSheet = sheetOpen();
};
const onPointerCancel = (): void => {
  downOverSheet = false;
};

function onClick(event: MouseEvent, key: Key): void {
  current.value = key;
  // A click of the keyboard or of an assistive technology has no pointer before it (detail 0).
  const blocked = (event.detail > 0 && downOverSheet) || sheetOpen();
  downOverSheet = false;
  if (!blocked) emit('press', key);
}
</script>

<template>
  <div class="keypad">
    <svg
      class="keypad__art"
      :viewBox="view"
      aria-hidden="true"
      focusable="false"
    >
      <use
        v-for="d in drawn"
        :key="d.key"
        href="#part-switch"
        :x="d.x"
        :y="d.y"
        :width="size"
        :height="size"
      />
      <path
        v-for="m in marks"
        :key="`mark-${m.key}`"
        :class="m.letter ? 'keypad__letter' : 'keypad__arrow'"
        :d="m.d"
      />
    </svg>
    <div
      class="keypad__keys"
      role="group"
      :aria-label="props.keypad.group"
      :hidden="!ready"
    >
      <button
        v-for="k in KEYPAD"
        ref="buttons"
        :key="k.key"
        class="keypad__key"
        type="button"
        :data-key="k.key"
        :tabindex="k.key === current ? 0 : -1"
        @click="onClick($event, k.key)"
        @focus="current = k.key"
        @keydown="onKeydown"
        @pointerdown="onPointerDown"
        @pointercancel="onPointerCancel"
      >
        <span class="vh">{{ props.keypad.keys[k.key] }}</span>
      </button>
    </div>
  </div>
</template>
