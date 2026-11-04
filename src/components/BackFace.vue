<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useBackState } from '../composables/useBackState';
import { CLEARANCE, FIDUCIAL, FIDUCIALS, FRONT_PADS, HOLE, HOLES, HOLE_RING, OUTLINE, POUR, SPOKES, STITCH, TRACE, VIA } from '../content/backCopper';
import { BACK_NETS, BACK_PARTS, BACK_REFS, linkedTo, netPath, type BackRef } from '../content/backNets';
import type { SiteContent } from '../content/types';
import { PACKAGES } from '../lib/packages';

/**
 * The back face: a circuit where every part is a skill of the bill of materials and every trace
 * links two skills that work together (content/backNets.ts), over the copper of a real bottom side
 * (content/backCopper.ts); then the bill of materials itself, a real table that holds all of it in
 * text. A part under the pointer, the keyboard focus or a tap lights up (useBackState, back.css),
 * and so does a row under the pointer.
 */
const props = defineProps<{ back: SiteContent['back'] }>();

const state = useBackState();

/**
 * The items of a value, each but the last with its separator glued to its last word: "two words · c"
 * gives { text: "two ", glued: "words ·" }, { text: "c", glued: "" }. A line can break inside an item,
 * never before a dot; the text of the cell is unchanged.
 */
const items = (value: string): { text: string; glued: string }[] =>
  value.split(' · ').map((item, i, all) => {
    if (i === all.length - 1) return { text: item, glued: '' };
    const cut = item.lastIndexOf(' ') + 1;
    return { text: item.slice(0, cut), glued: `${item.slice(cut)} ·` };
  });

const NETS = BACK_NETS.map((n) => ({ ...n, d: netPath(n) }));
/** The pour is cut back round every part: its footprint, and the clearance. */
const KEEP_OUT = BACK_PARTS.map((p) => ({
  x: p.x - CLEARANCE.part,
  y: p.y - CLEARANCE.part,
  w: PACKAGES[p.pkg].w + 2 * CLEARANCE.part,
  h: PACKAGES[p.pkg].h + 2 * CLEARANCE.part,
}));

/** A row of the table: the part, and the parts it is linked to (« Relié à »). */
const rows = computed(() =>
  props.back.bom.rows.map((row) => {
    const ref = row.ref as BackRef;
    const linked = linkedTo(ref);
    const linkedItems = linked.map((r, i) => (i < linked.length - 1 ? `${r} ·` : r));
    return { ...row, ref, linked: linked.join(' · '), linkedItems, links: linked.join(' ') };
  }),
);
/** The parts drawn on the circuit, in the order of the table, with their skill. */
const parts = computed(() =>
  rows.value.map((row) => {
    const part = BACK_PARTS.find((p) => p.ref === row.ref);
    if (!part) throw new Error(`no part for ${row.ref}`);
    return { ...part, name: row.part, links: row.links };
  }),
);

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
 * The arrows go from part to part in the order of the table (U10 to U20, round), Home and End to
 * its ends; Enter and Space pin a part (the button's click), Escape unpins it.
 */
const current = ref<BackRef>(BACK_REFS[0]);
const buttons = ref<HTMLButtonElement[]>([]);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (state.pinned.value) state.toggle(state.pinned.value);
    return;
  }
  const n = BACK_REFS.length;
  const i = BACK_REFS.indexOf(current.value);
  const moves: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1 + n, ArrowUp: i - 1 + n, Home: 0, End: n - 1 };
  const next = moves[event.key];
  if (next === undefined) return;
  event.preventDefault();
  const to = BACK_REFS[next % n] ?? BACK_REFS[0];
  current.value = to;
  buttons.value.find((b) => b.dataset.ref === to)?.focus();
}

/* A finger lights nothing by passing over a part (it would stay lit): a tap pins it instead. */
const point = (event: PointerEvent, ref: BackRef | null): void => {
  if (event.pointerType !== 'touch') state.hover(ref);
};

/* A focus lights the part only when it is drawn (keyboard): a click focuses without a ring. */
function onFocus(event: FocusEvent, ref: BackRef): void {
  current.value = ref;
  if ((event.currentTarget as HTMLElement).matches(':focus-visible')) state.focus(ref);
}

function onClick(ref: BackRef): void {
  current.value = ref;
  state.toggle(ref);
}
</script>

