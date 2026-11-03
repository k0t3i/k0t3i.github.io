// Independent oracle: the exact texts of Annexe A, written by hand. Never import from src/.
// NB = U+00A0 (before : ; ! ? and before "h"), NN = U+202F (thousands separator).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SITE: { baseUrl: string; email: string; github: string } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/content/site.json', import.meta.url)), 'utf8'),
);

const NB = ' ';
const NN = ' ';

export interface CopyPart {
  id: string;
  ref: string;
  kind: string;
  label: string;
  body?: string;
}

export interface Copy {
  lang: 'fr' | 'en';
  path: string;
  title: string;
  description: string;
  ogImageAlt: string;
  skipLink: string;
  langNavLabel: string;
  header: string;
  heroLead: string;
  heroStrong: string;
  heroSub: string;
  avatarAlt: string;
  pins: string;
  captions: { avatar: string; uptime: string; morse: string };
  switchRef: string;
  switchHidden: string;
  /** JP1, the jumper that switches the board between green and black. */
  theme: { ref: string; green: string; dark: string; switchHidden: string };
  /** SW2 and the back side: the switch, the title, the bill of materials, the populated variant. */
  back: {
    ref: string;
    top: string;
    bot: string;
    switchHidden: string;
    title: string;
    caption: string;
    columns: string[];
    /** Each row: reference, part, value. */
    rows: [string, string, string][];
    /** The title of the populated variant (title is the one of the bill of materials). */
    populatedTitle: string;
    populatedAlt: string;
  };
  marks: { visible: string; hidden: string }[];
  sections: { principles: { id: string; title: string }; connectors: { id: string; title: string } };
  close: string;
  uptime: string;
  notFound: { title: string; text: string; back: string };
  principles: CopyPart[];
  connectors: (CopyPart & { link?: { text: string; href: string }; mediaAlt?: string; contacts?: string[] })[];
}

export const LANG_LINKS = [
  // The accessible name starts with the visible code (WCAG 2.5.3, label in name).
  { text: 'FR', label: 'FR, Français', lang: 'fr', href: '/' },
  { text: 'EN', label: 'EN, English', lang: 'en', href: '/en/' },
];

export const READOUTS = {
  r1: '10kΩ',
  c1: '100nF',
  led1: '20mA',
  d1: '1N4148',
  u2: 'SOIC-8',
  j1: 'KIT 72H',
  j2: 'SPLITR',
  j3: 'MAIL',
};

export const BOOT_SCREENS = ['BOOT...', 'OK'];

