import type { Pax } from '../domain/types.js';

export const REQUESTS_BASE = '/content/aida-search-and-booking/requests/';

/**
 * Nur diese Pfade dürfen über die Browser-Brücke abgefragt werden.
 * Dieselbe Liste steht in extension/background.js.
 */
export const ALLOWLIST: { method: 'GET' | 'POST'; pattern: RegExp }[] = [
  { method: 'GET', pattern: /^\/content\/aida-search-and-booking\/requests\/search\.filter\.json$/ },
  { method: 'GET', pattern: /^\/content\/aida-search-and-booking\/requests\/search\.cruise\.json\/[^?#]*\.json$/ },
  { method: 'GET', pattern: /^\/content\/aida-search-and-booking\/requests\/detail\.cruise\.json\/[^?#]*\.json$/ },
  { method: 'POST', pattern: /^\/content\/aida-search-and-booking\/requests\/player\.proxy\.json\?[A-Za-z0-9=,_-]*$/ },
];

export function isAllowed(method: string, path: string): boolean {
  return ALLOWLIST.some((a) => a.method === method && a.pattern.test(path));
}

export function filterPath(): string {
  return `${REQUESTS_BASE}search.filter.json`;
}

export interface CatalogQuery {
  page: number;
  size?: number;
  region?: string;
  ship?: string;
  port?: string;
  airport?: string;
}

const CATALOG_PAX = '/pax[adults]=2/pax[juveniles]=0/pax[children]=0/pax[babies]=0';

export function catalogPath(q: CatalogQuery): string {
  let p = `${REQUESTS_BASE}search.cruise.json/size=${q.size ?? 100}/p=${q.page}/sortCriteria=DepartureDate/sortDirection=Asc${CATALOG_PAX}`;
  if (q.region) p += `/region=${encodeURIComponent(q.region)}`;
  if (q.ship) p += `/ship=${encodeURIComponent(q.ship)}`;
  if (q.port) p += `/port=${encodeURIComponent(q.port)}`;
  if (q.airport) p += `/airport=${encodeURIComponent(q.airport)}`;
  return `${p}.json`;
}

export function detailPath(journeyId: string, pax: Pax): string {
  return `${REQUESTS_BASE}detail.cruise.json/language=de/adults=${pax.adults}/juveniles=${pax.juveniles}/children=${pax.children}/babies=${pax.babies}/JourneyIdentifier=${encodeURIComponent(journeyId)}.json`;
}

export function playerPath(tag = 'prices'): string {
  return `${REQUESTS_BASE}player.proxy.json?${tag}`;
}
