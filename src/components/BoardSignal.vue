<script setup lang="ts">
import { useBoardState } from '../composables/useBoardState';
import type { PartId } from '../content/types';

/*
 * The route of each part on the wide board: from a pad of DISP1 to the first pad of the part, point
 * for point a trace of the static art (assets/img/board-wide.svg, checked by tests/static/art.test).
 */
const ROUTES: { part: PartId; d: string }[] = [
  { part: 'r1', d: 'M1448 188V106L1438 96H1141L1090 147V332L900 522H108L96 534V618L112 634H119' },
  { part: 'c1', d: 'M1404 188V118L1394 108H1146L1102 152V337L905 534H316L304 546V618L320 634H326' },
  { part: 'led1', d: 'M1360 188V130L1350 120H1151L1114 157V342L910 546H524L512 558V618L528 634H535' },
  { part: 'd1', d: 'M1316 188V142L1306 132H1156L1126 162V347L915 558H732L720 570V618L736 634H742' },
  { part: 'u2', d: 'M1272 188V154L1262 144H1161L1138 167V352L928 562V630L944 646H962' },
  { part: 'j1', d: 'M1360 188V466L1342 484H1186L1174 496V622L1186 634H1194' },
  { part: 'j2', d: 'M1316 188V458L1298 476H1178L1166 488V658L1178 670H1194' },
  { part: 'j3', d: 'M1272 188V450L1254 468H1170L1158 480V694L1170 706H1194' },
  { part: 'j4', d: 'M1228 188V442L1210 460H1162L1150 472V730L1162 742H1199' },
  { part: 'j5', d: 'M1228 188V166L1218 156H1166L1150 172V360L1142 368V766L1154 778H1194' },
];

/** The routes the ambient signal runs down now and then, one after the other: the contact (J5) among them. */
const AMBIENT: PartId[] = ['r1', 'led1', 'u2', 'j5'];
const ambient = AMBIENT.map((id) => ROUTES.find((r) => r.part === id)?.d ?? '');

// The two paths of the active part are lit (data-lit: wide.css, motion.css). Client only.
const { activePart } = useBoardState();
const lit = (id: PartId): '' | undefined => (activePart.value === id ? '' : undefined);
</script>

<template>
  <!--
    The live layer of the wide board, drawn over its static art in the same 1600 x 900 units.
    - trace-live: the route of each part. Unlit at rest; the active part (under the pointer or the
      focus) lights its own (data-lit), drawn from DISP1 to the part, and the power-on lights all of them.
    - trace-pulse: the signal that runs ahead of it, a short bright dash on the same route.
    - signal: the ambient set, a short gold dash that runs down four of these routes now and then.
    pathLength="100" makes the dashes a share of each route, whatever its length.
  -->
  <svg
    class="board__signal"
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 1600 900"
  >
    <g class="board__live">
      <path
        v-for="r in ROUTES"
        :key="r.part"
        class="trace-live"
        :data-part="r.part"
        :data-lit="lit(r.part)"
        pathLength="100"
        :d="r.d"
      />
      <path
        v-for="r in ROUTES"
        :key="r.part"
        class="trace-pulse"
        :data-part="r.part"
        :data-lit="lit(r.part)"
        pathLength="100"
        :d="r.d"
      />
    </g>
    <g class="board__ambient">
      <path
        v-for="d in ambient"
        :key="d"
        class="signal"
        pathLength="100"
        :d="d"
      />
    </g>
  </svg>
</template>
