// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { LIT, LIVE, renderBackArt } from '../../src/circuit/art';
import { BACK_TRACES } from '../../src/circuit/copper';
import { BACK_PLACED, pointsPath } from '../../src/circuit/layout';
import { linkedTo } from '../../src/circuit/links';
import { BOM, liveLayer } from '../../src/circuit/live';
import { BOM_REFS } from '../../src/circuit/bom';

/*
 * The art of the back face and its live layer (spec 4.10) are written by npm run gen:circuit from the
 * circuit: the files stay what the circuit draws, and the art a static, neutral drawing.
 */
const read = (f: string) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');

describe('the art of the back face', () => {
  it('is what the circuit draws (npm run gen:circuit)', () => {
    expect(read('assets/img/board-back.svg')).toBe(renderBackArt());
    expect(read('assets/img/board-back-small.svg')).toBe(renderBackArt({ refs: false }));
  });

  it('is a static drawing: no script, no style, no filter, nothing fetched', () => {
    for (const svg of [renderBackArt(), renderBackArt({ refs: false })]) {
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1600 900">/);
      expect(svg).not.toMatch(/<script|<style|\sstyle=|filter|<image|<foreignObject/i);
      expect(svg).not.toMatch(/(href|src)="(?!#)/);
      // Its silkscreen in the two colours of the board that read on both masks.
      for (const [, fill] of svg.matchAll(/<g fill="(#[0-9a-f]+)" font-family/g)) expect(['#e8e4da', '#a29e95']).toContain(fill);
    }
  });

  it('draws every trace of the back, every part out of the table with its reference, and the pin names of J6', () => {
    const svg = renderBackArt();
    for (const t of BACK_TRACES) expect(svg).toContain(`d="M${t.pts[0]?.join(' ')}`);
    for (const p of BACK_PLACED.filter((q) => !LIVE.includes(q.part.ref))) expect(svg, p.part.ref).toContain(`>${p.part.ref}</text>`);
    for (const name of ['3V3', 'EN', 'IO0', 'TX', 'RX', 'GND']) expect(svg).toContain(`>${name}</text>`);
    // The parts of the table are live, not drawn here; the small drawing has no reference at all.
    for (const ref of LIVE) expect(svg).not.toContain(`>${ref}</text>`);
    expect(renderBackArt({ refs: false })).not.toMatch(/<text/);
    // Two status LEDs lit, still: a glow, no animation.
    expect(Object.keys(LIT).sort()).toEqual(['D2', 'D3']);
    for (const ref of Object.keys(LIT)) expect(svg).toContain(`url(#glow-${ref})`);
    expect(svg).not.toMatch(/<animate|<set\b/);
  });

  it('weighs little on the wire', () => {
    expect(gzipSync(renderBackArt(), { level: 9 }).length).toBeLessThanOrEqual(24 * 1024);
  });
});

describe('the live layer of the back face', () => {
  it('is what the circuit computes (npm run gen:circuit)', () => {
    expect(JSON.parse(read('circuit/live.json'))).toEqual(liveLayer());
  });

  it('holds the eleven parts of the table, with the links of « Relié à »', () => {
    const live = liveLayer();
    expect(live.parts.map((p) => p.ref)).toEqual([...BOM_REFS]);
    expect([...BOM]).toEqual([...BOM_REFS]);
    for (const p of live.parts) expect(p.links, p.ref).toBe(linkedTo(p.ref).join(' '));
  });

  it('lights traces for every part, and marks the parts out of the table it is linked to', () => {
    const live = liveLayer();
    for (const ref of BOM_REFS) {
      const lit = live.nets.filter((n) => `${n.by} ${n.rev}`.split(' ').includes(ref));
      expect(lit.length, ref).toBeGreaterThan(0);
      // Every lit path is a trace of the back.
      const traces = new Set(BACK_TRACES.map((t) => pointsPath(t.pts)));
      for (const n of lit) expect(traces.has(n.d), n.d).toBe(true);
    }
    // U10 marks the vias of the front parts it serves, U15 its four status LEDs, U16 its crystal.
    const marked = (ref: string) => live.marks.filter((m) => m.by.split(' ').includes(ref));
    expect(marked('U10').length).toBeGreaterThan(8);
    expect(marked('U15').length).toBe(8);
    expect(marked('U16').length).toBe(2);
    // A device of the I²C bus marks nothing of the others.
    expect(marked('U18')).toEqual([]);
  });
});
