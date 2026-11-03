<script setup lang="ts">
import type { SiteContent } from '../content/types';

/**
 * The bill of materials of the back side: the skills of Anthony as the parts of the board, in a real
 * table printed in silkscreen. Under it, on the wide board, the copper of the bottom layer: every
 * through-hole part of the front seen from behind (x mirrored: 1600 - x of the front art), the vias,
 * a ground pour with its thermal reliefs and stitching vias, and a bus from J1 up to the DISP1 header.
 * In the units of the wide board (1600 x 900), integers only, theme-neutral like the art.
 */
const props = defineProps<{ back: SiteContent['back'] }>();

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

type Pad = { x: number; y: number; r: number; drill: number; square?: boolean };
type Point = [number, number];

/** Through-hole pads: DISP1 header, SW1, J1, J2 and the tabs of J3 (pin 1 square). */
const PADS: Pad[] = [
  { x: 372, y: 188, r: 6, drill: 3, square: true },
  { x: 328, y: 188, r: 6, drill: 3 },
  { x: 284, y: 188, r: 6, drill: 3 },
  { x: 240, y: 188, r: 6, drill: 3 },
  { x: 196, y: 188, r: 6, drill: 3 },
  { x: 152, y: 188, r: 6, drill: 3 },
  { x: 192, y: 525, r: 4, drill: 1 },
  { x: 168, y: 525, r: 4, drill: 1 },
  { x: 192, y: 543, r: 4, drill: 1 },
  { x: 168, y: 543, r: 4, drill: 1 },
  { x: 406, y: 634, r: 4, drill: 2, square: true },
  { x: 396, y: 634, r: 4, drill: 2 },
  { x: 386, y: 634, r: 4, drill: 2 },
  { x: 376, y: 634, r: 4, drill: 2 },
  { x: 366, y: 634, r: 4, drill: 2 },
  { x: 356, y: 634, r: 4, drill: 2 },
  { x: 406, y: 698, r: 4, drill: 2, square: true },
  { x: 396, y: 698, r: 4, drill: 2 },
  { x: 386, y: 698, r: 4, drill: 2 },
  { x: 376, y: 698, r: 4, drill: 2 },
  { x: 406, y: 762, r: 5, drill: 2, square: true },
  { x: 354, y: 762, r: 5, drill: 2, square: true },
];
/** Traces of the bottom layer and their width. */
const TRACES = [
  { d: 'M396 634V476L284 364V188', w: 2 },
  { d: 'M386 634V483L240 337V188', w: 2 },
  { d: 'M376 634V490L196 310V188', w: 2 },
  { d: 'M366 634V497L152 283V188', w: 2 },
  { d: 'M328 188V218L340 230H420L432 242V608L406 634', w: 3 },
  { d: 'M192 525V498', w: 2 },
  { d: 'M168 525V498', w: 2 },
  { d: 'M354 762V786', w: 3 },
];
/** Vias: those of SW1 and J3; then the stitching of the pour (smaller). */
const VIAS: Point[] = [[192, 498], [168, 498], [354, 786]];
const STITCH: Point[] = [[136, 160], [200, 160], [264, 160], [328, 160], [392, 160], [456, 160], [72, 224], [136, 224], [264, 224], [456, 224], [72, 288], [136, 288], [264, 288], [328, 288], [392, 288], [456, 288], [72, 352], [136, 352], [200, 352], [328, 352], [392, 352], [456, 352], [72, 416], [136, 416], [200, 416], [264, 416], [392, 416], [456, 416], [72, 480], [136, 480], [264, 480], [328, 480], [456, 480], [72, 544], [136, 544], [264, 544], [328, 544], [456, 544], [72, 608], [136, 608], [200, 608], [264, 608], [328, 608], [456, 608], [72, 672], [136, 672], [200, 672], [264, 672], [328, 672], [392, 672], [456, 672], [136, 736], [200, 736], [264, 736], [328, 736], [392, 736], [456, 736]];
/** The pour is cut round every pad, via and fiducial: [x, y, radius]. */
const CLEAR: [number, number, number][] = [[372, 188, 12], [328, 188, 12], [284, 188, 12], [240, 188, 12], [196, 188, 12], [152, 188, 12], [192, 525, 10], [168, 525, 10], [192, 543, 10], [168, 543, 10], [406, 634, 10], [396, 634, 10], [386, 634, 10], [376, 634, 10], [366, 634, 10], [356, 634, 10], [406, 698, 10], [396, 698, 10], [386, 698, 10], [376, 698, 10], [406, 762, 11], [354, 762, 11], [192, 498, 12], [168, 498, 12], [354, 786, 12], [56, 150, 16], [56, 750, 16]];
/** Thermal spokes of the ground pads, over their clearance. */
const SPOKES = 'M359 188H385M372 175V201M345 634H367M356 623V645M395 698H417M406 687V709M394 762H418M406 750V774M342 762H366M354 750V774';
const POUR = { x: 32, y: 112, w: 440, h: 696, r: 12 };
const FIDUCIALS: Point[] = [[56, 150], [56, 750], [1544, 750]];
const HOLES: Point[] = [[56, 52], [1544, 52], [56, 848], [1544, 848]];
/** The 8 stitching vias round a mounting hole, as on the front. */
const RING: Point[] = [[28, 0], [20, 20], [0, 28], [-20, 20], [-28, 0], [-20, -20], [0, -28], [20, -20]];
</script>

