import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { NETS } from '../../src/circuit/netlist';
import { route } from './route';

it('debug', () => {
  const box = process.env.BOX?.split(',').map(Number);
  if (!box) return;
  const r = route((process.env.ORDER ?? '').split(',').filter(Boolean));
  const g = r.grid;
  if (!g) return;
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = box;
  const names = NETS.map((n) => n.name);
  const lines: string[] = [];
  const legend = new Map<number, string>();
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let y = y0; y <= y1; y++) {
    let line = `${String(y).padStart(4)} `;
    for (let x = x0; x <= x1; x++) {
      const layer = process.env.LAYER === "2" ? 2 : process.env.LAYER === "3" ? 3 : 0;
      const arr = layer && g.inner ? g.inner[layer] : g.owner;
      const o = arr[(y - g.Y0) * g.W + (x - g.X0)] ?? 0;
      if (o === 0) line += '.';
      else if (o === -1) line += '#';
      else {
        if (!legend.has(o)) legend.set(o, chars[legend.size % chars.length] ?? '?');
        line += legend.get(o);
      }
    }
    lines.push(line);
  }
  lines.push([...legend].map(([o, c]) => `${c}=${names[o - 1]}`).join(' '));
  const hops = r.hops.map((h) => `${h.net} ${h.a.join(',')}>${h.b.join(',')}`).join('\n');
  writeFileSync(process.env.OUT ?? 'debug.txt', `${lines.join('\n')}\n${r.failed.join('\n')}\nhops:\n${hops}\n`);
});
