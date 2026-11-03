export type Locale = 'fr' | 'en';

export type PartId = 'r1' | 'c1' | 'led1' | 'd1' | 'u2' | 'j1' | 'j2' | 'j3';

export interface PartContent {
  id: PartId;
  /** Reference designator on the board, e.g. R1. */
  ref: string;
  /** Kind of part, e.g. resistor. */
  kind: string;
  /** Silkscreen label of the part (the title of its sheet). */
  label: string;
  title: string;
  body?: string;
  /** Language of label and title when it differs from the page (Kit d'urgence is French). */
  labelLang?: Locale;
  link?: { href: string; text: string };
  /** J1 only. */
  media?: { alt: string };
  /** J3 only. */
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
    captions: { avatar: string; uptime: string; morse: string };
    switchHidden: string;
  };
  marks: { visible: string; hidden: string }[];
  sections: { principles: { id: string; title: string }; connectors: { id: string; title: string } };
  principles: PartContent[];
  connectors: PartContent[];
  close: string;
  /** The number of hours goes between the two. */
  uptime: { before: string; after: string };
  notFound: { title: string; text: string; back: string };
}
