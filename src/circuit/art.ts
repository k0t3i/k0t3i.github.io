import { BACK_PADS, BACK_TRACES, POUR_CLEAR, VIA, backVias, pour, stitching } from './copper';
import { BACK_PLACED, CIRCUIT, THROUGH_PADS, placedPads, pointsPath, type PlacedPart, type Point } from './layout';
import { PARTS } from './netlist';

/**
 * The art of the back face (spec 4.10): a static drawing of its copper and of every part that is not
 * one of the eleven of the bill of materials (those are live, BackFace.vue), as a real bottom side
 * shows them: the edge of the board, the ground pour cut back round the other nets and stitched to
 * the ground plane, the traces, the vias (through ones larger, with their drill), the through-hole
 * pads of the front seen from behind, the mounting holes and fiducials, the passive parts in their
 * materials with their silkscreen references, the two status LEDs that are on (lit, still), the pin
 * names of the debug header. Neutral, for both boards: copper under the mask is a white veil, gold,
 * drills and silkscreen solid (as assets/img/board-wide.svg). Written to
 * src/assets/img/board-back.svg by npm run gen:circuit; tests/unit/circuit-art.spec.ts keeps the
 * file equal to this function. `refs: false` draws it without the small references (for phones,
 * where they would be specks).
 */

const GOLD = '#c9a45c';
const DRILL = '#050506';
const SILK = '#a29e95';
const MONO = 'JetBrains Mono,ui-monospace,Consolas,Menlo,monospace';

/** The eleven parts of the bill of materials are drawn live, not here. */
export const LIVE = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6'];

/** The status LEDs that are on (driven by U15): their colours. */
export const LIT: Readonly<Record<string, string>> = { D2: '#7fe08a', D3: '#ffb062' };
const LENS: Readonly<Record<string, string>> = { green: '#3e9e52', amber: '#c9822f', red: '#a8463c', blue: '#3c64a8' };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A part as placed, its body on the face. */
function bodyOf(p: PlacedPart): { x: number; y: number; w: number; h: number } {
  const b = p.fp.body;
  const quarter = p.rot === 90 || p.rot === 270;
  const [bw, bh] = quarter ? [b.h, b.w] : [b.w, b.h];
  const [bx, by] = p.rot === 90 ? [p.box.w - b.y - b.h, b.x] : p.rot === 180 ? [p.box.w - b.x - b.w, p.box.h - b.y - b.h] : p.rot === 270 ? [b.y, p.box.h - b.x - b.w] : [b.x, b.y];
  return { x: p.x + bx, y: p.y + by, w: bw, h: bh };
}

/** Where the reference of a passive goes: beside it, on the side with room, at the size of the silkscreen of passives. */
function refAt(p: PlacedPart): { x: number; y: number; anchor: string } {
  const { box } = p;
  const wide = box.w >= box.h;
  return wide ? { x: box.x + box.w / 2, y: box.y - 3, anchor: 'middle' } : { x: box.x + box.w + 3, y: box.y + box.h / 2 + 3, anchor: 'start' };
}

