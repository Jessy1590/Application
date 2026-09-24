/**
 * Contrat partagé : slug ↔ siteId (portail.sites) ↔ chemin public.
 * Source des UUIDs : appels `initialiserSite(...)` dans le dépôt.
 * PharmaOs n’a pas d’UUID `initialiserSite` dans le codebase (Electron hors public/).
 */
export const SITES = {
  banque: {
    siteId: '0d673966-f8d8-42fb-8811-c1fba278c76b',
    publicPath: '/Banque/',
    name: 'Banque',
  },
  vaccin: {
    siteId: '6b25908c-9354-48f0-9c7d-68c1fbf6673a',
    publicPath: '/Vaccin/',
    name: 'Vaccin',
  },
  fromage: {
    siteId: '01fae4ee-2c95-4caf-b600-43980b7e22b3',
    publicPath: '/Fromage/',
    name: 'Fromage',
  },
  thesaurus: {
    siteId: '73b04cdc-6fa7-4c5d-8bd7-a718792996c6',
    publicPath: '/Thesaurus/',
    name: 'Thesaurus',
  },
  valorisation: {
    siteId: 'eb7d0a90-d10f-4407-a910-705f0d983f78',
    publicPath: '/Valorisation/',
    name: 'Valorisation',
  },
  avions: {
    siteId: '449b0f9f-32b5-4659-aae7-c4fff5969516',
    publicPath: '/Avions/',
    name: 'Avions',
  },
  phieevreux: {
    siteId: '9dd064a4-13ec-4cc2-9707-29210c3744ce',
    publicPath: '/PhieEvreux/',
    name: 'PhieEvreux',
  },
} as const;

export type SiteSlug = keyof typeof SITES;
export type SiteConfig = (typeof SITES)[SiteSlug];

/** Préfixes d’URL protégés (sans slash final) pour le middleware. */
export function sitePathPrefixes(): string[] {
  return Object.values(SITES).map((s) => s.publicPath.replace(/\/$/, ''));
}

export function siteByPathPrefix(pathname: string): SiteConfig | undefined {
  const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return Object.values(SITES).find(
    (s) => normalized === s.publicPath || normalized.startsWith(s.publicPath),
  );
}
