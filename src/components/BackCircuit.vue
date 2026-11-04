<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import art from '../assets/img/board-back.svg?url';
import artSmall from '../assets/img/board-back-small.svg?url';
import LIVE from '../circuit/live.json';
import { useBackState } from '../composables/useBackState';

/**
 * The circuit of the back face (spec 4.10): the real circuit of the board, an ESP32-S3 that runs the
 * parts of the front face (src/circuit). Under it, its art: a static drawing of the copper and the
 * passive parts (assets/img/board-back.svg, without the small references on a narrow face), loaded
 * only when the back face is drawn. Over it, the live layer (circuit/live.json): the traces each of
 * the eleven parts of the bill of materials lights, with the current that runs along them, and the
 * marks of the parts it is linked to that are not in the table; then the eleven parts, buttons in
 * one tab stop. A part under the pointer, the keyboard focus or a tap lights up with its row
 * (useBackState, back.css), and so does a row under the pointer (BackFace.vue).
 */
const props = defineProps<{
  /**
   * The parts, in the order of the table, each with its accessible name « {repère}, {composant},
   * {compétence} », its visible reference first (label in name): an aria-label, as the reference
   * is placed apart from the button (absolute) and a browser would read a space after it.
   */
  parts: { ref: string; name: string }[];
  /** The accessible name of their group. */
  group: string;
}>();

const state = useBackState();

interface LivePart {
  ref: string;
  box: [number, number, number, number];
  look: string;
  label: string;
  pads: [number, number, number, number][];
  mark: [number, number] | null;
  body: [number, number, number, number];
  links: string;
}
const live = LIVE as { parts: LivePart[]; nets: { d: string; by: string; rev: string }[]; marks: { x: number; y: number; w: number; h: number; round: boolean; by: string }[] };

/** The parts drawn on the circuit, in the order of the table, with their name. */
const drawn = computed(() =>
  props.parts.map((p) => {
    const part = live.parts.find((q) => q.ref === p.ref);
    if (!part) throw new Error(`no part ${p.ref} on the circuit`);
    return { ...part, name: p.name };
  }),
);
const refs = computed(() => drawn.value.map((p) => p.ref));

/*
 * The parts are live once the app has mounted. Before, and without JavaScript, they are drawn but
 * disabled, in a group hidden from assistive technologies: the table says it all.
 */
const ready = ref(false);
onMounted(() => {
  ready.value = true;
});

/*
 * The group is one stop of the tab order (a roving tabindex): the part last focused or pressed.
 * The arrows go from part to part in the order of the table, round, Home and End to its ends; Enter
 * and Space pin a part (the button's click), Escape unpins it.
 */
const current = ref<string>(props.parts[0]?.ref ?? '');
const buttons = ref<HTMLButtonElement[]>([]);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (state.pinned.value) state.toggle(state.pinned.value);
    return;
  }
  // Alt+Left, Ctrl+Home and the like belong to the browser and the screen reader.
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const all = refs.value;
  const n = all.length;
  const i = all.indexOf(current.value);
  const moves: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1 + n, ArrowUp: i - 1 + n, Home: 0, End: n - 1 };
  const next = moves[event.key];
  if (next === undefined) return;
  event.preventDefault();
  const to = all[next % n] ?? all[0] ?? '';
  current.value = to;
  buttons.value.find((b) => b.dataset.ref === to)?.focus();
}

/* A finger lights nothing by passing over a part (it would stay lit): a tap pins it instead. */
const point = (event: PointerEvent, ref: string | null): void => {
  if (event.pointerType !== 'touch') state.hover(ref);
};

/* A focus lights the part only when it is drawn (keyboard): a click focuses without a ring. */
function onFocus(event: FocusEvent, ref: string): void {
  current.value = ref;
  if ((event.currentTarget as HTMLElement).matches(':focus-visible')) state.focus(ref);
}