export function renderBackArt({ refs = true }: { refs?: boolean } = {}): string {
  const out: string[] = [];
  const push = (s: string) => out.push(s);
  push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">');
  push('<!-- The back face of the board of k0t3i.github.io, 1600 x 900 units: generated from src/circuit (npm run gen:circuit). -->');
  push('<defs>');
  // The pour, cut back round the copper of the other nets.
  const p = pour();
  push(`<mask id="cut"><rect x="${CIRCUIT.x}" y="${CIRCUIT.y}" width="${CIRCUIT.w}" height="${CIRCUIT.h}" rx="12" fill="#fff"/>`);
  const cuts = BACK_TRACES.filter((t) => t.net !== 'GND');
  for (const t of cuts) push(`<path d="${pointsPath(t.pts)}" fill="none" stroke="#000" stroke-width="${t.w + 2 * POUR_CLEAR}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const q of BACK_PADS.filter((x) => x.net !== 'GND')) {
    if (q.round) push(`<circle cx="${q.x}" cy="${q.y}" r="${q.w / 2 + POUR_CLEAR}" fill="#000"/>`);
    else push(`<rect x="${r1(q.x - q.w / 2 - POUR_CLEAR)}" y="${r1(q.y - q.h / 2 - POUR_CLEAR)}" width="${q.w + 2 * POUR_CLEAR}" height="${q.h + 2 * POUR_CLEAR}" rx="2" fill="#000"/>`);
  }
  for (const v of backVias().filter((x) => x.net !== 'GND')) push(`<circle cx="${v.x}" cy="${v.y}" r="${(v.kind === 'through' ? VIA.through : VIA.blind) + POUR_CLEAR}" fill="#000"/>`);
  push('</mask>');
  push(`<g id="sv"><circle r="${VIA.blind}" fill="#fff" fill-opacity=".09"/><circle r="1" fill="${DRILL}"/></g>`);
  push(`<g id="tv"><circle r="${VIA.through}" fill="#fff" fill-opacity=".16"/><circle r="1.5" fill="${DRILL}"/></g>`);
  push(`<g id="bv"><circle r="${VIA.blind}" fill="#fff" fill-opacity=".16"/><circle r="1" fill="${DRILL}"/></g>`);
  for (const [ref, colour] of Object.entries(LIT)) {
    push(`<radialGradient id="glow-${ref}"><stop offset="0" stop-color="${colour}" stop-opacity=".55"/><stop offset=".45" stop-color="${colour}" stop-opacity=".16"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`);
  }
  push('</defs>');
  // The edge of the board, the pour, the traces.
  push('<rect x="16" y="16" width="1568" height="868" rx="14" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width="2"/>');
  push(`<rect x="${CIRCUIT.x}" y="${CIRCUIT.y}" width="${CIRCUIT.w}" height="${CIRCUIT.h}" rx="12" fill="#fff" fill-opacity=".035" mask="url(#cut)"/>`);
  push('<g fill="none" stroke="#fff" stroke-opacity=".18" stroke-linecap="round" stroke-linejoin="round">');
  for (const t of BACK_TRACES) push(`<path stroke-width="${t.w}" d="${pointsPath(t.pts)}"/>`);
  push('</g>');
  // Stitching vias, then the vias of the circuit.
  push('<g>');
  for (const [x, y] of stitching(p)) push(`<use href="#sv" x="${x}" y="${y}"/>`);
  for (const v of backVias()) push(`<use href="#${v.kind === 'through' ? 'tv' : 'bv'}" x="${v.x}" y="${v.y}"/>`);
  push('</g>');
  // The through-hole pads of the front, seen from behind.
  push(`<g fill="${GOLD}">`);
  for (const q of THROUGH_PADS) {
    if (q.round) push(`<circle cx="${q.x}" cy="${q.y}" r="${q.w / 2}"/>`);
    else push(`<rect x="${q.x - q.w / 2}" y="${q.y - q.h / 2}" width="${q.w}" height="${q.h}" rx="1"/>`);
  }
  push('</g>');
  push(`<g fill="${DRILL}">`);
  for (const q of THROUGH_PADS) push(`<circle cx="${q.x}" cy="${q.y}" r="${q.w >= 12 ? 3 : q.w >= 10 ? 2 : 1.5}"/>`);
  push('</g>');
  // Mounting holes with their ring of vias, fiducials.
  for (const [x, y] of [[56, 52], [1544, 52], [56, 848], [1544, 848]] as Point[]) {
    push(`<circle cx="${x}" cy="${y}" r="15" fill="${GOLD}"/><circle cx="${x}" cy="${y}" r="8" fill="${DRILL}"/>`);
    for (const [dx, dy] of [[28, 0], [20, 20], [0, 28], [-20, 20], [-28, 0], [-20, -20], [0, -28], [20, -20]] as Point[]) push(`<use href="#sv" x="${x + dx}" y="${y + dy}"/>`);
  }
  for (const [x, y] of [[56, 150], [56, 750], [1544, 750]] as Point[]) push(`<circle cx="${x}" cy="${y}" r="13" fill="#fff" fill-opacity=".03"/><circle cx="${x}" cy="${y}" r="5" fill="${GOLD}"/>`);
  // The silkscreen outline of each package (the live parts too), clear of its pads, and the dot of pin 1.
  push(`<g fill="none" stroke="${SILK}" stroke-opacity=".45">`);
  for (const q of BACK_PLACED.filter((x) => ['qfn', 'gull', 'can', 'ufl', 'header', 'xtal'].includes(x.fp.look))) {
    const m = 3;
    push(`<rect x="${q.box.x - m}" y="${q.box.y - m}" width="${q.box.w + 2 * m}" height="${q.box.h + 2 * m}" rx="1.5"/>`);
  }
  push('</g>');
  push(`<g fill="${SILK}" fill-opacity=".7">`);
  for (const q of BACK_PLACED.filter((x) => x.fp.look === 'qfn' || x.fp.look === 'gull')) {
    const pin1 = placedPads(q).find((p0) => p0.pin === '1');
    if (pin1) push(`<circle cx="${r1(pin1.x + (pin1.x < q.box.x + q.box.w / 2 ? -1 : 1) * (pin1.w / 2 + 6))}" cy="${r1(pin1.y + (pin1.y < q.box.y + q.box.h / 2 ? -1 : 1) * (pin1.h / 2 + 3))}" r="1.5"/>`);
  }
  push('</g>');
  // The parts that are not of the bill of materials: pads, then their bodies in their materials.
  const drawn = BACK_PLACED.filter((q) => !LIVE.includes(q.part.ref));
  push(`<g fill="${GOLD}">`);
  for (const q of drawn.flatMap(placedPads)) {
    if (q.round) push(`<circle cx="${q.x}" cy="${q.y}" r="${q.w / 2}"/>`);
    else push(`<rect x="${r1(q.x - q.w / 2)}" y="${r1(q.y - q.h / 2)}" width="${q.w}" height="${q.h}" rx=".5"/>`);
  }
  push('</g>');
  for (const q of drawn) {
    const b = bodyOf(q);
    const look = q.fp.look;
    const value = PARTS.find((x) => x.ref === q.part.ref)?.value ?? '';
    const vertical = b.h > b.w;
    if (look === 'chip' && q.part.ref.startsWith('R')) {
      push(`<rect x="${b.x + 2}" y="${b.y}" width="${b.w - 4}" height="${b.h}" fill="#1c1c1e"/>`);
      push(vertical ? `<rect x="${b.x + b.w / 2 - 1}" y="${b.y + 4}" width="2" height="${b.h - 8}" fill="#e8e4da" fill-opacity=".55"/>` : `<rect x="${b.x + 4}" y="${b.y + b.h / 2 - 1}" width="${b.w - 8}" height="2" fill="#e8e4da" fill-opacity=".55"/>`);
    } else if (look === 'chip' && q.part.ref.startsWith('L')) {
      push(`<rect x="${b.x + 2}" y="${b.y}" width="${b.w - 4}" height="${b.h}" fill="#3a3a3c"/>`);
    } else if (look === 'chip') {
      push(`<rect x="${b.x + 2}" y="${b.y}" width="${b.w - 4}" height="${b.h}" fill="#b79f7d"/>`);
    } else if (look === 'led') {
      const tone = LENS[value] ?? '#888';
      push(`<rect x="${b.x + 2}" y="${b.y}" width="${b.w - 4}" height="${b.h}" fill="#e8e4da"/>`);
      const lit = LIT[q.part.ref];
      const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
      push(`<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" rx="2" fill="${lit ?? tone}"/>`);
      if (lit) push(`<circle cx="${cx}" cy="${cy}" r="22" fill="url(#glow-${q.part.ref})"/>`);
    } else if (look === 'xtal') {
      push(`<rect x="${b.x}" y="${b.y + 1}" width="${b.w}" height="${b.h - 2}" rx="3" fill="#bdbdb8"/>`);
      push(`<rect x="${b.x + 3}" y="${b.y + 4}" width="${b.w - 6}" height="${b.h - 8}" rx="2" fill="none" stroke="#8e8e8a"/>`);
    } else if (look === 'ufl') {
      const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
      push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" fill="#d2d2cc"/>`);
      push(`<circle cx="${cx}" cy="${cy}" r="${Math.min(b.w, b.h) / 2 - 2}" fill="none" stroke="#8e8e8a" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="3" fill="${GOLD}"/>`);
    } else if (look === 'tp') {
      const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
      push(`<circle cx="${cx}" cy="${cy}" r="3" fill="${DRILL}" fill-opacity=".6"/>`);
    }
  }
  // Their references, and the pin names of the debug header J6.
  if (refs) {
    push(`<g fill="${SILK}" font-family="${MONO}" font-size="8" letter-spacing=".3">`);
    for (const q of drawn) {
      const { x, y, anchor } = refAt(q);
      push(`<text x="${r1(x)}" y="${r1(y)}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}>${q.part.ref}</text>`);
    }
    const j6 = BACK_PLACED.find((q) => q.part.ref === 'J6');
    if (j6) {
      const names = ['3V3', 'EN', 'IO0', 'TX', 'RX', 'GND'];
      for (const pad of placedPads(j6)) push(`<text x="${pad.x}" y="${j6.box.y + j6.box.h + 12}" text-anchor="middle">${names[Number(pad.pin) - 1] ?? ''}</text>`);
    }
    push('</g>');
  }
  push('</svg>');
  return `${out.join('\n')}\n`;
}
