<script setup lang="ts">
import { computed } from 'vue';
import { useBackState } from '../composables/useBackState';
import { useBench } from '../composables/useBench';
import { bomRows, plain } from '../circuit/bom';
import type { SiteContent } from '../content/types';
import BackCircuit from './BackCircuit.vue';

/**
 * The back face: the real circuit of the board (BackCircuit.vue, src/circuit), its eleven main parts
 * each a skill; then the bill of materials itself, a real table that holds
 * all of it in text: one row per part, the real part and its value, then the skill and its details,
 * and the parts it is linked to, computed from the netlist (circuit/bom.ts, which also names the parts). A part under the pointer, the keyboard focus or a tap lights up with its row,
 * its traces and the parts it is linked to (useBackState, back.css), and so does a row under the
 * pointer.
 */
const props = defineProps<{ back: SiteContent['back'] }>();

const state = useBackState();
const bench = useBench();

/**
 * The test bench of the Konami mode (revision 11): the status of each row as it is tested (TEST, then
 * PASS) and, once passed, its result in place of its part; drawn only (aria-hidden), each part's
 * description gains its result once the whole bench is done: nothing is said while it runs.
 */
const status = (i: number): 'run' | 'pass' | undefined => {
  const s = bench.state.value;
  if (!s) return undefined;
  return i < s.passed ? 'pass' : i < s.tested ? 'run' : undefined;
};

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

/**
 * A row of the table (circuit/bom.ts): its two lines; the parts it is linked to as printed in « Relié à », each reference (or range) but the last
 * followed by its dot (`none` for a part with no signal link); and all of them, for what lights up.
 */
const rows = computed(() =>
  bomRows(props.back.bom.rows).map((row) => {
    const linkedItems = row.linked.length ? row.linked.map((to, i) => ({ to, dot: i < row.linked.length - 1 })) : [{ to: props.back.bom.none, dot: false }];
    // Its description: the details of its skill, its value and « Relié à », in the order of the table, in plain text.
    const tested = bench.state.value?.done ? ` ${props.back.bench.described.replace('{result}', row.result)}` : '';
    const description = plain(`${row.details} ${row.value} ${props.back.bom.columns.linked} ${linkedItems.map((l) => l.to).join(' · ')}${tested}`);
    return { ...row, linkedItems, description, dataLinks: row.links.join(' ') };
  }),
);
/** The parts drawn on the circuit (BackCircuit.vue), in the order of the table, each with its accessible name. */
const parts = computed(() => rows.value.map((row) => ({ ref: row.ref, name: row.name })));

/* A finger lights nothing by passing over a row (it would stay lit). */
const point = (event: PointerEvent, ref: string | null): void => {
  if (event.pointerType !== 'touch') state.hover(ref);
};
</script>

<template>
  <!-- The circuit: its art, its live layer, its eleven parts (one tab stop, then the arrows). -->
  <BackCircuit
    :parts="parts"
    :group="props.back.group"
    :texts="props.back.bench"
  />
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
        v-for="(row, r) in rows"
        :id="`row-${row.ref}`"
        :key="row.ref"
        :data-ref="row.ref"
        :data-links="row.dataLinks"
        :data-test="status(r)"
        @pointerenter="point($event, row.ref)"
        @pointerleave="point($event, null)"
      >
        <th scope="row">
          <span class="bom__ref">{{ row.ref }}<span
            v-if="status(r)"
            class="bom__test"
            aria-hidden="true"
          >{{ status(r) === 'pass' ? props.back.bench.pass : props.back.bench.test }}</span></span>
        </th>
        <!--
          Two lines to a row (Anthony, 05/11/2026): the skill and its details, the main line, then the
          real part and its value, read second, each line across the two cells. The last word of each
          item is glued to its dot: a line never starts with a dot.
        -->
        <td>
          <span class="bom__line bom__main">{{ row.skill }}</span>{{ ' ' }}<span
            class="bom__line bom__sub"
            :class="{ 'bom__sub--tested': status(r) === 'pass' }"
          ><span class="bom__part">{{ row.part }}</span><span
            v-if="status(r) === 'pass'"
            class="bom__result"
            aria-hidden="true"
          >{{ row.result }}</span></span>
        </td>
        <td>
          <span
            :id="`details-${row.ref}`"
            class="bom__line bom__main bom__details"
          ><template
            v-for="(item, i) in items(row.details)"
            :key="i"
          >
            {{ i ? ' ' : '' }}{{ item.text }}<span
              v-if="item.glued"
              class="bom__glue"
            >{{ item.glued }}</span>
          </template></span>{{ ' ' }}<span
            :id="`value-${row.ref}`"
            class="bom__line bom__sub bom__value"
          ><template
            v-for="(item, i) in items(row.value)"
            :key="i"
          >
            {{ i ? ' ' : '' }}{{ item.text }}<span
              v-if="item.glued"
              class="bom__glue"
            >{{ item.glued }}</span>
          </template></span>
          <!--
            A narrow face has no room for the last column: the links are printed here instead, labelled.
          -->
          <!-- The description of the part drawn on the circuit (BackCircuit.vue): hidden, referenced, plain text. -->
          <span
            :id="`desc-${row.ref}`"
            hidden
          >{{ row.description }}</span>
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
