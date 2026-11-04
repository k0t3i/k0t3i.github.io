import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { BACK_PADS, grounded, pour, stitching, useRoutes } from '../../src/circuit/copper';
import { route, type Routed } from './route';

/** Routes the back face and writes src/circuit/routes.json (npm run gen:circuit), and a log of what failed. */
it('routes the back face', () => {
  // The fan-out of U10 first, side by side (the bottom and left sides to the connectors, the top to
  // DISP1 and J6), the short local nets, then the long buses that go round it.
  const order = [
    'USB_DP', 'USB_DN', 'USB_DP_C', 'USB_DN_C', 'XTAL_P', 'XTAL_N', 'LNA_IN', 'RF', 'VDD_SPI',
    'FLASH_CLK', 'FLASH_IO0', 'FLASH_IO3', 'FLASH_CS', 'FLASH_IO1', 'FLASH_IO2',
    // Nested fans from the innermost line out: the SPI bus from SCK (its nearest pad), MISO beside MOSI
    // (both run to J3), then DISP1's DC and CS; then ONEWIRE, SD_CS and J1's from EXT1 to EXT4.
    'SPI_SCK', 'SPI_MOSI', 'SPI_MISO', 'DISP_DC', 'DISP_CS',
    'ONEWIRE', 'SD_CS', 'EXT1', 'EXT2', 'EXT3', 'EXT4', 'LED_DRV', 'RTC_INT',
    'EXP_INT', 'EN', 'IO0', 'TXD', 'RXD',
  ];
  // Several passes: each puts the nets that failed in the best pass so far first, in a seeded order
  // of the rest; every pass runs, and the one with the fewest failures, then the fewest hops (the
  // most copper drawn on the back), is kept.
  const passes = Number(process.env.PASSES ?? 16);
  let used: { order: string[]; seed: number } = { order, seed: 0 };
  const best = (): Routed => {
    let r = route(order, 0);
    for (let seed = 1; seed < passes; seed++) {
      // The nets that failed in the best pass so far are routed first (a rip-up and reroute).
      const first = [...new Set(r.failed.map((f) => f.split(':')[0] ?? ''))].filter((n) => !n.includes('.'));
      const next = route([...first, ...order], seed);
      if (next.failed.length < r.failed.length || (next.failed.length === r.failed.length && next.hops.length < r.hops.length)) {
        r = next;
        used = { order: [...first, ...order], seed };
      }
    }
    return r;
  };
  // The ground pins the pour does not reach get a via of their own, placed last: the rest of the
  // routing (same order, same seed) is unchanged.
  let ground: string[] = [];
  let r = best();
  for (let round = 0; round < 3; round++) {
    useRoutes(r);
    const p = pour();
    const g = grounded(p, stitching(p));
    const cut = BACK_PADS.filter((q) => q.net === 'GND' && q.layer === 'B').filter((q) => {
      for (let dy = -q.h / 2; dy <= q.h / 2; dy++) for (let dx = -q.w / 2; dx <= q.w / 2; dx++) if (g.has(p.island(q.x + dx, q.y + dy))) return false;
      return true;
    });
    if (!cut.length) break;
    ground = [...new Set([...ground, ...cut.map((q) => `${q.ref}.${q.pin}`)])];
    r = route(used.order, used.seed, ground);
  }
  const json = `${JSON.stringify({ traces: r.traces.map((t) => ({ net: t.net, w: t.w, pts: t.pts })), vias: r.vias.map((v) => ({ net: v.net, x: v.x, y: v.y })), hops: r.hops })}\n`;
  writeFileSync(new URL('../../src/circuit/routes.json', import.meta.url), json);
  const lines = [`${r.traces.length} traces, ${r.vias.length} vias, ${r.failed.length} failed, ${r.hops.length} hops, ground vias ${ground.join(' ')}`, ...r.failed.map((f) => `FAILED ${f}`)];
  writeFileSync(new URL('../../src/circuit/routes.log', import.meta.url), `${lines.join('\n')}\n`);
});
