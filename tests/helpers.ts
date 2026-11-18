import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePrices } from '../src/api/prices.js';
import { PlayerResponse } from '../src/api/schemas.js';
import { transportKey } from '../src/domain/compare.js';
import { configOf, createFavorite, favoriteId, type Favorite, type FavoriteTrip } from '../src/domain/favorites.js';
import { paxCount } from '../src/domain/pax.js';
import type { Offer, Pax } from '../src/domain/types.js';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function fixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

export function pax(adults: number, juveniles = 0, children = 0, babies = 0): Pax {
  return { adults, juveniles, children, babies };
}

export function matrix(jid: string, p: Pax) {
  const raw = PlayerResponse.parse(fixture(`prices-${jid}-${p.adults}-${p.juveniles}-${p.children}-${p.babies}.json`));
  return normalizePrices(raw, jid, p);
}

/**
 * Beispiel-Favoriten aus den echten Fixtures, für UI-Tests und Snapshots: einer günstiger als beim Merken (−120 €),
 * einer teurer (+85 €), einer mit nicht mehr angebotenem Abflughafen und einer, dessen Reise schon begonnen hat.
 * `future` verschiebt die Reisedaten weit in die Zukunft, damit Tests nicht vom Tagesdatum abhängen.
 */
export function demoFavorites(future = false): Favorite[] {
  const at = new Date('2026-11-14T09:00:00Z');
  const date = (iso: string) => (future ? `2099${iso.slice(4)}` : iso);
  const trip = (title: string, shipName: string, start: string, end: string) => ({
    title,
    shipName,
    startDate: date(start),
    endDate: date(end),
    duration: 7,
  });
  const make = (jid: string, p: Pax, pick: (o: Offer) => boolean, t: FavoriteTrip, shift: number) => {
    const m = matrix(jid, p);
    const o = m.offers.find(pick);
    if (!o) throw new Error(`Fixture ${jid} ohne passendes Angebot`);
    const f = createFavorite(configOf(o, p, false), m.offers, t, at)!;
    const { last: _last, ...rest } = f;
    return { ...rest, saved: { total: f.saved.total + shift, perPerson: f.saved.perPerson + shift / paxCount(p) } };
  };
  const pr = trip('Kanaren & Marokko ab Gran Canaria', 'AIDAprima', '2026-11-28', '2026-12-05');
  const cheaper = make('PR07261128', pax(2), (o) => o.tariffCode === 'CLA' && o.cabinGroup === 'V' && transportKey(o) === 'return:HAM:HAM', pr, 120);
  const pricier = make(
    'BL07261122',
    pax(2),
    (o) => o.tariffCode === 'CLA' && o.cabinGroup === 'M' && o.transport === 'none',
    trip('Kanaren & Madeira', 'AIDAblu', '2026-11-22', '2026-11-29'),
    -85,
  );
  const base = make(
    'CO07261212',
    pax(2),
    (o) => o.tariffCode === 'CLA' && o.transport === 'return',
    trip('Kanaren & Madeira ab Gran Canaria', 'AIDAcosma', '2026-12-12', '2026-12-19'),
    0,
  );
  const gone: Favorite = {
    ...base,
    transport: { key: 'return:FRA:FRA', kind: 'return', from: 'FRA', to: 'FRA', label: 'FRA ⇄ FRA' },
  };
  gone.id = favoriteId(gone);
  const departed: Favorite = {
    ...cheaper,
    pax: pax(1),
    trip: { ...cheaper.trip, startDate: '2026-10-03', endDate: '2026-10-10' },
  };
  departed.id = favoriteId(departed);
  return [cheaper, pricier, gone, departed];
}
