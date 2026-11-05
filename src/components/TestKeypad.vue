<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { KEYPAD, KEYPAD_FLOW, KEYPAD_SLOT, KEY_BODY, KEY_HIT, type Key } from '../circuit/keypad';
import type { SiteContent } from '../content/types';
import { sheetOpen } from '../lib/sheet';

/**
 * The test keypad under DISP1 (spec 4.11, revision 10): six tactile switches, SW3 to SW8, a cross and
 * B and A. Where they are comes from circuit/keypad.ts, the module the netlist and the art read too.
 * - On the wide board the art draws each switch whole: the buttons are clear hit areas over them,
 *   placed in front units (wide.css reads --kx… and --x…, set here once mounted).
 * - On the flowing board there is no art: the block draws its six switches itself (aria-hidden), in
 *   cells of KEYPAD_FLOW, and the buttons lie over them.
 * - Without JavaScript the pad would do nothing: it reads as a drawing only. The group of buttons is
 *   prerendered hidden and shown once mounted (as JP1), so hydration meets the same nodes, no dead
 *   button is announced, and the block keeps its size (nothing moves).
 * - One tab stop (a roving tabindex): outside the game mode, the arrows go from key to key in the
 *   order of the references, round, and Home and End to the ends. In the game mode the arrows are the
 *   game's, as everywhere on the page (they steer, game/play.ts): the keypad takes only Home and End.
 *   Enter and Space press the key (the button's click). The keys the keypad takes go no further, so
 *   the code detector does not count them twice (useKonami).
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
const group = ref<HTMLElement | null>(null);
const buttons = ref<HTMLButtonElement[]>([]);
const current = ref<Key>(KEYPAD[0]?.key ?? 'up');

/** The drawing of the flowing board, in cells: each switch body (its tin) KEY_BODY of a KEY_HIT cell. */
const size = ((KEY_BODY / KEY_HIT) * 32) / 26;
const drawn = KEYPAD.map((k) => {
  const [cx, cy] = KEYPAD_FLOW.centres[k.key];
  return { key: k.key, x: cx - size / 2, y: cy - size / 2 };
});
const view = `0 0 ${KEYPAD_FLOW.w} ${KEYPAD_FLOW.h}`;

/** Places the group and its keys from the module (the CSSOM: no style attribute in the page). */
function place(): void {
  const set = (el: HTMLElement | null | undefined, vars: Record<string, string | number>): void => {
    for (const [k, v] of Object.entries(vars)) el?.style.setProperty(`--${k}`, String(v));
  };
  set(group.value, { kx: KEYPAD_SLOT.x, ky: KEYPAD_SLOT.y, kw: KEYPAD_SLOT.w, kh: KEYPAD_SLOT.h, hit: KEY_HIT, cell: KEYPAD_FLOW.cell });
  for (const k of KEYPAD) {
    const [cx, cy] = KEYPAD_FLOW.centres[k.key];
    set(
      buttons.value.find((b) => b.dataset.key === k.key),
      { x: k.x - KEY_HIT / 2 - KEYPAD_SLOT.x, y: k.y - KEY_HIT / 2 - KEYPAD_SLOT.y, fx: `${((cx - 0.5) / KEYPAD_FLOW.w) * 100}%`, fy: `${((cy - 0.5) / KEYPAD_FLOW.h) * 100}%` },
    );
  }
  set(group.value, { fw: `${(1 / KEYPAD_FLOW.w) * 100}%`, fh: `${(1 / KEYPAD_FLOW.h) * 100}%` });
}

onMounted(() => {
  place();
  ready.value = true;
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
  event.stopPropagation();
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
    </svg>
    <div
      ref="group"
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
        @keydown="onKeydown"
        @pointerdown="onPointerDown"
        @pointercancel="onPointerCancel"
      >
        <span class="vh">{{ props.keypad.keys[k.key] }}</span>
      </button>
    </div>
  </div>
</template>
