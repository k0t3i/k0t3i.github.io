import type { BomRowContent } from '../content/types';
import { BOM_LINKS } from './bomLinks';

/**
 * The bill of materials of the back face (spec 4.10, revision 9): its eleven parts, each a real part
 * of the circuit and a skill, and the column « Relié à » computed from the netlist (links.ts, its
 * result written into bomLinks.ts by tests/unit/circuit-bom.spec.ts), never by hand. The table, the
 * links that light the parts and the accessible name of each part all come from bomRows(): one source.
 */

export const BOM_REFS = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6'] as const;
export type BomRef = (typeof BOM_REFS)[number];
const isBomRef = (ref: string): ref is BomRef => (BOM_REFS as readonly string[]).includes(ref);

/**
 * References that follow each other (the same letters, numbers one apart), three or more, as a range:
 * J1, J2, J3, J4, J5 gives J1–J5 (an en dash). The order is kept.
 */
export function refRanges(refs: readonly string[]): string[] {
  const split = (r: string): [string, number] | null => {
    const m = /^([A-Z]+)(\d+)$/.exec(r);
    return m ? [m[1] ?? '', Number(m[2])] : null;
  };
  const out: string[] = [];
  for (let i = 0; i < refs.length; ) {
    const head = split(refs[i] ?? '');
    let j = i + 1;
    if (head) {
      while (j < refs.length) {
        const next = split(refs[j] ?? '');
        if (!next || next[0] !== head[0] || next[1] !== head[1] + (j - i)) break;
        j++;
      }
    }
    if (j - i >= 3) out.push(`${refs[i]}–${refs[j - 1]}`);
    else out.push(...refs.slice(i, j));
    i = j;
  }
  return out;
}

/**
 * A text as an accessible name or description reads it: the soft hyphens and word joiners of the table
 * are its visible typography only (where a long name may break, a slash that must not), so they go.
 */
export const plain = (text: string): string => text.replace(/[­⁠]/g, '');

/** The first letter as a capital: the part and the skill are written as they read in a sentence. */
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export interface BomRow {
  ref: BomRef;
  /**
   * Line 1: the skill (capitalized) and its details, the main line; line 2: the real part
   * (capitalized) and its value, read second (Anthony, 05/11/2026).
   */
  part: string;
  value: string;
  skill: string;
  details: string;
  /** Its result on the test bench of the Konami mode (revision 11). */
  result: string;
  /** The accessible name of the part: « {repère}, {compétence}, {composant} » (Anthony, 05/11/2026), in plain text. */
  name: string;
  /** Every part it is linked to (data-links, what lights up). */
  links: string[];
  /** The same, as printed in « Relié à »: three references or more that follow each other as a range. */
  linked: string[];
}

/** The rows of the table, from the text of each row (content/fr.ts, en.ts) and the links of the netlist. */
export function bomRows(rows: readonly BomRowContent[]): BomRow[] {
  return rows.map((row) => {
    if (!isBomRef(row.ref)) throw new Error(`${row.ref} is not a part of the bill of materials`);
    const links = [...BOM_LINKS[row.ref]];
    return {
      ref: row.ref,
      part: capitalize(row.part),
      value: row.value,
      skill: capitalize(row.skill),
      details: row.details,
      result: row.result,
      name: plain(`${row.ref}, ${row.skill}, ${row.part}`),
      links,
      linked: refRanges(links),
    };
  });
}
