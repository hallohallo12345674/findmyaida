import { cabinGroupLabel } from './cabins.js';
import { shortCabinName, transportKey, transportLabel } from './compare.js';
import { paxKey, paxSummary } from './pax.js';
import { tariffInfo } from './tariffs.js';
import type { Filters, Offer, Pax, TransportKind } from './types.js';

/**
 * Ein Favorit hält die Angebotskonfiguration fest, die im Vergleich gerade angezeigt wurde, und den Preis beim
 * Speichern als festen Vergleichswert. Bewertet wird immer das günstigste Angebot, das zur Konfiguration passt.
 */
export interface FavoriteConfig {
  journeyId: string;
  pax: Pax;
  tariff: { code: string; name: string };
  /** level 'group': Kabinenkategorie (z. B. „V“), 'sub': genau diese Unterkategorie (z. B. „VH“). */
  cabin: { level: 'group' | 'sub'; code: string; group: string; name: string };
  /** key wie `transportKey`: Art:Abflughafen:Rückflughafen */
  transport: { key: string; kind: TransportKind; from?: string; to?: string; label: string };
}

/** Angaben zur Reise, damit der Favorit auch ohne Katalog angezeigt werden kann. */
export interface FavoriteTrip {
  title: string;
  shipName: string;
  startDate: string;
  endDate: string;
  duration: number;
}

export type FavoriteCheck =
  | { at: string; status: 'ok'; total: number; perPerson: number }
  | { at: string; status: 'unavailable'; reason: string };

export interface Favorite extends FavoriteConfig {
  id: string;
  savedAt: string;
  trip: FavoriteTrip;
  /** Preis beim Speichern – fester Vergleichswert, wird nie überschrieben. */
  saved: { total: number; perPerson: number };
  /** Letzte erfolgreiche Prüfung, damit offline der letzte Stand sichtbar bleibt. */
  last?: FavoriteCheck;
}

/** Konfiguration des gezeigten Angebots; die Kabine „wie angezeigt“ (mit Unterkategorien genau diese). */
export function configOf(o: Offer, pax: Pax, expand: boolean): FavoriteConfig {
  return {
    journeyId: o.journeyId,
    pax: { ...pax },
    tariff: { code: o.tariffCode, name: tariffInfo(o.tariffCode, o.tariffName).short },
    cabin: expand
      ? { level: 'sub', code: o.cabinCode, group: o.cabinGroup, name: shortCabinName(o.cabinName) }
      : { level: 'group', code: o.cabinGroup, group: o.cabinGroup, name: cabinGroupLabel(o.cabinGroup) },
    transport: {
      key: transportKey(o),
      kind: o.transport,
      ...(o.outbound ? { from: o.outbound.from } : {}),
      ...(o.inbound ? { to: o.inbound.to } : {}),
      label: transportLabel(o),
    },
  };
}

/** Stabile ID aus Reise, Belegung und Konfiguration (`Offer.id` gilt nur innerhalb einer Antwort). */
export function favoriteId(c: FavoriteConfig): string {
  return [c.journeyId, paxKey(c.pax), c.tariff.code, `${c.cabin.level}:${c.cabin.code}`, c.transport.key].join('|');
}

/**
 * Neuer Favorit. Vergleichswert ist das günstigste passende Angebot – derselbe Maßstab wie bei jeder späteren
 * Prüfung. Sonst würde z. B. eine teurere Flugzeit aus der Angebotsliste sofort als Preissenkung erscheinen.
 */
export function createFavorite(c: FavoriteConfig, offers: Offer[], trip: FavoriteTrip, now: Date): Favorite | null {
  const check = evaluateFavorite(c, offers, now.toISOString());
  if (check.status !== 'ok') return null;
  return {
    ...c,
    id: favoriteId(c),
    savedAt: now.toISOString(),
    trip,
    saved: { total: check.total, perPerson: check.perPerson },
    last: check,
  };
}

function matchesCabinConfig(o: Offer, cabin: FavoriteConfig['cabin']): boolean {
  return cabin.level === 'sub' ? o.cabinCode === cabin.code : o.cabinGroup === cabin.code;
}

