import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { BACK_PLACED, THROUGH_PADS, VIAS, placedPads, type Point } from '../../src/circuit/layout';
import { netOf } from '../../src/circuit/netlist';

/** A debug drawing of the routed back face (PREVIEW=path npm run gen:circuit): not shipped. */
it('draws a preview', () => {
  const out = process.env.PREVIEW;
  if (!out) return;
  const routes = JSON.parse(readFileSync(new URL('../../src/circuit/routes.json', import.meta.url), 'utf8')) as { traces: { net: string; w: number; pts: Point[] }[]; vias: { net: string; x: number; y: number }[] };
  const s: string[] = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 40 700 790" width="1400" height="1580"><rect x="0" y="0" width="1600" height="900" fill="#0f372a"/>'];
  for (const p of BACK_PLACED) s.push(`<rect x="${p.box.x}" y="${p.box.y}" width="${p.box.w}" height="${p.box.h}" fill="#222" stroke="#555" stroke-width=".5"/><text x="${p.box.x}" y="${p.box.y - 1}" font-size="6" fill="#ccc">${p.part.ref}</text>`);
  for (const p of BACK_PLACED.flatMap(placedPads)) s.push(`<rect x="${p.x - p.w / 2}" y="${p.y - p.h / 2}" width="${p.w}" height="${p.h}" fill="${netOf(`${p.ref}.${p.pin}`) ? '#c9a45c' : '#844'}"/>`);
  for (const p of THROUGH_PADS) s.push(`<circle cx="${p.x}" cy="${p.y}" r="${p.w / 2}" fill="#c9a45c"/><text x="${p.x - 3}" y="${p.y - 6}" font-size="4" fill="#9cf">${p.ref}.${p.pin}</text>`);
  for (const t of routes.traces) s.push(`<polyline points="${t.pts.map((q) => q.join(',')).join(' ')}" fill="none" stroke="${t.net === 'GND' ? '#6a6' : t.net === '+3V3' ? '#c66' : '#ddd'}" stroke-width="${t.w}" stroke-linejoin="round"/>`);
  for (const v of [...routes.vias.map((v) => ({ ...v, kind: 'blind' })), ...VIAS.filter((v) => v.kind === 'through')]) s.push(`<circle cx="${v.x}" cy="${v.y}" r="${v.kind === 'through' ? 4 : 3}" fill="${v.kind === 'through' ? '#fff' : v.net === 'GND' ? '#6a6' : '#c66'}"/>`);
  s.push('</svg>');
  writeFileSync(out, s.join('\n'));
});
