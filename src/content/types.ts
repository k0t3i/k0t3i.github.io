export type Locale = 'fr' | 'en';

export type PartId = 'r1' | 'c1' | 'led1' | 'd1' | 'u2' | 'j1' | 'j2' | 'j3' | 'j4' | 'j5';

export interface PartContent {
  id: PartId;
  /** Reference designator on the board, e.g. R1. */
  ref: string;
  /** Kind of part, e.g. resistor. */
  kind: string;
  /** Silkscreen label of the part, and the title of its sheet. */
  label: string;
  body?: string;
  /** Language of the label when it differs from the page (a French name on the English page). */
  labelLang?: Locale;
  link?: { href: string; text: string };
  /** J1 only. */
  media?: { alt: string };
  /** J5 only: the contact. */
  contacts?: { label: string; href: string; text: string }[];
}

export interface SiteContent {
  locale: Locale;
  meta: { title: string; description: string; ogImageAlt: string };
  skipLink: string;
  langNav: { label: string; links: { text: string; label: string; lang: Locale; href: string }[] };
  header: { name: string; rev: string };
  hero: { lead: string; strong: string; sub: string };
  display: {
    alt: string;
    pins: string;
    captions: { avatar: string; uptime: string; morse: string; game: string };
    /**
     * The mini-game of DISP1 (revision 8), said politely: its rules as it starts, then at the end of a
     * game the pads connected ({n}, the plural as the language counts) and what comes next.
     */
    game: { intro: string; over: { one: string; other: string }; again: string };
    /** Board reference of the tactile switch, e.g. SW1. */
    switchRef: string;
    switchHidden: string;
  };
  /** JP1, the jumper that switches the board between green and black: reference, positions, hidden text. */
  theme: { ref: string; green: string; dark: string; switchHidden: string };
  /**
   * The back side of the board, and SW2, the slide switch that turns the board over: its reference,
   * its two positions and its hidden text; the title of the back side with its bill of materials
   * (one row per skill, ref U10 to U20; the column « Relié à » is derived from the nets of the
   * circuit, content/backNets.ts), and the name of the group of the parts drawn on it.
   */
  back: {
    ref: string;
    top: string;
    bot: string;
    switchHidden: string;
    title: string;
    bom: {
      caption: string;
      columns: { ref: string; part: string; value: string; linked: string };
      rows: { ref: string; part: string; value: string }[];
    };
    group: string;
  };
  marks: { visible: string; hidden: string }[];
  sections: { principles: { id: string; title: string }; connectors: { id: string; title: string } };
  principles: PartContent[];
  connectors: PartContent[];
  close: string;
  /** Read after a link that opens in a new tab (the projects, GitHub): it is visually hidden. */
  newTab: string;
  /** The number of hours goes between the two. */
  uptime: { before: string; after: string };
  notFound: { title: string; text: string; back: string };
}
