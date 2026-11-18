import type { Catalog, Departure } from '../domain/types.js';
import { MONTHS, dateDE } from './format.js';

export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export interface SearchEntry {
  dep: Departure;
  hay: string;
}

export function buildIndex(catalog: Catalog): SearchEntry[] {
  const portsByRoute = new Map(catalog.routes.map((r) => [r.key, r.ports.map((p) => p.name).join(' ')]));
  return catalog.departures.map((dep) => {
    const month = Number(dep.startDate.slice(5, 7)) - 1;
    const mName = MONTHS[month] ?? '';
    const hay = fold(
      [
        dep.title,
        dep.shipName,
        dep.shipName.replace(/^AIDA/i, ''),
        portsByRoute.get(dep.routeKey) ?? '',
        dep.fromCity,
        dep.toCity,
        dateDE(dep.startDate),
        mName,
        dep.startDate.slice(0, 4),
        `${dep.duration} tage`,
        dep.journeyId,
        dep.flightIncluded ? 'flug' : '',
      ].join(' '),
    );
    return { dep, hay };
  });
}

/** Alle Suchbegriffe müssen vorkommen; Treffer am Wortanfang zählen mehr. */
export function search(index: SearchEntry[], query: string, limit = Infinity): Departure[] {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return index.slice(0, limit).map((e) => e.dep);
  const scored: { dep: Departure; score: number }[] = [];
  for (const e of index) {
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      const i = e.hay.indexOf(t);
      if (i === -1) {
        ok = false;
        break;
      }
      const atWord = i === 0 || /[\s/.\-&(]/.test(e.hay[i - 1]!);
      score += atWord ? 2 : 1;
    }
    if (ok) scored.push({ dep: e.dep, score });
  }
  scored.sort((a, b) => b.score - a.score || a.dep.startDate.localeCompare(b.dep.startDate));
  return scored.slice(0, limit).map((s) => s.dep);
}
