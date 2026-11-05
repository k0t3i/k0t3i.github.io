import { GITHUB_TEXT, SITE, project } from './site';
import type { SiteContent } from './types';

/** A soft hyphen: where a long name of the table may break, with its hyphen (no dictionary needed). */
/** A no-break space: before the slash of the table, so a slash never ends up alone on a line. */
const NB = ' ';
const SH = '­';
/** A word joiner (U+2060), round the slash of « E/S » and « I/O »: no line breaks inside them. */
const WJ = '⁠';

// The names and links of the projects: site.json.
const KIT = project('kitUrgence');
const SPLITR = project('splitr');
const MYCARD = project('mycard');
const SCORE = project('monscoreimmo');

export const en: SiteContent = {
  locale: 'en',
  meta: {
    title: 'Anthony · Principal front-end engineer',
    description:
      'Principal front-end engineer since 2004: accessibility, performance, architecture, debugging. Five principles and four projects, on a circuit board.',
    ogImageAlt: 'Green circuit board: Front-end, no shortcuts.',
  },
  skipLink: 'Skip to content',
  langNav: {
    label: 'Language',
    links: [
      { text: 'FR', label: 'FR, Français', lang: 'fr', href: '/' },
      { text: 'EN', label: 'EN, English', lang: 'en', href: '/en/' },
    ],
  },
  header: { name: 'ANTHONY', rev: 'FRONT-END · REV 2026.11' },
  hero: {
    lead: 'Front-end,',
    strong: 'no shortcuts.',
    sub: 'Principal front-end engineer. Building interfaces since 2004, and circuits for even longer.',
  },
  display: {
    alt: 'Anthony’s pixel art avatar',
    pins: 'GND VCC SCK MOSI DC CS',
    captions: { avatar: 'DISP1 · avatar', uptime: 'DISP1 · uptime', morse: 'DISP1 · morse', game: 'DISP1 · routing' },
    game: {
      intro: 'Routing mini-game. Arrow keys, keypad or swipe on the screen to steer, A or tap the screen to play, Escape or SW1 to quit.',
      over: { one: 'Game over: {n} pad connected.', other: 'Game over: {n} pads connected.' },
      again: 'A to play again, Escape to quit.',
    },
    switchRef: 'SW1',
    switchHidden: 'change screen',
    keypad: { group: 'Test keypad', keys: { up: 'Up', down: 'Down', left: 'Left', right: 'Right', b: 'B', a: 'A' } },
  },
  theme: { ref: 'JP1', green: 'GREEN', dark: 'BLACK', switchHidden: 'black board' },
  back: {
    ref: 'SW2',
    top: 'TOP',
    bot: 'BOT',
    switchHidden: 'back side',
    title: 'Back side · bill of materials',
    bom: {
      caption: 'Bill of materials: the parts on this board',
      columns: { ref: 'Ref', part: 'Part', value: `Value${NB}/ skill`, linked: 'Linked to' },
      // The part and the skill as they read in a sentence: the table capitalizes them (circuit/bom.ts).
      rows: [
        { ref: 'U10', part: `micro${SH}controller`, value: 'ESP32-S3 · 240 MHz · USB', skill: 'Vue.js', details: '2 → 3 · Composition API · SSR' },
        { ref: 'U11', part: 'flash memory', value: 'W25Q128 · 16 MB QSPI', skill: `TypeScript${NB}/ JavaScript`, details: 'strict · ES modules' },
        { ref: 'U12', part: `3.3 V regu${SH}lator`, value: 'AP2112K · LDO 600 mA', skill: `web perfor${SH}mance`, details: 'audits · Core Web Vitals' },
        { ref: 'U13', part: `USB protec${SH}tion`, value: 'USBLC6-2 · ESD', skill: `acces${SH}sibility`, details: 'WCAG 2.2 AA · product guidelines' },
        { ref: 'U14', part: `I${WJ}/${WJ}O expan${SH}der`, value: `TCA9554 · 8 I${WJ}/${WJ}O I²C`, skill: `seman${SH}tic HTML`, details: 'landmarks · ARIA done right' },
        { ref: 'U15', part: 'LED driver', value: 'PCA9633 · 4 PWM channels', skill: 'CSS', details: 'layers · container queries · motion' },
        { ref: 'U16', part: 'real-time clock', value: 'PCF8563 · uptime', skill: `front-end archi${SH}tecture`, details: 'components · migrations' },
        { ref: 'U17', part: `reset super${SH}visor`, value: 'APX803 · 2.93 V', skill: 'testing', details: 'unit · e2e · a11y' },
        { ref: 'U18', part: 'light sensor', value: 'BH1750 · I²C', skill: `electro${SH}nics`, details: 'Arduino · Raspberry Pi · IoT' },
        { ref: 'Y1', part: 'crystal', value: '40 MHz · ±10 ppm', skill: 'team', details: 'hiring · training · coaching' },
        { ref: 'J6', part: 'debug header', value: 'UART + boot · 6 pins', skill: `debug${SH}ging`, details: 'browsers · network · memory' },
      ],
      // « Relié à » of a part with no signal link (U12: power only).
      none: '—',
    },
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
      labelLang: 'fr',
      body: 'A 3D simulator that plans the emergency kit for your home: adults, children, from 72 hours to 3 weeks. Each item appears when the voice says its name. One evacuation bag for each person, and checklists in PDF. The content is checked against official guides from about thirty countries.',
      link: { href: KIT.href, text: 'Open the simulator (in French)' },
      media: {
        alt: `The ${KIT.name} simulator: a 3-week supply for 2 adults and 4 children, with numbered items in 3D.`,
      },
    },
    {
      id: 'j2',
      ref: 'J2',
      kind: 'project',
      label: SPLITR.name,
      body: 'A desktop app (Windows, macOS) to split, process and export media files. Simple and fast, without the complexity of FFmpeg.',
      link: { href: SPLITR.href, text: 'Download the latest version' },
    },
    {
      id: 'j3',
      ref: 'J3',
      kind: 'project',
      label: MYCARD.name,
      body: 'SaaS platform for digital business cards. Live editor, QR-code sharing, and a form that turns every exchange into a usable lead. For freelancers, sales reps and agencies.',
      link: { href: MYCARD.href, text: `Discover ${MYCARD.name}` },
    },
    {
      id: 'j4',
      ref: 'J4',
      kind: 'project',
      label: SCORE.name,
      labelLang: 'fr',
      body: 'SaaS that scores the online presence of real-estate agents, then delivers a detailed audit report with coaching. Launching soon.',
      link: { href: SCORE.href, text: `Discover ${SCORE.name}` },
    },
    {
      id: 'j5',
      ref: 'J5',
      kind: 'contact',
      label: 'Contact',
      contacts: [
        { label: 'Email:', href: `mailto:${SITE.email}`, text: SITE.email },
        { label: 'GitHub:', href: SITE.github, text: GITHUB_TEXT },
      ],
    },
  ],
  close: 'Close',
  newTab: '(new tab)',
  uptime: {
    before: 'uptime: ',
    after: ' h designing, coding, debugging, training, managing, learning',
  },
  notFound: {
    title: 'Open circuit',
    text: 'This page does not exist, or not anymore.',
    back: 'Back to the board',
  },
};
