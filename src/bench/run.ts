import { benchAt, benchTimes, routeOrder, type Bench } from '../lib/bench';

/*
 * The play of the test bench on the back face (revision 11, spec 4.12): a chunk of its own, loaded
 * when the back face comes up in the Konami mode (composables/useBench.ts). Over the circuit, a
 * drawing of its own (aria-hidden): the real traces of the back, read from its art (the picture the
 * face shows, already in the cache), drawn one by one in gold in the order of a router, the power
 * first, then the fan-out of U10; and the status LEDs D2–D5, chased one at a time. The rest of the
 * sequence (the counter, the rows, the stamp) is the page's, from the state given to set().
 */

export interface BenchHost {
  /** The circuit of the back face: the drawing goes over its art. */
  circuit: HTMLElement | null;
  /** The URL of its art. */
  art: string;
  total: number;
  rows: number;
  /** The centre of U10, where the fan-out starts. */
  centre: [number, number];
  /** The centres of D2–D5. */
  leds: [number, number][];
  set(state: Bench): void;
  done(): void;
}

const SVG = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Plays the sequence until its end (done()), or until the returned stop(), which takes it all away. */
export function run(host: BenchHost): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const svg = el('svg', { class: 'back__route', viewBox: '0 0 1600 900', 'aria-hidden': 'true', focusable: 'false' });
  const leds = host.leds.map(([cx, cy]) => svg.appendChild(el('circle', { class: 'back-route__led', cx, cy, r: 11 })));
  let paths: SVGPathElement[] = [];
  host.circuit?.append(svg);

  function play(): void {
    const t0 = performance.now();
    const times = benchTimes(host.total, host.rows);
    let next = 0;
    let drawn = 0;
    let lit = -1;
    const tick = (): void => {
      timer = undefined;
      if (stopped) return;
      const t = performance.now() - t0;
      const s = benchAt(t, host.total, host.rows);
      for (; drawn < Math.min(s.routed, paths.length); drawn++) paths[drawn]?.classList.add('is-on');
      if (s.led !== lit) {
        leds[lit]?.classList.remove('is-lit');
        leds[s.led]?.classList.add('is-lit');
        lit = s.led;
      }
      svg.classList.toggle('is-clear', !s.routing);
      host.set(s);
      if (s.done) return host.done();
      while ((times[next] ?? Infinity) <= t) next++;
      timer = setTimeout(tick, Math.max(0, (times[next] ?? t) - t));
    };
    tick();
  }

  fetch(host.art, { signal: abort.signal })
    .then((r) => r.text())
    .then((text) => {
      if (stopped) return;
      // The traces of the art: the paths of its copper group, each with its width.
      const art = new DOMParser().parseFromString(text, 'image/svg+xml');
      const traces = [...art.querySelectorAll('g[stroke="#fff"] > path')].map((p) => ({ w: Number(p.getAttribute('stroke-width') ?? 2), d: p.getAttribute('d') ?? '' }));
      paths = routeOrder(traces, host.centre).map((i) => {
        const t = traces[i] ?? { w: 2, d: '' };
        return svg.insertBefore(el('path', { class: 'back-route__trace', d: t.d, 'stroke-width': t.w, pathLength: 1 }), leds[0] ?? null);
      });
    })
    // Without its art the bench still runs: the counter, the rows and the stamp.
    .catch(() => {})
    .finally(() => {
      if (!stopped) play();
    });

  return () => {
    stopped = true;
    abort.abort();
    clearTimeout(timer);
    timer = undefined;
    svg.remove();
  };
}
