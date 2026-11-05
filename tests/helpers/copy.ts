// Independent oracle: the exact texts of Annexe A, written by hand. Never import from src/.
// NB = U+00A0 (before : ; ! ? and before "h"), NN = U+202F (thousands separator).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The names and links bound to change, read from site.json, the one place they are written (spec
 * §4.4, Anthony's rule of 04/11/2026): the site URL, the e-mail, the GitHub profile, and the name and
 * link of each project. The texts written by hand below hold the wording around them, never them.
 */
export const SITE: {
  baseUrl: string;
  email: string;
  github: string;
  projects: Record<'kitUrgence' | 'splitr' | 'mycard' | 'monscoreimmo', { name: string; href: string }>;
  // A path from a string, not a URL object: happy-dom replaces URL in the unit tests of components.
} = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/content/site.json'), 'utf8'));

/** A link of site.json as the page writes it: absolute, a relative one resolved against the site URL. */
export const absolute = (href: string): string => new URL(href, SITE.baseUrl).href;

const { kitUrgence: KIT, splitr: SPLITR, mycard: MYCARD, monscoreimmo: SCORE } = SITE.projects;
/** The GitHub profile as its link text shows it: the address without its scheme. */
export const GITHUB_TEXT = SITE.github.replace(/^https?:\/\//, '');

const NB = ' ';
const NN = ' ';
/**
 * The soft hyphens and word joiners of the table are its visible typography only: an accessible name
 * or description is plain text, without them.
 */
export const plain = (text: string): string => text.replace(/[­⁠]/g, '');
/** A soft hyphen (U+00AD): where a long name of the table may break. */
const SH = '­';
/** A word joiner (U+2060), round the slash of « E/S » and « I/O »: no line breaks inside them. */
const WJ = '⁠';

export interface CopyPart {
  id: string;
  ref: string;
  kind: string;
  label: string;
  /** The language of the label and the title, when it is not the language of the page (a French name on /en/). */
  lang?: 'fr';
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
  captions: { avatar: string; uptime: string; morse: string; game: string };
  /** The mini-game of DISP1 (revision 8): said politely as it starts, and when a game is over. */
  game: { intro: string; over: (pads: number) => string };
  switchRef: string;
  switchHidden: string;
  /** The test keypad (revision 10): the name of its group, then of its keys, the cross then B and A. */
  keypad: { group: string; keys: string[] };
  /** JP1, the jumper that switches the board between green and black. */
  theme: { ref: string; green: string; dark: string; switchHidden: string };
  /** SW2 and the back side: the switch, the title, the bill of materials. */
  back: {
    ref: string;
    top: string;
    bot: string;
    switchHidden: string;
    title: string;
    caption: string;
    columns: string[];
    /** The rows of the bill of materials (revision 9), see BomRow. */
    rows: BomRow[];
    /** The accessible name of the group of the parts drawn on the back face. */
    group: string;
  };
  marks: { visible: string; hidden: string; framed?: true }[];
  sections: { principles: { id: string; title: string }; connectors: { id: string; title: string } };
  close: string;
  /** Read after the text of a link that opens in a new tab (revision 8), visually hidden. */
  newTab: string;
  uptime: string;
  notFound: { title: string; text: string; back: string };
  principles: CopyPart[];
  connectors: (CopyPart & { link?: { text: string; href: string }; mediaAlt?: string; contacts?: string[] })[];
}

/**
 * A row of the bill of materials of revision 9 (spec 4.10, approved by Anthony on 04/11/2026): the
 * reference, the part, line 1 of the value cell (the real part and its value), line 2 (the skill, then
 * its details), the column « Relié à » as printed (ranges with an en dash), and the accessible name
 * of the part drawn on the circuit, « {repère}, {compétence}, {composant} » (Anthony, 05/11/2026).
 */
export interface BomRow {
  ref: string;
  part: string;
  value: string;
  skill: string;
  linked: string;
  name: string;
}

/** « Relié à » of a part with no signal link. */
export const BOM_NONE = '—';

/** The skill alone, and its details: line 2 cut at its first dot. */
export const bomSkill = (r: BomRow): string => r.skill.slice(0, r.skill.indexOf(' · '));
export const bomDetails = (r: BomRow): string => r.skill.slice(r.skill.indexOf(' · ') + 3);

/**
 * The cells of a row as the table prints them, each line across two cells (Anthony, 05/11/2026): the
 * skill over its part, the details of the skill over the value of the part.
 */
export const bomCells = (r: BomRow): string[] => [r.ref, `${bomSkill(r)} ${r.part}`, `${bomDetails(r)} ${r.value}`, r.linked];

/** Every reference of a « Relié à », its ranges spelt out: « U10 · D2–D5 » gives U10, D2, D3, D4, D5. */
export function bomRefs(linked: string): string[] {
  if (linked === BOM_NONE) return [];
  return linked.split(' · ').flatMap((item) => {
    const m = /^([A-Z]+)(\d+)–\1(\d+)$/.exec(item);
    if (!m) return [item];
    const [, letters, from, to] = m;
    return Array.from({ length: Number(to) - Number(from) + 1 }, (_, i) => `${letters}${Number(from) + i}`);
  });
}

const bom = (rows: [string, string, string, string, string, string][]): BomRow[] =>
  rows.map(([ref, part, value, skill, linked, name]) => ({ ref, part, value, skill, linked, name }));

export const LANG_LINKS = [
  // The accessible name starts with the visible code (WCAG 2.5.3, label in name).
  { text: 'FR', label: 'FR, Français', lang: 'fr', href: '/' },
  { text: 'EN', label: 'EN, English', lang: 'en', href: '/en/' },
];

export const READOUTS = {
  r1: '10kΩ',
  c1: '10µF',
  led1: '20mA',
  d1: 'BAT42W',
  u2: 'SOIC-8',
  j1: 'KIT 72H',
  j2: 'SPLITR',
  j3: 'MYCARD',
  j4: 'SCORE',
  j5: 'MAIL',
};

export const BOOT_SCREENS = ['BOOT...', 'OK'];

/**
 * The pixel words of the mini-game « Routage » (revision 8), the same in both languages: its title,
 * the key that plays (in a key cap), and the end of a game (a failed design rule check) with its score.
 */
export const GAME_WORDS = { title: 'ROUTE', key: 'A', over: 'DRC ERR' };

/** SW1 (spec 4.9): the uptime in large pixel digits, followed by H; then « HELLO » in Morse code on LED1. */
export const UPTIME_UNIT = 'H';
export const MORSE_MESSAGE = 'HELLO';

/**
 * The nets of the back face (annex A, « Carte des liaisons », approved by Anthony on 03/11/2026):
 * each one a trace between two parts, the same in both languages. Revision 9: Y1 and J6 take the places
 * of U19 and U20 in this drawing, until the copper of revision 9 replaces it.
 */
export const BACK_NETS: [string, string, string][] = [
  ['N1', 'U10', 'U11'],
  ['N2', 'U10', 'U16'],
  ['N3', 'U11', 'U17'],
  ['N4', 'U12', 'U13'],
  ['N5', 'U12', 'U14'],
  ['N6', 'U13', 'U15'],
  ['N7', 'U14', 'U17'],
  ['N8', 'U15', 'U18'],
  ['N9', 'U16', 'Y1'],
  ['N10', 'U14', 'Y1'],
  ['N11', 'U18', 'J6'],
];

export const FR: Copy = {
  lang: 'fr',
  path: '/',
  title: 'Anthony · Ingénieur front-end principal',
  description: `Ingénieur front-end principal depuis 2004${NB}: accessibilité, performance, architecture, debug. Cinq principes et quatre projets, sur une carte électronique.`,
  ogImageAlt: `Carte électronique verte${NB}: Front-end, sans raccourcis.`,
  skipLink: 'Aller au contenu',
  langNavLabel: 'Langue',
  header: 'ANTHONY · FRONT-END · REV 2026.11',
  heroLead: 'Front-end,',
  heroStrong: 'sans raccourcis.',
  heroSub:
    'Ingénieur front-end principal. Des interfaces depuis 2004, des circuits depuis plus longtemps encore.',
  avatarAlt: 'Avatar pixel art d’Anthony',
  pins: 'GND VCC SCK MOSI DC CS',
  captions: { avatar: 'DISP1 · avatar', uptime: 'DISP1 · uptime', morse: 'DISP1 · morse', game: 'DISP1 · routage' },
  game: {
    intro: 'Mini-jeu Routage. Flèches, pavé ou glisser sur l’écran pour diriger, A ou toucher l’écran pour jouer, Échap ou SW1 pour quitter.',
    // 0 and 1 take the singular in French.
    over: (n) => `Partie finie${NB}: ${n} ${n <= 1 ? 'pastille reliée' : 'pastilles reliées'}. A pour rejouer, Échap pour quitter.`,
  },
  switchRef: 'SW1',
  switchHidden: 'changer l’écran',
  keypad: { group: 'Pavé de test', keys: ['Haut', 'Bas', 'Gauche', 'Droite', 'B', 'A'] },
  theme: { ref: 'JP1', green: 'VERT', dark: 'NOIR', switchHidden: 'carte noire' },
  back: {
    ref: 'SW2',
    top: 'TOP',
    bot: 'BOT',
    switchHidden: 'face arrière',
    title: 'Face arrière · nomenclature',
    caption: `Nomenclature${NB}: les composants de la carte`,
    columns: ['Repère', `Compétence${NB}· composant`, `Détails${NB}· valeur`, 'Relié à'],
    rows: bom([
      ['U10', `Micro${SH}contrôleur`, 'ESP32-S3 · 240 MHz · USB', 'Vue.js · 2 → 3 · Composition API · SSR', 'U11 · U13–U18 · Y1 · J6 · J7 · R1 · LED1 · D1 · U2 · J1–J4 · DISP1 · SW3–SW8', 'U10, Vue.js, microcontrôleur'],
      ['U11', 'Mémoire flash', 'W25Q128 · 16 Mo QSPI', `TypeScript${NB}/ JavaScript · strict · ES modules`, 'U10', `U11, TypeScript${NB}/ JavaScript, mémoire flash`],
      ['U12', `Régu${SH}lateur 3,3${NB}V`, 'AP2112K · LDO 600 mA', `Perfor${SH}mance web · audits · Core Web Vitals`, 'J5', `U12, performance web, régulateur 3,3${NB}V`],
      ['U13', `Protec${SH}tion USB`, 'USBLC6-2 · ESD', `Acces${SH}sibilité · WCAG 2.2 AA · guidelines produit`, 'U10 · J5', 'U13, accessibilité, protection USB'],
      ['U14', `Exten${SH}seur d’E${WJ}/${WJ}S`, `TCA9554 · 8 E${WJ}/${WJ}S I²C`, `HTML séman${SH}tique · landmarks · ARIA juste`, 'U10 · SW1 · SW2 · JP1', 'U14, HTML sémantique, extenseur d’E/S'],
      ['U15', 'Pilote de LED', 'PCA9633 · 4 canaux PWM', 'CSS · layers · container queries · motion', 'U10 · D2–D5', 'U15, CSS, pilote de LED'],
      ['U16', 'Horloge temps réel', 'PCF8563 · uptime', `Archi${SH}tecture front · composants · migrations · Supabase`, 'U10 · Y2', 'U16, architecture front, horloge temps réel'],
      ['U17', `Super${SH}viseur de reset`, `APX803 · 2,93${NB}V`, 'Tests · unitaires · e2e · a11y', 'U10 · J6', 'U17, tests, superviseur de reset'],
      ['U18', 'Capteur de lumière', 'BH1750 · I²C', `Électro${SH}nique · Arduino · Raspberry Pi · IoT`, 'U10', 'U18, électronique, capteur de lumière'],
      ['Y1', 'Quartz', '40 MHz · ±10 ppm', 'Équipe · recrutement · formation · coaching', 'U10', 'Y1, équipe, quartz'],
      ['J6', `Connec${SH}teur de debug`, 'UART + boot · 6 broches', 'Debug · navigateurs · réseau · mémoire', 'U10 · U17', 'J6, debug, connecteur de debug'],
    ]),
    group: 'Composants de la face arrière',
  },
  marks: [
    { visible: 'Vue 3', hidden: 'Construit avec Vue 3' },
    { visible: 'a11y AA', hidden: 'Accessibilité WCAG 2.2, niveau AA', framed: true },
    { visible: 'INTJ-A', hidden: 'Personnalité INTJ-A' },
    { visible: 'LH 100', hidden: 'Lighthouse 100 dans chaque catégorie', framed: true },
    { visible: 'IA', hidden: `Compétence${NB}: intelligence artificielle` },
    { visible: 'n8n', hidden: `Compétence${NB}: automatisation avec n8n` },
  ],
  sections: {
    principles: { id: 'principes', title: 'Principes' },
    connectors: { id: 'connecteurs', title: 'Projets et contact' },
  },
  close: 'Fermer',
  newTab: '(nouvel onglet)',
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
      label: KIT.name,
      body: `Simulateur 3D qui calcule le kit d’urgence de votre foyer (adultes, enfants, de 72${NB}h à 3 semaines). Chaque objet arrive quand la voix le nomme. Un sac d’évacuation par personne, et des listes à cocher en PDF. Contenu comparé aux guides officiels d’une trentaine de pays.`,
      link: { text: 'Ouvrir le simulateur', href: absolute(KIT.href) },
      mediaAlt: `Le simulateur ${KIT.name}${NB}: une réserve de 3 semaines pour 2 adultes et 4 enfants, avec les objets numérotés en 3D.`,
    },
    {
      id: 'j2',
      ref: 'J2',
      kind: 'projet',
      label: SPLITR.name,
      body: 'Application de bureau (Windows, macOS) pour découper, traiter et exporter des fichiers médias simplement, sans la complexité de FFmpeg.',
      link: { text: 'Télécharger la dernière version', href: absolute(SPLITR.href) },
    },
    {
      id: 'j3',
      ref: 'J3',
      kind: 'projet',
      label: MYCARD.name,
      body: 'Plateforme SaaS de cartes de visite digitales. Éditeur en direct, partage par QR code, et un formulaire qui transforme chaque échange en contact exploitable. Pour les indépendants, les commerciaux et les agences.',
      link: { text: `Découvrir ${MYCARD.name}`, href: absolute(MYCARD.href) },
    },
    {
      id: 'j4',
      ref: 'J4',
      kind: 'projet',
      label: SCORE.name,
      body: `SaaS qui mesure la présence en ligne des mandataires immobiliers${NB}: un score, puis un rapport d’audit détaillé avec du coaching. En lancement.`,
      link: { text: `Découvrir ${SCORE.name}`, href: absolute(SCORE.href) },
    },
    {
      id: 'j5',
      ref: 'J5',
      kind: 'contact',
      label: 'Contact',
      contacts: [`E-mail${NB}: ${SITE.email}`, `GitHub${NB}: ${GITHUB_TEXT}`],
    },
  ],
};