export const FR: Copy = {
  lang: 'fr',
  path: '/',
  title: 'Anthony · Ingénieur front-end principal',
  description: `Ingénieur front-end principal depuis 2004${NB}: accessibilité, performance, architecture, debug. Cinq principes et deux projets, sur une carte électronique.`,
  ogImageAlt: `Carte électronique noire${NB}: Front-end, sans raccourcis.`,
  skipLink: 'Aller au contenu',
  langNavLabel: 'Langue',
  header: 'ANTHONY · FRONT-END · REV 2026.11',
  heroLead: 'Front-end,',
  heroStrong: 'sans raccourcis.',
  heroSub:
    'Ingénieur front-end principal. Des interfaces depuis 2004, des circuits depuis plus longtemps encore.',
  avatarAlt: 'Avatar pixel art d’Anthony',
  pins: 'GND VCC SCK MOSI DC CS',
  captions: { avatar: 'DISP1 · avatar', uptime: 'DISP1 · uptime', morse: 'DISP1 · morse' },
  switchRef: 'SW1',
  switchHidden: 'changer l’écran',
  theme: { ref: 'JP1', green: 'VERT', dark: 'NOIR', switchHidden: 'carte noire' },
  back: {
    ref: 'SW2',
    top: 'TOP',
    bot: 'BOT',
    switchHidden: 'face arrière',
    title: 'Face arrière · nomenclature',
    caption: `Nomenclature${NB}: les composants de la carte`,
    columns: ['Repère', 'Composant', 'Valeur'],
    rows: [
      ['U10', 'Vue.js', '2 → 3 · Composition API · SSR'],
      ['U11', 'TypeScript / JavaScript', 'strict · ES modules'],
      ['U12', 'HTML sémantique', 'landmarks · ARIA juste'],
      ['U13', 'CSS', 'layers · container queries · motion'],
      ['U14', 'Accessibilité', 'WCAG 2.2 AA · guidelines produit'],
      ['U15', 'Performance web', 'audits · Core Web Vitals'],
      ['U16', 'Architecture front', 'composants · migrations'],
      ['U17', 'Tests', 'unitaires · e2e · a11y'],
      ['U18', 'Debug', 'navigateurs · réseau · mémoire'],
      ['U19', 'Équipe', 'recrutement · formation · coaching'],
      ['U20', 'Électronique', 'Arduino · Raspberry Pi · IoT'],
    ],
    populatedTitle: 'Face arrière · composants',
    populatedAlt: 'Face arrière de la carte, couverte de composants',
  },
  marks: [
    { visible: 'a11y AA', hidden: 'Accessibilité WCAG 2.2, niveau AA' },
    { visible: 'INTJ-A', hidden: 'Personnalité INTJ-A' },
    { visible: 'Vue 3', hidden: 'Construit avec Vue 3' },
  ],
  sections: {
    principles: { id: 'principes', title: 'Principes' },
    connectors: { id: 'connecteurs', title: 'Projets et contact' },
  },
  close: 'Fermer',
  uptime: `uptime${NB}: 46${NN}000${NB}h à concevoir, coder, débugger, former, manager, apprendre`,
  notFound: {
    title: 'Circuit ouvert',
    text: 'Cette page n’existe pas, ou plus.',
    back: 'Retour à la carte',
  },
  principles: [
    {
      id: 'r1',
      ref: 'R1',
      kind: 'résistance',
      label: 'Je conçois pour durer, pas pour la démo.',
      body: `Fondation Louis Vuitton, Van Cleef & Arpels${NB}: architecture en composants, migrations de plateforme.`,
    },
    {
      id: 'c1',
      ref: 'C1',
      kind: 'condensateur',
      label: 'L’accessibilité n’est pas une option.',
      body: 'Elle fait partie de chaque projet que je mène, du luxe au B2B bancaire. Chez Fircosoft, j’en porte les guidelines pour tout le produit.',
    },
    {
      id: 'led1',
      ref: 'LED1',
      kind: 'LED',
      label: 'La performance se mesure, elle ne se suppose pas.',
      body: 'Audits de performance chez SFEIR, optimisations sur la plupart des projets de luxe.',
    },
    {
      id: 'd1',
      ref: 'D1',
      kind: 'diode',
      label: 'Un bug a toujours une cause. Je la trouve.',
      body: 'Le debug front de Fircosoft passe par moi depuis 2018.',
    },
    {
      id: 'u2',
      ref: 'U2',
      kind: 'circuit intégré',
      label: 'Une équipe solide vaut mieux qu’un héros.',
      body: 'Jusqu’à 20 développeurs front recrutés, formés et suivis chez Valtech. Des formations en entreprise.',
    },
  ],
  connectors: [
    {
      id: 'j1',
      ref: 'J1',
      kind: 'projet',
      label: 'Kit d’urgence',
      body: `Simulateur 3D qui calcule le kit d’urgence de votre foyer (adultes, enfants, de 72${NB}h à 3 semaines). Chaque objet arrive quand la voix le nomme. Un sac d’évacuation par personne, et des listes à cocher en PDF. Contenu comparé aux guides officiels d’une trentaine de pays.`,
      link: { text: 'Ouvrir le simulateur', href: `${SITE.baseUrl}kit-urgence/` },
      mediaAlt: `Le simulateur Kit d’urgence${NB}: une réserve de 3 semaines pour 2 adultes et 4 enfants, avec les objets numérotés en 3D.`,
    },
    {
      id: 'j2',
      ref: 'J2',
      kind: 'projet',
      label: 'SplitR',
      body: 'Application de bureau (Windows, macOS) pour découper, traiter et exporter des fichiers médias simplement, sans la complexité de FFmpeg.',
      link: {
        text: 'Télécharger la dernière version',
        href: 'https://github.com/k0t3i/splitr-releases/releases/latest',
      },
    },
    {
      id: 'j3',
      ref: 'J3',
      kind: 'contact',
      label: 'Contact',
      contacts: [`E-mail${NB}: ${SITE.email}`, `GitHub${NB}: github.com/k0t3i`],
    },
  ],
};

