import type { Catalog, Departure, Port, Route } from '../domain/types.js';
import type { CatalogResponse } from './schemas.js';

/** "LAS PALMAS/GRAN CANARIA" → "Las Palmas/Gran Canaria" */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s/\-(.])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

function normalizePort(p: CatalogResponse['cruiseItems'][number]['ports'][number]): Port {
  const isSea = p.code === 'SEE' || !p.name;
  return {
    code: p.code,
    name: isSea ? 'Seetag' : titleCase(p.name!),
    arrival: p.arrivalDateTime ?? null,
    departure: p.departureDateTime ?? null,
  };
}

export function normalizeCatalog(pages: CatalogResponse[], fetchedAt = Date.now()): Catalog {
  const routes = new Map<string, Route>();
  for (const page of pages) {
    for (const item of page.cruiseItems) {
      const key = `${item.routeGroupCode}#${item.routeCode}`;
      let route = routes.get(key);
      if (!route) {
        route = {
          key,
          title: item.title,
          routeCode: item.routeCode,
          duration: item.duration,
          flightIncluded: !!item.flightIncluded,
          ports: item.ports.map(normalizePort),
          departures: [],
        };
        routes.set(key, route);
      }
      for (const v of item.cruiseItemVariant) {
        if (route.departures.some((d) => d.journeyId === v.journeyIdentifier)) continue;
        const dep: Departure = {
          journeyId: v.journeyIdentifier,
          routeKey: key,
          title: item.title,
          startDate: v.startDate,
          endDate: v.endDate,
          duration: v.duration,
          shipCode: v.ship.code,
          shipName: v.ship.name,
          fromCity: v.fromCity ?? '',
          toCity: v.toCity ?? '',
          flightIncluded: !!v.flightIncluded,
          campaigns: (v.campaigns ?? []).map((c) => c.name ?? c.code ?? '').filter(Boolean),
        };
        if (v.amount != null) dep.fromPrice = v.amount;
        if (v.amountPerPerson != null) dep.fromPricePerPerson = v.amountPerPerson;
        route.departures.push(dep);
      }
    }
  }

  const all = new Map<string, Departure>();
  for (const r of routes.values()) {
    r.departures.sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (const d of r.departures) if (!all.has(d.journeyId)) all.set(d.journeyId, d);
  }
  const departures = [...all.values()].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title),
  );
  return { routes: [...routes.values()], departures, fetchedAt };
}

export function findDeparture(catalog: Catalog, journeyId: string): Departure | undefined {
  return catalog.departures.find((d) => d.journeyId === journeyId);
}

export function routeOf(catalog: Catalog, dep: Departure): Route | undefined {
  return catalog.routes.find((r) => r.key === dep.routeKey);
}
