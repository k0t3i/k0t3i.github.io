<template>
  <!--
    The live layer of the wide board, drawn over its static art (assets/img/board-wide.svg) in the
    same 1600 x 900 units. Every path here repeats a trace of the art, point for point.
    - trace-live: the route from a pad of DISP1 to the first pad of each part. Unlit at rest; the
      part under the pointer or the focus lights its own.
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
        class="trace-live"
        data-part="r1"
        pathLength="100"
        d="M1448 188V106L1438 96H1141L1090 147V332L900 522H108L96 534V618L112 634H119"
      />
      <path
        class="trace-live"
        data-part="c1"
        pathLength="100"
        d="M1404 188V118L1394 108H1146L1102 152V337L905 534H316L304 546V618L320 634H326"
      />
      <path
        class="trace-live"
        data-part="led1"
        pathLength="100"
        d="M1360 188V130L1350 120H1151L1114 157V342L910 546H524L512 558V618L528 634H535"
      />
      <path
        class="trace-live"
        data-part="d1"
        pathLength="100"
        d="M1316 188V142L1306 132H1156L1126 162V347L915 558H732L720 570V618L736 634H742"
      />
      <path
        class="trace-live"
        data-part="u2"
        pathLength="100"
        d="M1272 188V154L1262 144H1161L1138 167V352L928 562V630L944 646H962"
      />
      <path
        class="trace-live"
        data-part="j1"
        pathLength="100"
        d="M1272 188V466L1254 484H1186L1174 496V622L1186 634H1194"
      />
      <path
        class="trace-live"
        data-part="j2"
        pathLength="100"
        d="M1228 188V450L1210 468H1174L1162 480V686L1174 698H1194"
      />
      <path
        class="trace-live"
        data-part="j3"
        pathLength="100"
        d="M1228 188V166L1218 156H1166L1150 172V750L1162 762H1194"
      />
    </g>
    <g class="board__ambient">
      <path
        class="signal"
        pathLength="100"
        d="M1448 188V106L1438 96H1141L1090 147V332L900 522H108L96 534V618L112 634H119"
      />
      <path
        class="signal"
        pathLength="100"
        d="M1360 188V130L1350 120H1151L1114 157V342L910 546H524L512 558V618L528 634H535"
      />
      <path
        class="signal"
        pathLength="100"
        d="M1272 188V154L1262 144H1161L1138 167V352L928 562V630L944 646H962"
      />
      <path
        class="signal"
        pathLength="100"
        d="M1228 188V166L1218 156H1166L1150 172V750L1162 762H1194"
      />
    </g>
  </svg>
</template>