export const EN: Copy = {
  lang: 'en',
  path: '/en/',
  title: 'Anthony · Principal front-end engineer',
  description:
    'Principal front-end engineer since 2004: accessibility, performance, architecture, debugging. Five principles and two projects, on a circuit board.',
  ogImageAlt: 'Black circuit board: Front-end, no shortcuts.',
  skipLink: 'Skip to content',
  langNavLabel: 'Language',
  header: 'ANTHONY · FRONT-END · REV 2026.11',
  heroLead: 'Front-end,',
  heroStrong: 'no shortcuts.',
  heroSub: 'Principal front-end engineer. Building interfaces since 2004, and circuits for even longer.',
  avatarAlt: 'Anthony’s pixel art avatar',
  pins: 'GND VCC SCK MOSI DC CS',
  captions: { avatar: 'DISP1 · avatar', uptime: 'DISP1 · uptime', morse: 'DISP1 · morse' },
  switchRef: 'SW1',
  switchHidden: 'change screen',
  theme: { ref: 'JP1', green: 'GREEN', dark: 'BLACK', switchHidden: 'black board' },
  back: {
    ref: 'SW2',
    top: 'TOP',
    bot: 'BOT',
    switchHidden: 'back side',
    title: 'Back side · bill of materials',
    caption: 'Bill of materials: the parts on this board',
    columns: ['Ref', 'Part', 'Value'],
    rows: [
      ['U10', 'Vue.js', '2 → 3 · Composition API · SSR'],
      ['U11', 'TypeScript / JavaScript', 'strict · ES modules'],
      ['U12', 'Semantic HTML', 'landmarks · ARIA done right'],
      ['U13', 'CSS', 'layers · container queries · motion'],
      ['U14', 'Accessibility', 'WCAG 2.2 AA · product guidelines'],
      ['U15', 'Web performance', 'audits · Core Web Vitals'],
      ['U16', 'Front-end architecture', 'components · migrations'],
      ['U17', 'Testing', 'unit · e2e · a11y'],
      ['U18', 'Debugging', 'browsers · network · memory'],
      ['U19', 'Team', 'hiring · training · coaching'],
      ['U20', 'Electronics', 'Arduino · Raspberry Pi · IoT'],
    ],
    populatedTitle: 'Back side · components',
    populatedAlt: 'Back side of the board, covered with components',
  },
  marks: [
    { visible: 'a11y AA', hidden: 'Accessibility WCAG 2.2, level AA' },
    { visible: 'INTJ-A', hidden: 'Personality INTJ-A' },
    { visible: 'Vue 3', hidden: 'Built with Vue 3' },
  ],
  sections: {
    principles: { id: 'principles', title: 'Principles' },
    connectors: { id: 'connectors', title: 'Projects and contact' },
  },
  close: 'Close',
  uptime: 'uptime: 46,000 h designing, coding, debugging, training, managing, learning',
  notFound: {
    title: 'Open circuit',
    text: 'This page does not exist, or not anymore.',
    back: 'Back to the board',
  },
  principles: [
    {
      id: 'r1',
      ref: 'R1',
      kind: 'resistor',
      label: 'I build to last, not for the demo.',
      body: 'Fondation Louis Vuitton, Van Cleef & Arpels: component architecture, platform migrations.',
    },
    {
      id: 'c1',
      ref: 'C1',
      kind: 'capacitor',
      label: 'Accessibility is not optional.',
      body: 'It is part of every project I lead, from luxury brands to B2B banking. At Fircosoft, I own the accessibility guidelines for the whole product.',
    },
    {
      id: 'led1',
      ref: 'LED1',
      kind: 'LED',
      label: 'Performance is measured, not guessed.',
      body: 'Performance audits at SFEIR, optimisation on most luxury projects.',
    },
    {
      id: 'd1',
      ref: 'D1',
      kind: 'diode',
      label: 'Every bug has a cause. I find it.',
      body: 'Since 2018, front-end debugging at Fircosoft goes through me.',
    },
    {
      id: 'u2',
      ref: 'U2',
      kind: 'chip',
      label: 'A strong team beats a hero.',
      body: 'Up to 20 front-end developers hired, trained and coached at Valtech. Training sessions for companies.',
    },
  ],
  connectors: [
    {
      id: 'j1',
      ref: 'J1',
      kind: 'project',
      label: 'Kit d’urgence',
      body: 'A 3D simulator that plans the emergency kit for your home: adults, children, from 72 hours to 3 weeks. Each item appears when the voice says its name. One evacuation bag for each person, and checklists in PDF. The content is checked against official guides from about thirty countries.',
      link: { text: 'Open the simulator (in French)', href: `${SITE.baseUrl}kit-urgence/` },
      mediaAlt:
        'The Kit d’urgence simulator: a 3-week supply for 2 adults and 4 children, with numbered items in 3D.',
    },
    {
      id: 'j2',
      ref: 'J2',
      kind: 'project',
      label: 'SplitR',
      body: 'A desktop app (Windows, macOS) to split, process and export media files. Simple and fast, without the complexity of FFmpeg.',
      link: {
        text: 'Download the latest version',
        href: 'https://github.com/k0t3i/splitr-releases/releases/latest',
      },
    },
    {
      id: 'j3',
      ref: 'J3',
      kind: 'contact',
      label: 'Contact',
      contacts: [`Email: ${SITE.email}`, 'GitHub: github.com/k0t3i'],
    },
  ],
};
