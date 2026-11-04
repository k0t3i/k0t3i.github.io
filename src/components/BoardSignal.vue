<script setup lang="ts">
import { FRONT_ROUTES, pointsPath } from '../circuit/front';
import { useBoardState } from '../composables/useBoardState';
import type { PartId } from '../content/types';

/*
 * The route of each part on the wide board: its real trace on the front (circuit/front.ts), the way
 * its current flows, from the via where its signal comes up from the back (from R1 for LED1, out of
 * the receptacle for J5). The static art draws the same copper (assets/img/board-wide.svg, generated
 * from the same data: tests/unit/front-copper.spec.ts).
 */
const ROUTES = (Object.keys(FRONT_ROUTES) as PartId[]).map((part) => ({ part, d: pointsPath(FRONT_ROUTES[part].pts) }));

/** The routes the ambient signal runs down now and then, one after the other: R1 then LED1, D1, and the power out of J5. */
const AMBIENT: PartId[] = ['r1', 'led1', 'd1', 'j5'];
const ambient = AMBIENT.map((id) => ROUTES.find((r) => r.part === id)?.d ?? '');

// The two paths of the active part are lit (data-lit: wide.css, motion.css). Client only.
const { activePart } = useBoardState();
const lit = (id: PartId): '' | undefined => (activePart.value === id ? '' : undefined);
</script>

<template>
  <!--
    The live layer of the wide board, drawn over its static art in the same 1600 x 900 units.
    - trace-live: the route of each part. Unlit at rest; the active part (under the pointer or the
      focus) lights its own (data-lit), drawn the way its current flows, and the power-on lights all of them.
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
