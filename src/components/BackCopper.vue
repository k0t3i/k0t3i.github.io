<script setup lang="ts">
import { CLEARANCE, FIDUCIAL, FIDUCIALS, FRONT_PADS, HOLE, HOLES, HOLE_RING, OUTLINE, POUR, SPOKES, STITCH, TRACE, VIA } from '../content/backCopper';
import { BACK_NETS, BACK_PARTS, netPath, pointsPath } from '../content/backNets';
import { BACK_PASSIVES, STUBS, passiveBox, passiveRef, passiveUse, stubPoints } from '../content/backPassives';
import { PACKAGES } from '../lib/packages';

/**
 * The copper of the bottom layer and the passive parts on it: a static drawing, with no input, so a
 * part that lights up on the back face never draws it again (BackFace.vue). In the 1600 x 900 units
 * of the wide board: the edge of the board, the pour and its cuts, the traces of the nets and the
 * short traces of the decoupling capacitors, the stitching vias, the through-hole pads of the front,
 * the mounting holes and fiducials, the passives and their references; then, in its slot, the live
 * layer of the nets that BackFace.vue lights.
 */
const NETS = BACK_NETS.map((n) => netPath(n));
const STUB_PATHS = STUBS.map((s) => pointsPath(stubPoints(s)));
const TRACES = [...NETS, ...STUB_PATHS];
/** The pour is cut back round every part, skill or passive: its footprint, and the clearance. */
const KEEP_OUT = [...BACK_PARTS.map((p) => ({ x: p.x, y: p.y, w: PACKAGES[p.pkg].w, h: PACKAGES[p.pkg].h })), ...BACK_PASSIVES.map(passiveBox)].map((b) => ({
  x: b.x - CLEARANCE.part,
  y: b.y - CLEARANCE.part,
  w: b.w + 2 * CLEARANCE.part,
  h: b.h + 2 * CLEARANCE.part,
}));
const PASSIVE_PARTS = BACK_PASSIVES.map((p) => ({ ...p, use: passiveUse(p), label: passiveRef(p) }));
</script>

<template>
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
      v-for="(d, i) in TRACES"
      :key="`clear-${i}`"
      class="back__clear"
      :d="d"
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
      v-for="(d, i) in NETS"
      :key="`trace-${i}`"
      class="back__veil back__trace"
      :d="d"
      :stroke-width="TRACE"
    />
    <path
      v-for="(d, i) in STUB_PATHS"
      :key="`stub-${i}`"
      class="back__veil back__stub"
      :d="d"
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
    <!-- The passives (PartSprite.vue draws their packages), and their references in silkscreen. -->
    <g class="back__passives">
      <use
        v-for="p in PASSIVE_PARTS"
        :key="p.ref"
        :class="['back__psv', p.tone && `back__psv--${p.tone}`]"
        :href="`#psv-${p.pkg}`"
        :x="p.use.x"
        :y="p.use.y"
        :width="p.use.width"
        :height="p.use.height"
        :transform="p.use.transform"
      />
      <text
        v-for="p in PASSIVE_PARTS"
        :key="`ref-${p.ref}`"
        class="back__psv-ref"
        :x="p.label.x"
        :y="p.label.y"
        :text-anchor="p.label.anchor === 'end' ? 'end' : undefined"
      >{{ p.ref }}</text>
    </g>
    <slot />
  </svg>
</template>
