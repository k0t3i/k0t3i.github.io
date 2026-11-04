import raw from './site.json';

/** A project shown on the board: its name, and its link (relative to the site URL, or absolute). */
export interface Project {
  name: string;
  href: string;
}

export type ProjectId = 'kitUrgence' | 'splitr' | 'mycard' | 'monscoreimmo';

export interface Site {
  baseUrl: string;
  email: string;
  github: string;
  projects: Record<ProjectId, Project>;
}

/**
 * The only source of what is bound to change: the site URL, the e-mail address, the GitHub profile,
 * and the name and the link of each project. The copy (fr.ts, en.ts) and the tests read them here.
 */
export const SITE: Site = raw;

/** A project as the page shows it: its name, and its link made absolute against the site URL. */
export function project(id: ProjectId): Project {
  const { name, href } = SITE.projects[id];
  return { name, href: new URL(href, SITE.baseUrl).href };
}

/** The GitHub profile as its link text shows it: the address without its scheme. */
export const GITHUB_TEXT = SITE.github.replace(/^https?:\/\//, '');
