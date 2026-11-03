import raw from './site.json';

export interface Site {
  baseUrl: string;
  email: string;
  github: string;
}

/** The only source of the site URL, the e-mail address and the GitHub profile. */
export const SITE: Site = raw;
