<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useBackState } from '../composables/useBackState';
import { bomRows } from '../circuit/bom';
import { BACK_NETS, BACK_PARTS, BACK_REFS, netPath, type BackRef } from '../content/backNets';
import type { SiteContent } from '../content/types';
import BackCopper from './BackCopper.vue';

/**
 * The back face: a circuit where every part is a skill of the bill of materials and every trace
 * links two skills that work together (content/backNets.ts), over the copper of a real bottom side
 * and its passive parts (BackCopper.vue); then the bill of materials itself, a real table that holds
 * all of it in text: one row per part, the real part and its value, then the skill and its details,
 * and the parts it is linked to, computed from the netlist (circuit/bom.ts, which also names the parts). A part under the pointer, the keyboard focus or a tap lights up with its row,
 * its traces and the parts it is linked to (useBackState, back.css), and so does a row under the
 * pointer.
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

/**
 * A row of the table (circuit/bom.ts): its two lines; the parts it is linked to as printed in « Relié à », each reference (or range) but the last
 * followed by its dot (`none` for a part with no signal link); and all of them, for what lights up.
 */
const rows = computed(() =>
  bomRows(props.back.bom.rows).map((row) => {
    const linkedItems = row.linked.length ? row.linked.map((to, i) => ({ to, dot: i < row.linked.length - 1 })) : [{ to: props.back.bom.none, dot: false }];
    return { ...row, linkedItems, dataLinks: row.links.join(' ') };
  }),
);
/**
 * The parts drawn on the circuit, in the order of the table: each named « {repère}, {composant},
 * {compétence} », its visible reference first (label in name). The name is an aria-label: the
 * reference is placed apart from the button (absolute), and a browser would read a space after it.
 */
const parts = computed(() =>
  rows.value.map((row) => {
    const part = BACK_PARTS.find((p) => p.ref === row.ref);
    if (!part) throw new Error(`no part for ${row.ref}`);
    return { ...part, name: row.name, links: row.dataLinks };
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
 * The arrows go from part to part in the order of the table (U10 to J6, round), Home and End to
 * its ends; Enter and Space pin a part (the button's click), Escape unpins it.
 */
const current = ref<BackRef>(BACK_REFS[0]);
const buttons = ref<HTMLButtonElement[]>([]);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (state.pinned.value) state.toggle(state.pinned.value);
    return;
  }
  // Alt+Left, Ctrl+Home and the like belong to the browser and the screen reader.
  if (event.altKey || event.ctrlKey || event.metaKey) return;
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
    <!-- The copper and its passives, a static drawing (BackCopper.vue); over them, the live layer of the nets. -->
    <BackCopper>
      <!-- Each net in gold, lit with its parts (back-net), and the signal that runs along it (back-pulse). pathLength="100": a share of each net. -->
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
    </BackCopper>
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
        ><use :href="`#pkg-${p.pkg}`" /></svg>
        <span class="part__ref">{{ p.ref }}</span>
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
        :data-links="row.dataLinks"
        @pointerenter="point($event, row.ref)"
        @pointerleave="point($event, null)"
      >
        <th scope="row">
          {{ row.ref }}
        </th>
        <!--
          Two lines to a row: the real part and its value, then the skill and its details, each line
          across the two cells. The last word of each item is glued to its dot: a line never starts
          with a dot.
        -->
        <td>
          <span class="bom__line">{{ row.part }}</span>{{ ' ' }}<span class="bom__line">{{ row.skill }}</span>
        </td>
        <td>
          <span
            :id="`value-${row.ref}`"
            class="bom__line"
          ><template
            v-for="(item, i) in items(row.value)"
            :key="i"
          >
            {{ i ? ' ' : '' }}{{ item.text }}<span
              v-if="item.glued"
              class="bom__glue"
            >{{ item.glued }}</span>
          </template></span>{{ ' ' }}<span
            :id="`details-${row.ref}`"
            class="bom__line bom__details"
          ><template
            v-for="(item, i) in items(row.details)"
            :key="i"
          >
            {{ i ? ' ' : '' }}{{ item.text }}<span
              v-if="item.glued"
              class="bom__glue"
            >{{ item.glued }}</span>
          </template></span>
          <!--
            A narrow face has no room for the last column: the links are printed here instead. Labelled,
            this copy is also the end of the description of the part (after its value and details), at every size.
          -->
          <span
            :id="`links-${row.ref}`"
            class="bom__links"
          ><span class="bom__links-label">{{ props.back.bom.columns.linked }}</span><template
            v-for="item in row.linkedItems"
            :key="item.to"
          >
            {{ ' ' }}<span class="bom__glue"><span class="bom__to">{{ item.to }}</span>{{ item.dot ? ' ·' : '' }}</span>
          </template></span>
        </td>
        <!-- Each reference keeps its dot: a line never starts with a dot. -->
        <td class="bom__linked">
          <template
            v-for="(item, i) in row.linkedItems"
            :key="item.to"
          >
            {{ i ? ' ' : '' }}<span class="bom__glue"><span class="bom__to">{{ item.to }}</span>{{ item.dot ? ' ·' : '' }}</span>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
</template>
