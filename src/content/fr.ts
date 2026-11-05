import { GITHUB_TEXT, SITE, project } from './site';
import type { SiteContent } from './types';

// U+00A0 before : and before "h", U+2019 for the apostrophe.
const NB = ' ';
/** A soft hyphen: where a long name of the table may break, with its hyphen (no dictionary needed). */
const SH = '­';
/** A word joiner (U+2060), round the slash of « E/S » and « I/O »: no line breaks inside them. */
const WJ = '⁠';
// The names and links of the projects: site.json.
const KIT = project('kitUrgence');
const SPLITR = project('splitr');
const MYCARD = project('mycard');
const SCORE = project('monscoreimmo');

export const fr: SiteContent = {
  locale: 'fr',
  meta: {
    title: 'Anthony · Ingénieur front-end principal',
    description: `Ingénieur front-end principal depuis 2004${NB}: accessibilité, performance, architecture, debug. Cinq principes et quatre projets, sur une carte électronique.`,
    ogImageAlt: `Carte électronique verte${NB}: Front-end, sans raccourcis.`,
  },
  skipLink: 'Aller au contenu',
  langNav: {
    label: 'Langue',
    links: [
      { text: 'FR', label: 'FR, Français', lang: 'fr', href: '/' },
      { text: 'EN', label: 'EN, English', lang: 'en', href: '/en/' },
    ],
  },
  header: { name: 'ANTHONY', rev: 'FRONT-END · REV 2026.11' },
  hero: {
    lead: 'Front-end,',
    strong: 'sans raccourcis.',
    sub: 'Ingénieur front-end principal. Des interfaces depuis 2004, des circuits depuis plus longtemps encore.',
  },
  display: {
    alt: 'Avatar pixel art d’Anthony',
    pins: 'GND VCC SCK MOSI DC CS',
    captions: { avatar: 'DISP1 · avatar', uptime: 'DISP1 · uptime', morse: 'DISP1 · morse', game: 'DISP1 · routage' },
    game: {
      intro: 'Mini-jeu Routage. Flèches ou glisser sur l’écran pour diriger, A ou toucher l’écran pour jouer, Échap ou SW1 pour quitter.',
      over: { one: `Partie finie${NB}: {n} pastille reliée.`, other: `Partie finie${NB}: {n} pastilles reliées.` },
      again: 'A pour rejouer, Échap pour quitter.',
    },
    switchRef: 'SW1',
    switchHidden: 'changer l’écran',
  },
  theme: { ref: 'JP1', green: 'VERT', dark: 'NOIR', switchHidden: 'carte noire' },
  back: {
    ref: 'SW2',
    top: 'TOP',
    bot: 'BOT',
    switchHidden: 'face arrière',
    title: 'Face arrière · nomenclature',
    bom: {
      caption: `Nomenclature${NB}: les composants de la carte`,
      columns: { ref: 'Repère', part: 'Composant', value: `Valeur${NB}/ compétence`, linked: 'Relié à' },
      // The part and the skill as they read in a sentence: the table capitalizes them (circuit/bom.ts).
      rows: [
        { ref: 'U10', part: `micro${SH}contrôleur`, value: 'ESP32-S3 · 240 MHz · USB', skill: 'Vue.js', details: '2 → 3 · Composition API · SSR' },
        { ref: 'U11', part: 'mémoire flash', value: 'W25Q128 · 16 Mo QSPI', skill: `TypeScript${NB}/ JavaScript`, details: 'strict · ES modules' },
        { ref: 'U12', part: `régu${SH}lateur 3,3${NB}V`, value: 'AP2112K · LDO 600 mA', skill: `perfor${SH}mance web`, details: 'audits · Core Web Vitals' },
        { ref: 'U13', part: `protec${SH}tion USB`, value: 'USBLC6-2 · ESD', skill: `acces${SH}sibilité`, details: 'WCAG 2.2 AA · guidelines produit' },
        { ref: 'U14', part: `exten${SH}seur d’E${WJ}/${WJ}S`, value: `TCA9554 · 8 E${WJ}/${WJ}S I²C`, skill: `HTML séman${SH}tique`, details: 'landmarks · ARIA juste' },
        { ref: 'U15', part: 'pilote de LED', value: 'PCA9633 · 4 canaux PWM', skill: 'CSS', details: 'layers · container queries · motion' },
        { ref: 'U16', part: 'horloge temps réel', value: 'PCF8563 · uptime', skill: `archi${SH}tecture front`, details: 'composants · migrations' },
        { ref: 'U17', part: `super${SH}viseur de reset`, value: `APX803 · 2,93${NB}V`, skill: 'tests', details: 'unitaires · e2e · a11y' },
        { ref: 'U18', part: 'capteur de lumière', value: 'BH1750 · I²C', skill: `électro${SH}nique`, details: 'Arduino · Raspberry Pi · IoT' },
        { ref: 'Y1', part: 'quartz', value: '40 MHz · ±10 ppm', skill: 'équipe', details: 'recrutement · formation · coaching' },
        { ref: 'J6', part: `connec${SH}teur de debug`, value: 'UART + boot · 6 broches', skill: 'debug', details: 'navigateurs · réseau · mémoire' },
      ],
      // « Relié à » of a part with no signal link (U12: power only).
      none: '—',
    },
    group: 'Composants de la face arrière',
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
      link: { href: KIT.href, text: 'Ouvrir le simulateur' },
      media: {
        alt: `Le simulateur ${KIT.name}${NB}: une réserve de 3 semaines pour 2 adultes et 4 enfants, avec les objets numérotés en 3D.`,
      },
    },
    {
      id: 'j2',
      ref: 'J2',
      kind: 'projet',
      label: SPLITR.name,
      body: 'Application de bureau (Windows, macOS) pour découper, traiter et exporter des fichiers médias simplement, sans la complexité de FFmpeg.',
      link: { href: SPLITR.href, text: 'Télécharger la dernière version' },
    },
    {
      id: 'j3',
      ref: 'J3',
      kind: 'projet',
      label: MYCARD.name,
      body: 'Plateforme SaaS de cartes de visite digitales. Éditeur en direct, partage par QR code, et un formulaire qui transforme chaque échange en contact exploitable. Pour les indépendants, les commerciaux et les agences.',
      link: { href: MYCARD.href, text: `Découvrir ${MYCARD.name}` },
    },
    {
      id: 'j4',
      ref: 'J4',
      kind: 'projet',
      label: SCORE.name,
      body: `SaaS qui mesure la présence en ligne des mandataires immobiliers${NB}: un score, puis un rapport d’audit détaillé avec du coaching. En lancement.`,
      link: { href: SCORE.href, text: `Découvrir ${SCORE.name}` },
    },
    {
      id: 'j5',
      ref: 'J5',
      kind: 'contact',
      label: 'Contact',
      contacts: [
        { label: `E-mail${NB}:`, href: `mailto:${SITE.email}`, text: SITE.email },
        { label: `GitHub${NB}:`, href: SITE.github, text: GITHUB_TEXT },
      ],
    },
  ],
  close: 'Fermer',
  newTab: '(nouvel onglet)',
  uptime: {
    before: `uptime${NB}: `,
    after: `${NB}h à concevoir, coder, débugger, former, manager, apprendre`,
  },
  notFound: {
    title: 'Circuit ouvert',
    text: 'Cette page n’existe pas, ou plus.',
    back: 'Retour à la carte',
  },
};
