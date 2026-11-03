import { SITE } from './site';
import type { SiteContent } from './types';

// U+00A0 before : and before "h", U+2019 for the apostrophe.
const NB = ' ';

export const fr: SiteContent = {
  locale: 'fr',
  meta: {
    title: 'Anthony · Ingénieur front-end principal',
    description: `Ingénieur front-end principal depuis 2004${NB}: accessibilité, performance, architecture, debug. Cinq principes et deux projets, sur une carte électronique.`,
    ogImageAlt: `Carte électronique noire${NB}: Front-end, sans raccourcis.`,
  },
  skipLink: 'Aller au contenu',
  langNav: {
    label: 'Langue',
    links: [
      { text: 'FR', label: 'Français', lang: 'fr', href: '/' },
      { text: 'EN', label: 'English', lang: 'en', href: '/en/' },
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
    captions: { avatar: 'DISP1 · avatar', uptime: 'DISP1 · uptime', morse: 'DISP1 · morse' },
    switchHidden: 'changer l’écran',
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
      title: 'Je conçois pour durer, pas pour la démo.',
      body: `Fondation Louis Vuitton, Van Cleef & Arpels${NB}: architecture en composants, migrations de plateforme.`,
    },
    {
      id: 'c1',
      ref: 'C1',
      kind: 'condensateur',
      label: 'L’accessibilité n’est pas une option.',
      title: 'L’accessibilité n’est pas une option.',
      body: 'Elle fait partie de chaque projet que je mène, du luxe au B2B bancaire. Chez Fircosoft, j’en porte les guidelines pour tout le produit.',
    },
    {
      id: 'led1',
      ref: 'LED1',
      kind: 'LED',
      label: 'La performance se mesure, elle ne se suppose pas.',
      title: 'La performance se mesure, elle ne se suppose pas.',
      body: 'Audits de performance chez SFEIR, optimisations sur la plupart des projets de luxe.',
    },
    {
      id: 'd1',
      ref: 'D1',
      kind: 'diode',
      label: 'Un bug a toujours une cause. Je la trouve.',
      title: 'Un bug a toujours une cause. Je la trouve.',
      body: 'Le debug front de Fircosoft passe par moi depuis 2018.',
    },
    {
      id: 'u2',
      ref: 'U2',
      kind: 'circuit intégré',
      label: 'Une équipe solide vaut mieux qu’un héros.',
      title: 'Une équipe solide vaut mieux qu’un héros.',
      body: 'Jusqu’à 20 développeurs front recrutés, formés et suivis chez Valtech. Des formations en entreprise.',
    },
  ],
  connectors: [
    {
      id: 'j1',
      ref: 'J1',
      kind: 'projet',
      label: 'Kit d’urgence',
      title: 'Kit d’urgence',
      body: `Simulateur 3D qui calcule le kit d’urgence de votre foyer (adultes, enfants, de 72${NB}h à 3 semaines). Chaque objet arrive quand la voix le nomme. Un sac d’évacuation par personne, et des listes à cocher en PDF. Contenu comparé aux guides officiels d’une trentaine de pays.`,
      link: { href: `${SITE.baseUrl}kit-urgence/`, text: 'Ouvrir le simulateur' },
      media: {
        alt: `Le simulateur Kit d’urgence${NB}: une réserve de 3 semaines pour 2 adultes et 4 enfants, avec les objets numérotés en 3D.`,
      },
    },
    {
      id: 'j2',
      ref: 'J2',
      kind: 'projet',
      label: 'SplitR',
      title: 'SplitR',
      body: 'Application de bureau (Windows, macOS) pour découper, traiter et exporter des fichiers médias simplement, sans la complexité de FFmpeg.',
      link: {
        href: 'https://github.com/k0t3i/splitr-releases/releases/latest',
        text: 'Télécharger la dernière version',
      },
    },
    {
      id: 'j3',
      ref: 'J3',
      kind: 'contact',
      label: 'Contact',
      title: 'Contact',
      contacts: [
        { label: `E-mail${NB}:`, href: `mailto:${SITE.email}`, text: SITE.email },
        { label: `GitHub${NB}:`, href: SITE.github, text: 'github.com/k0t3i' },
      ],
    },
  ],
  close: 'Fermer',
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
