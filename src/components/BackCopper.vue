<script lang="ts">
import { defineComponent, h, type VNode } from 'vue';
import { CLEARANCE, FIDUCIAL, FIDUCIALS, FRONT_PADS, HOLE, HOLES, HOLE_RING, OUTLINE, POUR, SPOKES, STITCH, TRACE, VIA } from '../content/backCopper';
import { BACK_NETS, BACK_PARTS, netPath } from '../content/backNets';
import { BACK_PASSIVES, passiveBox, passiveRef, passiveUse } from '../content/backPassives';
import { PACKAGES } from '../lib/packages';
import { PASSIVES, PASSIVE_IDS } from '../lib/passives';

/**
 * The copper of the bottom layer and the passive parts on it: a static drawing, with no input, so a
 * part that lights up on the back face never draws it again (BackFace.vue). In the 1600 x 900 units
 * of the wide board, one shape after the other, in the order they are painted: the edge of the
 * board, the pour and its cuts, the traces of the nets, the stitching vias, the through-hole pads of the front, the mounting holes and
 * fiducials, the passives and their references; then, in its slot, the live layer of the nets that
 * BackFace.vue lights. Its defs hold the via of the stitching and the packages of the passives (one
 * unit for one unit). Drawn by a render function over that list: nothing in it ever changes, so it
 * needs none of the bookkeeping of a template.
 */
type Attrs = Record<string, string | number | undefined>;
interface Shape {
  tag: 'rect' | 'circle' | 'path' | 'use' | 'text';
  attrs: Attrs;
  text?: string;
}

const rect = (cls: string, x: number, y: number, width: number, height: number, rx?: number): Shape => ({ tag: 'rect', attrs: { class: cls, x, y, width, height, rx } });
const circle = (cls: string, cx: number, cy: number, r: number): Shape => ({ tag: 'circle', attrs: { class: cls, cx, cy, r } });
const path = (cls: string, d: string, width?: number): Shape => ({ tag: 'path', attrs: { class: cls, d, 'stroke-width': width } });
const stitch = (x: number, y: number): Shape => ({ tag: 'use', attrs: { href: '#back-stitch', x, y } });

const NETS = BACK_NETS.map(netPath);
/** The pour is cut back round every part, skill or passive: its footprint, and the clearance. */
const KEEP_OUT = [...BACK_PARTS.map((p) => ({ x: p.x, y: p.y, w: PACKAGES[p.pkg].w, h: PACKAGES[p.pkg].h })), ...BACK_PASSIVES.map(passiveBox)];
const { part, trace, pad } = CLEARANCE;

const SHAPES: readonly Shape[] = [
  rect('back__veil back__outline', OUTLINE.x, OUTLINE.y, OUTLINE.w, OUTLINE.h, OUTLINE.r),
  rect('back__pour', POUR.x, POUR.y, POUR.w, POUR.h, POUR.r),
  ...KEEP_OUT.map((b) => rect('back__clear', b.x - part, b.y - part, b.w + 2 * part, b.h + 2 * part, part)),
  ...NETS.map((d) => path('back__clear', d, TRACE + 2 * trace)),
  ...FRONT_PADS.map((p) => circle('back__clear', p.x, p.y, p.r + pad)),
  path('back__veil back__spokes', SPOKES),
  ...NETS.map((d) => path('back__veil back__trace', d, TRACE)),
  ...STITCH.map(([x, y]) => stitch(x, y)),
  ...FRONT_PADS.flatMap((p) => [p.square ? rect('pcb-pad', p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, 1) : circle('pcb-pad', p.x, p.y, p.r), circle('pcb-drill', p.x, p.y, p.drill)]),
  ...HOLES.flatMap(([x, y]) => [circle('pcb-pad', x, y, HOLE.r), circle('pcb-drill', x, y, HOLE.drill), ...HOLE_RING.map(([dx, dy]) => stitch(x + dx, y + dy))]),
  ...FIDUCIALS.flatMap(([x, y]) => [circle('back__clear', x, y, FIDUCIAL.clear), circle('pcb-pad', x, y, FIDUCIAL.r)]),
  // The passives (their packages are symbols of the defs below), then their references in silkscreen.
  ...BACK_PASSIVES.map((p): Shape => ({ tag: 'use', attrs: { class: p.tone ? `back__psv back__psv--${p.tone}` : 'back__psv', href: `#psv-${p.pkg}`, ...passiveUse(p) } })),
  ...BACK_PASSIVES.map((p): Shape => {
    const { x, y, end } = passiveRef(p);
    return { tag: 'text', attrs: { class: 'back__psv-ref', x, y, 'text-anchor': end ? 'end' : undefined }, text: p.ref };
  }),
];

export default defineComponent({
  setup(_, { slots }) {
    return (): VNode =>
      h('svg', { class: 'back__copper', 'aria-hidden': 'true', focusable: 'false', viewBox: '0 0 1600 900' }, [
        h('defs', [
          h('g', { id: 'back-stitch' }, [h('circle', { class: 'back__via', r: VIA.r }), h('circle', { class: 'pcb-drill', r: VIA.drill })]),
          ...PASSIVE_IDS.map((id) => h('symbol', { id: `psv-${id}` }, PASSIVES[id].shapes.map((s) => h(s.el, s.a)))),
        ]),
        ...SHAPES.map((s) => h(s.tag, s.attrs, s.text)),
        slots.default?.(),
      ]);
  },
});
</script>