function onClick(ref: string): void {
  current.value = ref;
  state.toggle(ref);
}
</script>

<template>
  <div class="back__circuit">
    <!-- The art: copper and passives, a static drawing. -->
    <picture class="back__art">
      <source
        media="(max-width: 40rem)"
        :srcset="artSmall"
      >
      <img
        :src="art"
        alt=""
        width="1600"
        height="900"
        loading="lazy"
        decoding="async"
      >
    </picture>
    <!--
      The live layer, in the units of the face: each trace in fine gold, lit with the part that lights
      it (data-by; data-rev, where its current runs back), and its signal (back-pulse); the marks of the
      parts linked to the lit one that are not in the table. pathLength="100": a share of each trace.
    -->
    <svg
      class="back__live"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1600 900"
    >
      <path
        v-for="(n, i) in live.nets"
        :key="`net-${i}`"
        class="back-net"
        :data-by="n.by || undefined"
        :data-rev="n.rev || undefined"
        pathLength="100"
        :d="n.d"
      />
      <path
        v-for="(n, i) in live.nets"
        :key="`pulse-${i}`"
        class="back-pulse"
        :data-by="n.by || undefined"
        :data-rev="n.rev || undefined"
        pathLength="100"
        :d="n.d"
      />
      <template
        v-for="(m, i) in live.marks"
        :key="`mark-${i}`"
      >
        <circle
          v-if="m.round"
          class="back-mark"
          :data-by="m.by"
          :cx="m.x"
          :cy="m.y"
          :r="m.w / 2"
        />
        <rect
          v-else
          class="back-mark"
          :data-by="m.by"
          :x="m.x - m.w / 2"
          :y="m.y - m.h / 2"
          :width="m.w"
          :height="m.h"
        />
      </template>
    </svg>
    <!-- The parts: one tab stop, then the arrows (see onKeydown). -->
    <div
      class="back__parts"
      :role="ready ? 'group' : undefined"
      :aria-label="ready ? props.group : undefined"
      :aria-hidden="ready ? undefined : 'true'"
      @keydown="onKeydown"
    >
      <button
        v-for="p in drawn"
        :key="p.ref"
        ref="buttons"
        class="back-part"
        type="button"
        :data-ref="p.ref"
        :data-look="p.look"
        :data-label="p.label"
        :data-links="p.links"
        :disabled="!ready"
        :tabindex="ready ? (current === p.ref ? 0 : -1) : undefined"
        :aria-pressed="ready ? (state.pinned.value === p.ref ? 'true' : 'false') : undefined"
        :aria-label="ready ? p.name : undefined"
        :aria-describedby="ready ? `value-${p.ref} details-${p.ref} links-${p.ref}` : undefined"
        @pointerenter="point($event, p.ref)"
        @pointerleave="point($event, null)"
        @focus="onFocus($event, p.ref)"
        @blur="state.focus(null)"
        @click="onClick(p.ref)"
      >
        <svg
          class="back-part__body"
          aria-hidden="true"
          focusable="false"
          :viewBox="`0 0 ${p.box[2]} ${p.box[3]}`"
        >
          <rect
            v-for="(pad, i) in p.pads"
            :key="i"
            class="pcb-pad"
            :x="pad[0]"
            :y="pad[1]"
            :width="pad[2]"
            :height="pad[3]"
            rx="0.5"
          />
          <rect
            class="pcb-body"
            :x="p.body[0] + 0.5"
            :y="p.body[1] + 0.5"
            :width="p.body[2] - 1"
            :height="p.body[3] - 1"
            :rx="p.look === 'can' ? 3 : 1.5"
          />
          <circle
            v-if="p.mark"
            class="pcb-mark"
            :cx="p.mark[0]"
            :cy="p.mark[1]"
            r="2.5"
          />
        </svg>
        <span class="part__ref">{{ p.ref }}</span>
      </button>
    </div>
  </div>
</template>
