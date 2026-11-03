import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/content/en';
import { fr } from '../../src/content/fr';
import { READOUTS } from '../../src/content/readouts';
import { SITE } from '../../src/content/site';
import type { PartContent } from '../../src/content/types';

const SRC = join(process.cwd(), 'src');

/** Every string of a value, with its path. */
function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/** The shape of a value: keys and types (the part ids are compared separately). */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  }
  return typeof value;
}

const parts = (c: { principles: PartContent[]; connectors: PartContent[] }) => [...c.principles, ...c.connectors];

describe('content', () => {
  it('fr and en share the same shape', () => {
    // labelLang exists only on the English Kit d'urgence, everything else must match.
    const strip = (c: typeof en) => ({
      ...c,
      connectors: c.connectors.map((p) => {
        const { labelLang, ...rest } = p;
        void labelLang;
        return rest;
      }),
    });
    expect(shape(strip(fr))).toEqual(shape(strip(en)));
    expect(parts(fr).map((p) => p.id)).toEqual(parts(en).map((p) => p.id));
    expect(parts(fr).map((p) => p.link?.href)).toEqual(parts(en).map((p) => p.link?.href));
    expect(parts(fr).map((p) => p.contacts?.length)).toEqual(parts(en).map((p) => p.contacts?.length));
    expect(Object.keys(READOUTS)).toEqual(parts(fr).map((p) => p.id));
    expect(fr.principles).toHaveLength(5);
    expect(fr.connectors).toHaveLength(3);
  });

  it('french typography', () => {
    for (const [path, text] of strings(fr)) {
      expect(text, path).not.toContain("'");
      expect(text, path).not.toMatch(/ [:;!?]/);
    }
  });

  it('marks are the three PCB marks', () => {
    expect(fr.marks.map((m) => m.visible)).toEqual(['a11y AA', 'INTJ-A', 'Vue 3']);
    expect(en.marks.map((m) => m.visible)).toEqual(['a11y AA', 'INTJ-A', 'Vue 3']);
  });

  it('the bill of materials lists U10 to U20, the same parts in both languages', () => {
    const refs = Array.from({ length: 11 }, (_, i) => `U${10 + i}`);
    expect(fr.back.bom.rows.map((r) => r.ref)).toEqual(refs);
    expect(en.back.bom.rows.map((r) => r.ref)).toEqual(refs);
    // The marks a11y AA, INTJ-A and Vue 3 belong to the PCB marks only.
    for (const c of [fr, en]) {
      for (const [path, text] of strings(c.back)) {
        for (const mark of c.marks) expect(text, path).not.toContain(mark.visible);
      }
    }
  });

  it('only allowed outbound links', () => {
    const allowed = new Set([
      SITE.baseUrl,
      `${SITE.baseUrl}en/`,
      `${SITE.baseUrl}kit-urgence/`,
      `${SITE.baseUrl}img/og-fr.jpg`,
      `${SITE.baseUrl}img/og-en.jpg`,
      SITE.github,
      'https://github.com/k0t3i/splitr-releases/releases/latest',
      `mailto:${SITE.email}`,
      'https://schema.org',
    ]);
    for (const c of [fr, en]) {
      const hrefs = [
        ...c.langNav.links.map((l) => l.href),
        ...parts(c).flatMap((p) => [p.link?.href, ...(p.contacts ?? []).map((k) => k.href)]),
      ].filter((h): h is string => Boolean(h));
      expect(hrefs.length).toBeGreaterThan(5);
      for (const href of hrefs) {
        const absolute = href.startsWith('mailto:') ? href : new URL(href, SITE.baseUrl).href;
        expect(allowed.has(absolute), href).toBe(true);
      }
    }
  });

  it('site.json is the only e-mail', () => {
    const email = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
    const hits = readdirSync(SRC, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && /\.(ts|vue|json|css|svg|html)$/.test(d.name) && d.name !== 'site.json')
      .map((d) => join(d.parentPath, d.name))
      .filter((file) => email.test(readFileSync(file, 'utf8')));
    expect(hits).toEqual([]);
    expect(SITE.email).toMatch(email);
  });
});