<template>
  <div class="back__circuit">
    <!--
      The copper of the bottom layer, in the 1600 x 900 units of the wide board: the edge of the board,
      the pour and its cuts, the traces of the nets, the stitching vias, the through-hole pads of the
      front, the mounting holes and fiducials; then the live layer of the nets (back-net, lit with its
      parts) and the signal that runs along it (back-pulse). pathLength="100": a share of each net.
    -->
    <svg
      class="back__copper"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1600 900"
    >
      <defs>
        <g id="back-stitch">
          <circle
            class="back__via"
            :r="VIA.r"
          />
          <circle
            class="pcb-drill"
            :r="VIA.drill"
          />
        </g>
      </defs>
      <rect
        class="back__veil back__outline"
        :x="OUTLINE.x"
        :y="OUTLINE.y"
        :width="OUTLINE.w"
        :height="OUTLINE.h"
        :rx="OUTLINE.r"
      />
      <rect
        class="back__pour"
        :x="POUR.x"
        :y="POUR.y"
        :width="POUR.w"
        :height="POUR.h"
        :rx="POUR.r"
      />
      <rect
        v-for="(k, i) in KEEP_OUT"
        :key="`keep-${i}`"
        class="back__clear"
        :x="k.x"
        :y="k.y"
        :width="k.w"
        :height="k.h"
        :rx="CLEARANCE.part"
      />
      <path
        v-for="n in NETS"
        :key="`clear-${n.id}`"
        class="back__clear"
        :d="n.d"
        :stroke-width="TRACE + 2 * CLEARANCE.trace"
      />
      <circle
        v-for="(p, i) in FRONT_PADS"
        :key="`ring-${i}`"
        class="back__clear"
        :cx="p.x"
        :cy="p.y"
        :r="p.r + CLEARANCE.pad"
      />
      <path
        class="back__veil back__spokes"
        :d="SPOKES"
      />
      <path
        v-for="n in NETS"
        :key="`trace-${n.id}`"
        class="back__veil back__trace"
        :d="n.d"
        :stroke-width="TRACE"
      />
      <use
        v-for="([x, y], i) in STITCH"
        :key="`stitch-${i}`"
        href="#back-stitch"
        :x="x"
        :y="y"
      />
      <g
        v-for="(p, i) in FRONT_PADS"
        :key="`pad-${i}`"
      >
        <rect
          v-if="p.square"
          class="pcb-pad"
          :x="p.x - p.r"
          :y="p.y - p.r"
          :width="p.r * 2"
          :height="p.r * 2"
          rx="1"
        />
        <circle
          v-else
          class="pcb-pad"
          :cx="p.x"
          :cy="p.y"
          :r="p.r"
        />
        <circle
          class="pcb-drill"
          :cx="p.x"
          :cy="p.y"
          :r="p.drill"
        />
      </g>
      <g
        v-for="([x, y], i) in HOLES"
        :key="`hole-${i}`"
      >
        <circle
          class="pcb-pad"
          :cx="x"
          :cy="y"
          :r="HOLE.r"
        />
        <circle
          class="pcb-drill"
          :cx="x"
          :cy="y"
          :r="HOLE.drill"
        />
        <use
          v-for="([dx, dy], k) in HOLE_RING"
          :key="k"
          href="#back-stitch"
          :x="x + dx"
          :y="y + dy"
        />
      </g>
      <g
        v-for="([x, y], i) in FIDUCIALS"
        :key="`fid-${i}`"
      >
        <circle
          class="back__clear"
          :cx="x"
          :cy="y"
          :r="FIDUCIAL.clear"
        />
        <circle
          class="pcb-pad"
          :cx="x"
          :cy="y"
          :r="FIDUCIAL.r"
        />
      </g>
      <g class="back__nets">
        <path
          v-for="n in NETS"
          :key="`net-${n.id}`"
          class="back-net"
          :data-net="n.id"
          :data-from="n.from"
          :data-to="n.to"
          pathLength="100"
          :d="n.d"
        />
        <path
          v-for="n in NETS"
          :key="`pulse-${n.id}`"
          class="back-pulse"
          :data-net="n.id"
          :data-from="n.from"
          :data-to="n.to"
          pathLength="100"
          :d="n.d"
        />
      </g>
    </svg>
    <!-- The parts: one tab stop, then the arrows (see onKeydown). -->
    <div
      class="back__parts"
      :role="ready ? 'group' : undefined"
      :aria-label="ready ? props.back.group : undefined"
      :aria-hidden="ready ? undefined : 'true'"
      @keydown="onKeydown"
    >
      <button
        v-for="p in parts"
        :key="p.ref"
        ref="buttons"
        class="back-part"
        type="button"
        :data-ref="p.ref"
        :data-links="p.links"
        :data-label="p.label"
        :disabled="!ready"
        :tabindex="ready ? (current === p.ref ? 0 : -1) : undefined"
        :aria-pressed="ready ? (state.pinned.value === p.ref ? 'true' : 'false') : undefined"
        :aria-describedby="ready ? `row-${p.ref}` : undefined"
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
        ><use :href="`#pkg-${p.pkg}`" /></svg>
        <span class="part__ref">{{ p.ref }}</span><span class="vh">, {{ p.name }}</span>
      </button>
    </div>
  </div>
  <table class="bom">
    <caption class="bom__caption">
      {{ props.back.bom.caption }}
    </caption>
    <thead>
      <tr>
        <th scope="col">
          {{ props.back.bom.columns.ref }}
        </th>
        <th scope="col">
          {{ props.back.bom.columns.part }}
        </th>
        <th scope="col">
          {{ props.back.bom.columns.value }}
        </th>
        <th
          class="bom__linked"
          scope="col"
        >
          {{ props.back.bom.columns.linked }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in rows"
        :id="`row-${row.ref}`"
        :key="row.ref"
        :data-ref="row.ref"
        :data-links="row.links"
        @pointerenter="point($event, row.ref)"
        @pointerleave="point($event, null)"
      >
        <th scope="row">
          {{ row.ref }}
        </th>
        <td>{{ row.part }}</td>
        <!-- The last word of each item is glued to its dot: a line never starts with a dot. -->
        <td>
          <template
            v-for="(item, i) in items(row.value)"
            :key="i"
          >
            {{ i ? ' ' : '' }}{{ item.text }}<span
              v-if="item.glued"
              class="bom__glue"
            >{{ item.glued }}</span>
          </template>
          <!-- A narrow face has no room for the last column: the links are printed here instead. -->
          <span class="bom__links"><span class="bom__links-label">{{ props.back.bom.columns.linked }}</span><template
            v-for="item in row.linkedItems"
            :key="item"
          >
            {{ ' ' }}<span class="bom__glue">{{ item }}</span>
          </template></span>
        </td>
        <!-- Each reference keeps its dot: a line never starts with a dot. -->
        <td class="bom__linked">
          <template
            v-for="(item, i) in row.linkedItems"
            :key="item"
          >
            {{ i ? ' ' : '' }}<span class="bom__glue">{{ item }}</span>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
</template>