export const EN: Copy = {
  lang: 'en',
  path: '/en/',
  title: 'Anthony · Principal front-end engineer',
  description:
    'Principal front-end engineer since 2004: accessibility, performance, architecture, debugging. Five principles and four projects, on a circuit board.',
  ogImageAlt: 'Green circuit board: Front-end, no shortcuts.',
  skipLink: 'Skip to content',
  langNavLabel: 'Language',
  header: 'ANTHONY · FRONT-END · REV 2026.11',
  heroLead: 'Front-end,',
  heroStrong: 'no shortcuts.',
  heroSub: 'Principal front-end engineer. Building interfaces since 2004, and circuits for even longer.',
  avatarAlt: 'Anthony’s pixel art avatar',
  pins: 'GND VCC SCK MOSI DC CS',
  captions: { avatar: 'DISP1 · avatar', uptime: 'DISP1 · uptime', morse: 'DISP1 · morse', game: 'DISP1 · routing' },
  game: {
    intro: 'Routing mini-game. Arrow keys, keypad or swipe on the screen to steer, A or tap the screen to play, Escape or SW1 to quit.',
    over: (n) => `Game over: ${n} ${n === 1 ? 'pad' : 'pads'} connected. A to play again, Escape to quit.`,
  },
  switchRef: 'SW1',
  switchHidden: 'change screen',
  keypad: { group: 'Test keypad', keys: ['Up', 'Down', 'Left', 'Right', 'B', 'A'] },
  theme: { ref: 'JP1', green: 'GREEN', dark: 'BLACK', switchHidden: 'black board' },
  back: {
    ref: 'SW2',
    top: 'TOP',
    bot: 'BOT',
    switchHidden: 'back side',
    title: 'Back side · bill of materials',
    caption: 'Bill of materials: the parts on this board',
    columns: ['Ref', `Skill${NB}· part`, `Details${NB}· value`, 'Linked to'],
    rows: bom([
      ['U10', `Micro${SH}controller`, 'ESP32-S3 · 240 MHz · USB', 'Vue.js · 2 → 3 · Composition API · SSR', 'U11 · U13–U18 · Y1 · J6 · J7 · R1 · LED1 · D1 · U2 · J1–J4 · DISP1 · SW3–SW8', 'U10, Vue.js, microcontroller'],
      ['U11', 'Flash memory', 'W25Q128 · 16 MB QSPI', `TypeScript${NB}/ JavaScript · strict · ES modules`, 'U10', `U11, TypeScript${NB}/ JavaScript, flash memory`],
      ['U12', `3.3 V regu${SH}lator`, 'AP2112K · LDO 600 mA', `Web perfor${SH}mance · audits · Core Web Vitals`, 'J5', 'U12, web performance, 3.3 V regulator'],
      ['U13', `USB protec${SH}tion`, 'USBLC6-2 · ESD', `Acces${SH}sibility · WCAG 2.2 AA · product guidelines`, 'U10 · J5', 'U13, accessibility, USB protection'],
      ['U14', `I${WJ}/${WJ}O expan${SH}der`, `TCA9554 · 8 I${WJ}/${WJ}O I²C`, `Seman${SH}tic HTML · landmarks · ARIA done right`, 'U10 · SW1 · SW2 · JP1', 'U14, semantic HTML, I/O expander'],
      ['U15', 'LED driver', 'PCA9633 · 4 PWM channels', 'CSS · layers · container queries · motion', 'U10 · D2–D5', 'U15, CSS, LED driver'],
      ['U16', 'Real-time clock', 'PCF8563 · uptime', `Front-end archi${SH}tecture · components · migrations · Supabase`, 'U10 · Y2', 'U16, front-end architecture, real-time clock'],
      ['U17', `Reset super${SH}visor`, 'APX803 · 2.93 V', 'Testing · unit · e2e · a11y', 'U10 · J6', 'U17, testing, reset supervisor'],
      ['U18', 'Light sensor', 'BH1750 · I²C', `Electro${SH}nics · Arduino · Raspberry Pi · IoT`, 'U10', 'U18, electronics, light sensor'],
      ['Y1', 'Crystal', '40 MHz · ±10 ppm', 'Team · hiring · training · coaching', 'U10', 'Y1, team, crystal'],
      ['J6', 'Debug header', 'UART + boot · 6 pins', `Debug${SH}ging · browsers · network · memory`, 'U10 · U17', 'J6, debugging, debug header'],
    ]),
    group: 'Back-side components',
  },
  marks: [
    { visible: 'Vue 3', hidden: 'Built with Vue 3' },
    { visible: 'a11y AA', hidden: 'Accessibility WCAG 2.2, level AA', framed: true },
    { visible: 'INTJ-A', hidden: 'Personality INTJ-A' },
    { visible: 'LH 100', hidden: 'Lighthouse 100 in every category', framed: true },
    { visible: 'AI', hidden: 'Skill: artificial intelligence' },
    { visible: 'n8n', hidden: 'Skill: automation with n8n' },
  ],
  sections: {
    principles: { id: 'principles', title: 'Principles' },
    connectors: { id: 'connectors', title: 'Projects and contact' },
  },
  close: 'Close',
  newTab: '(new tab)',
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
      label: KIT.name,
      lang: 'fr',
      body: 'A 3D simulator that plans the emergency kit for your home: adults, children, from 72 hours to 3 weeks. Each item appears when the voice says its name. One evacuation bag for each person, and checklists in PDF. The content is checked against official guides from about thirty countries.',
      link: { text: 'Open the simulator (in French)', href: absolute(KIT.href) },
      mediaAlt: `The ${KIT.name} simulator: a 3-week supply for 2 adults and 4 children, with numbered items in 3D.`,
    },
    {
      id: 'j2',
      ref: 'J2',
      kind: 'project',
      label: SPLITR.name,
      body: 'A desktop app (Windows, macOS) to split, process and export media files. Simple and fast, without the complexity of FFmpeg.',
      link: { text: 'Download the latest version', href: absolute(SPLITR.href) },
    },
    {
      id: 'j3',
      ref: 'J3',
      kind: 'project',
      label: MYCARD.name,
      body: 'SaaS platform for digital business cards. Live editor, QR-code sharing, and a form that turns every exchange into a usable lead. For freelancers, sales reps and agencies.',
      link: { text: `Discover ${MYCARD.name}`, href: absolute(MYCARD.href) },
    },
    {
      id: 'j4',
      ref: 'J4',
      kind: 'project',
      label: SCORE.name,
      lang: 'fr',
      body: 'SaaS that scores the online presence of real-estate agents, then delivers a detailed audit report with coaching. Launching soon.',
      link: { text: `Discover ${SCORE.name}`, href: absolute(SCORE.href) },
    },
    {
      id: 'j5',
      ref: 'J5',
      kind: 'contact',
      label: 'Contact',
      contacts: [`Email: ${SITE.email}`, `GitHub: ${GITHUB_TEXT}`],
    },
  ],
};
