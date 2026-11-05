// @vitest-environment node
// Node: the oracle of the copy (tests/helpers/copy.ts) reads site.json from the disk.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { READOUTS as ORACLE_READOUTS, SITE as ORACLE_SITE, absolute } from '../helpers/copy';
import { en } from '../../src/content/en';
import { fr } from '../../src/content/fr';
import { READOUTS } from '../../src/content/readouts';
import { SITE } from '../../src/content/site';
import type { PartContent } from '../../src/content/types';

const SRC = join(process.cwd(), 'src');
const TESTS = join(process.cwd(), 'tests');

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

/** Every text file of src/ but site.json, with its path. */
const sources = (): { file: string; text: string }[] =>
  readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|vue|json|css|svg|html)$/.test(d.name) && d.name !== 'site.json')
    .map((d) => join(d.parentPath, d.name))
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }));

/**
 * Every test file, path from the root, and text; but the oracle (tests/helpers/copy.ts), which reads
 * site.json, and this file, which holds the allowances below.
 */
const testFiles = (): { file: string; text: string }[] =>
  readdirSync(TESTS, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|mjs|js|json)$/.test(d.name))
    .map((d) => relative(process.cwd(), join(d.parentPath, d.name)).split(sep).join('/'))
    .filter((file) => file !== 'tests/helpers/copy.ts' && file !== 'tests/unit/content.spec.ts')
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }));

/*
 * What a test may write that looks like a link of site.json, and is not one, file by file, as
 * written: the ban on a kit-urgence/ FOLDER in the build (it would hide the site of that project,
 * served by another repository at that path), named as a folder by deploy.mjs and its tests; and the
 * git remote of this repository, which starts like the GitHub profile.
 */
const NOT_LINKS: Record<string, string[]> = {
  'tests/static/dist.test.mjs': ["f.startsWith('kit-urgence/')"],
  'tests/unit/deploy.spec.ts': [
    "'kit-urgence/index.html'",
    "'img/kit-urgence/a.jpg'",
    'kit-urgence/ must not exist: https://k0t3i.github.io/kit-urgence/ is another repository',
    "'kit-urgence/ must not exist'",
    "'https://github.com/k0t3i/k0t3i.github.io.git'",
  ],
};

describe('content', () => {
  it('fr and en share the same shape', () => {
    // labelLang exists only on the French names of the English page (J1, J4), everything else must match.
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
    // J1 to J4, the projects, then J5, the contact.
    expect(fr.connectors.map((p) => p.id)).toEqual(['j1', 'j2', 'j3', 'j4', 'j5']);
    expect(en.connectors.filter((p) => p.labelLang === 'fr').map((p) => p.id)).toEqual(['j1', 'j4']);
  });

  it('french typography', () => {
    for (const [path, text] of strings(fr)) {
      expect(text, path).not.toContain("'");
      expect(text, path).not.toMatch(/ [:;!?]/);
    }
  });

  it('marks are the PCB marks of Anthony, six at most, the verified ones framed (decision of 05/11/2026)', () => {
    expect(fr.marks.map((m) => m.visible)).toEqual(['Vue 3', 'a11y AA', 'INTJ-A', 'LH 100', 'IA', 'n8n']);
    expect(en.marks.map((m) => m.visible)).toEqual(['Vue 3', 'a11y AA', 'INTJ-A', 'LH 100', 'AI', 'n8n']);
    for (const c of [fr, en]) {
      expect(c.marks.length).toBeLessThanOrEqual(6);
      expect(c.marks.filter((m) => m.framed).map((m) => m.visible)).toEqual(['a11y AA', 'LH 100']);
    }
  });

  it('the bill of materials lists U10 to U18, Y1 and J6, the same parts in both languages', () => {
    const refs = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6'];
    expect(fr.back.bom.rows.map((r) => r.ref)).toEqual(refs);
    expect(en.back.bom.rows.map((r) => r.ref)).toEqual(refs);
    // The PCB marks belong to the PCB marks only (as words: « IA » is in « ARIA »; the marks have no character special to a pattern).
    const word = (mark: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${mark}($|[^\\p{L}\\p{N}])`, 'u');
    for (const c of [fr, en]) {
      for (const [path, text] of strings(c.back)) {
        for (const mark of c.marks) expect(text, path).not.toMatch(word(mark.visible));
      }
    }
  });

  it('only allowed outbound links', () => {
    const allowed = new Set([
      SITE.baseUrl,
      `${SITE.baseUrl}en/`,
      `${SITE.baseUrl}img/og-fr.jpg`,
      `${SITE.baseUrl}img/og-en.jpg`,
      SITE.github,
      // The link of each project, as site.json gives it.
      ...Object.values(ORACLE_SITE.projects).map((p) => absolute(p.href)),
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
    const hits = sources()
      .filter(({ text }) => email.test(text))
      .map(({ file }) => file);
    expect(hits).toEqual([]);
    expect(SITE.email).toMatch(email);
  });

  it('the names and links of the projects, and the e-mail, are written in site.json only', () => {
    // Anthony's rule (spec §4.4): a name or a link bound to change is written in one place. The copy
    // interpolates them: renaming a product or changing a link in site.json is the only edit.
    const written = [
      ORACLE_SITE.email,
      ORACLE_SITE.github,
      ...Object.values(ORACLE_SITE.projects).flatMap((p) => [p.name, p.href, absolute(p.href)]),
    ];
    expect(Object.keys(ORACLE_SITE.projects)).toHaveLength(4);
    const hits = sources().flatMap(({ file, text }) => written.filter((w) => text.includes(w)).map((w) => `${file}: ${w}`));
    expect(hits).toEqual([]);
    // The tests too: they read them from site.json through the oracle, never write them by hand.
    const inTests = testFiles().flatMap(({ file, text }) => {
      const allowed = NOT_LINKS[file] ?? [];
      // An allowance is only what it says: each one is in its file.
      for (const a of allowed) expect(text.includes(a), `${file}: ${a}`).toBe(true);
      const rest = allowed.reduce((t, a) => t.split(a).join(''), text);
      return written.filter((w) => rest.includes(w)).map((w) => `${file}: ${w}`);
    });
    expect(inTests).toEqual([]);
    // The copy reads them: each name is on the board and each link in a sheet, in both languages.
    for (const c of [fr, en]) {
      const labels = c.connectors.map((p) => p.label);
      const links = c.connectors.map((p) => p.link?.href);
      for (const p of Object.values(ORACLE_SITE.projects)) {
        expect(labels, `${c.locale}: ${p.name}`).toContain(p.name);
        expect(links, `${c.locale}: ${p.href}`).toContain(absolute(p.href));
      }
    }
  });

  it('DISP1 has a readout for every part, as written in annex A', () => {
    expect(READOUTS).toEqual(ORACLE_READOUTS);
  });
});