/** Alle Angebote, die zur Konfiguration passen – unabhängig von den Filtern im Vergleich. */
export function matchingOffers(c: FavoriteConfig, offers: Offer[]): Offer[] {
  return offers.filter(
    (o) => o.tariffCode === c.tariff.code && matchesCabinConfig(o, c.cabin) && transportKey(o) === c.transport.key,
  );
}

/** Hat die Reise schon begonnen? `today` als YYYY-MM-DD. */
export function isDeparted(f: Pick<Favorite, 'trip'>, today: string): boolean {
  return f.trip.startDate < today;
}

/**
 * Bewertet einen Favoriten anhand aller Angebote einer frisch geladenen Preismatrix. Ohne passendes Angebot
 * nennt das Ergebnis den genauesten erkennbaren Grund – und keinen Preis, damit nichts Falsches verglichen wird.
 */
export function evaluateFavorite(c: FavoriteConfig, offers: Offer[], at: string): FavoriteCheck {
  const hits = matchingOffers(c, offers);
  if (hits.length) {
    const best = hits.reduce((a, b) => (b.total < a.total ? b : a));
    return { at, status: 'ok', total: best.total, perPerson: best.perPerson };
  }
  return { at, status: 'unavailable', reason: unavailableReason(c, offers) };
}

function unavailableReason(c: FavoriteConfig, offers: Offer[]): string {
  if (!offers.length) return `Für ${paxSummary(c.pax)} nicht mehr buchbar`;
  const inTariff = offers.filter((o) => o.tariffCode === c.tariff.code);
  if (!inTariff.length) return `Tarif ${c.tariff.name} nicht mehr verfügbar`;
  const cabinLabel = c.cabin.level === 'sub' ? `${c.cabin.name} (${c.cabin.code})` : c.cabin.name;
  const withCabin = inTariff.filter((o) => matchesCabinConfig(o, c.cabin));
  if (!withCabin.length) {
    return offers.some((o) => matchesCabinConfig(o, c.cabin))
      ? `${cabinLabel} im Tarif ${c.tariff.name} ausgebucht`
      : `${cabinLabel} ausgebucht`;
  }
  const t = c.transport;
  if (t.kind === 'none') return 'Eigene An- und Abreise nicht mehr verfügbar';
  const sameKind = withCabin.filter((o) => o.transport === t.kind);
  if (t.from && !sameKind.some((o) => o.outbound?.from === t.from)) return `Flug ab ${t.from} nicht mehr verfügbar`;
  if (t.to && !sameKind.some((o) => o.inbound?.to === t.to)) return `Rückflug nach ${t.to} nicht mehr verfügbar`;
  return `${t.label} nicht mehr verfügbar`;
}

/** Preisänderung seit dem Speichern – nur bei verfügbarem Angebot, sonst null. 2118 → 1998 ergibt −120. */
export function priceDelta(f: Pick<Favorite, 'saved'>, check: FavoriteCheck | undefined): number | null {
  if (!check || check.status !== 'ok') return null;
  return Math.round((check.total - f.saved.total) * 100) / 100;
}

/** Würden die Filter des Vergleichs das Angebot des Favoriten ausblenden? */
export function filtersHide(filters: Filters, c: FavoriteConfig): boolean {
  return relaxFilters(filters, c) !== filters;
}

/**
 * Lockert nur die Filter, die den Favoriten ausblenden würden; alle anderen bleiben, wie sie sind.
 * Gibt dasselbe Objekt zurück, wenn nichts zu ändern ist.
 */
export function relaxFilters(filters: Filters, c: FavoriteConfig): Filters {
  const next = { ...filters };
  let changed = false;
  if (filters.tariffs.length && !filters.tariffs.includes(c.tariff.code)) {
    next.tariffs = [];
    changed = true;
  }
  if (filters.cabinGroups.length && !filters.cabinGroups.includes(c.cabin.group)) {
    next.cabinGroups = [];
    changed = true;
  }
  if (filters.transports.length && !filters.transports.includes(c.transport.kind)) {
    next.transports = [...filters.transports, c.transport.kind];
    changed = true;
  }
  const { from, to } = c.transport;
  if (from && filters.depAirports.length && !filters.depAirports.includes(from)) {
    next.depAirports = [];
    changed = true;
  }
  if (to && filters.arrAirports.length && !filters.arrAirports.includes(to)) {
    next.arrAirports = [];
    changed = true;
  }
  return changed ? next : filters;
}
