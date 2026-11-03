import { SITE } from './site';
import type { SiteContent } from './types';

export const en: SiteContent = {
  locale: 'en',
  meta: {
    title: 'Anthony · Principal front-end engineer',
    description:
      'Principal front-end engineer since 2004: accessibility, performance, architecture, debugging. Five principles and two projects, on a circuit board.',
    ogImageAlt: 'Black circuit board: Front-end, no shortcuts.',
  },
  skipLink: 'Skip to content',
  langNav: {
    label: 'Language',
    links: [
      { text: 'FR', label: 'Français', lang: 'fr', href: '/' },
      { text: 'EN', label: 'English', lang: 'en', href: '/en/' },
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
    captions: { avatar: 'DISP1 · avatar', uptime: 'DISP1 · uptime', morse: 'DISP1 · morse' },
    switchHidden: 'change screen',
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
  principles: [
    {
      id: 'r1',
      ref: 'R1',
      kind: 'resistor',
      label: 'I build to last, not for the demo.',
      title: 'I build to last, not for the demo.',
      body: 'Fondation Louis Vuitton, Van Cleef & Arpels: component architecture, platform migrations.',
    },
    {
      id: 'c1',
      ref: 'C1',
      kind: 'capacitor',
      label: 'Accessibility is not optional.',
      title: 'Accessibility is not optional.',
      body: 'It is part of every project I lead, from luxury brands to B2B banking. At Fircosoft, I own the accessibility guidelines for the whole product.',
    },
    {
      id: 'led1',
      ref: 'LED1',
      kind: 'LED',
      label: 'Performance is measured, not guessed.',
      title: 'Performance is measured, not guessed.',
      body: 'Performance audits at SFEIR, optimisation on most luxury projects.',
    },
    {
      id: 'd1',
      ref: 'D1',
      kind: 'diode',
      label: 'Every bug has a cause. I find it.',
      title: 'Every bug has a cause. I find it.',
      body: 'Since 2018, front-end debugging at Fircosoft goes through me.',
    },
    {
      id: 'u2',
      ref: 'U2',
      kind: 'chip',
      label: 'A strong team beats a hero.',
      title: 'A strong team beats a hero.',
      body: 'Up to 20 front-end developers hired, trained and coached at Valtech. Training sessions for companies.',
    },
  ],
  connectors: [
    {
      id: 'j1',
      ref: 'J1',
      kind: 'project',
      label: 'Kit d’urgence',
      title: 'Kit d’urgence',
      labelLang: 'fr',
      body: 'A 3D simulator that plans the emergency kit for your home: adults, children, from 72 hours to 3 weeks. Each item appears when the voice says its name. One evacuation bag for each person, and checklists in PDF. The content is checked against official guides from about thirty countries.',
      link: { href: `${SITE.baseUrl}kit-urgence/`, text: 'Open the simulator (in French)' },
      media: {
        alt: 'The Kit d’urgence simulator: a 3-week supply for 2 adults and 4 children, with numbered items in 3D.',
      },
    },
    {
      id: 'j2',
      ref: 'J2',
      kind: 'project',
      label: 'SplitR',
      title: 'SplitR',
      body: 'A desktop app (Windows, macOS) to split, process and export media files. Simple and fast, without the complexity of FFmpeg.',
      link: {
        href: 'https://github.com/k0t3i/splitr-releases/releases/latest',
        text: 'Download the latest version',
      },
    },
    {
      id: 'j3',
      ref: 'J3',
      kind: 'contact',
      label: 'Contact',
      title: 'Contact',
      contacts: [
        { label: 'Email:', href: `mailto:${SITE.email}`, text: SITE.email },
        { label: 'GitHub:', href: SITE.github, text: 'github.com/k0t3i' },
      ],
    },
  ],
  close: 'Close',
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