<template>
  <div class="back-bom">
    <svg
      class="bom__copper"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1600 900"
    >
      <defs>
        <g id="bom-via">
          <circle
            class="bom__via"
            r="6"
          />
          <circle
            class="pcb-drill"
            r="2"
          />
        </g>
        <g id="bom-stitch">
          <circle
            class="bom__via"
            r="4"
          />
          <circle
            class="pcb-drill"
            r="1"
          />
        </g>
      </defs>
      <rect
        class="bom__veil bom__outline"
        x="16"
        y="16"
        width="1568"
        height="868"
        rx="14"
      />
      <rect
        class="bom__pour"
        :x="POUR.x"
        :y="POUR.y"
        :width="POUR.w"
        :height="POUR.h"
        :rx="POUR.r"
      />
      <path
        v-for="(t, i) in TRACES"
        :key="`clear-${i}`"
        class="bom__clear"
        :d="t.d"
        :stroke-width="t.w + 12"
      />
      <circle
        v-for="([x, y, r], i) in CLEAR"
        :key="`ring-${i}`"
        class="bom__clear"
        :cx="x"
        :cy="y"
        :r="r"
      />
      <path
        class="bom__veil bom__spokes"
        :d="SPOKES"
      />
      <path
        v-for="(t, i) in TRACES"
        :key="`trace-${i}`"
        class="bom__veil bom__trace"
        :d="t.d"
        :stroke-width="t.w"
      />
      <use
        v-for="([x, y], i) in VIAS"
        :key="`via-${i}`"
        href="#bom-via"
        :x="x"
        :y="y"
      />
      <use
        v-for="([x, y], i) in STITCH"
        :key="`stitch-${i}`"
        href="#bom-stitch"
        :x="x"
        :y="y"
      />
      <g
        v-for="(p, i) in PADS"
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
          r="15"
        />
        <circle
          class="pcb-drill"
          :cx="x"
          :cy="y"
          r="8"
        />
        <use
          v-for="([dx, dy], k) in RING"
          :key="k"
          href="#bom-stitch"
          :x="x + dx"
          :y="y + dy"
        />
      </g>
      <g
        v-for="([x, y], i) in FIDUCIALS"
        :key="`fid-${i}`"
      >
        <circle
          class="bom__clear"
          :cx="x"
          :cy="y"
          r="13"
        />
        <circle
          class="pcb-pad"
          :cx="x"
          :cy="y"
          r="5"
        />
      </g>
    </svg>
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
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in props.back.bom.rows"
          :key="row.ref"
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
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
