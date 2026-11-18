import { priceDelta, isDeparted, type Favorite, type FavoriteTrip } from '../domain/favorites.js';
import { paxKey, paxSummary } from '../domain/pax.js';
import type { CruiseInfo, Departure } from '../domain/types.js';
import { dateShort, signedEuroDetail, signedPercent } from './format.js';
import type { CheckStatus } from './hooks/favorites.js';

/*
 * Ansichtslogik der Favoriten ohne Ink: Gruppierung der Startprüfung, Anzeigestatus je Favorit und die
 * Platzaufteilung der Startseite.
 */

/** Eine Preisabfrage deckt alle Favoriten derselben Reise und Belegung ab. */
export function checkGroupKey(f: Pick<Favorite, 'journeyId' | 'pax'>): string {
  return `${f.journeyId}|${paxKey(f.pax)}`;
}

/** Lokales Datum als YYYY-MM-DD (Abfahrtstage sind Kalendertage, keine UTC-Zeitpunkte). */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Reiseangaben für den Favoriten aus dem Katalog, ersatzweise aus der Preisantwort. */
export function tripOf(journeyId: string, dep: Departure | undefined, cruise: CruiseInfo | undefined): FavoriteTrip {
  if (dep) {
    return { title: dep.title, shipName: dep.shipName, startDate: dep.startDate, endDate: dep.endDate, duration: dep.duration };
  }
  if (cruise) {
    return {
      title: cruise.routeName,
      shipName: cruise.shipName,
      startDate: cruise.startDate.slice(0, 10),
      endDate: cruise.endDate.slice(0, 10),
      duration: Math.max(1, daysBetween(cruise.startDate.slice(0, 10), cruise.endDate.slice(0, 10))),
    };
  }
  return { title: journeyId, shipName: '', startDate: '9999-12-31', endDate: '9999-12-31', duration: 0 };
}

/** „Veranda · CLASSIC · Flug HAM ⇄ HAM · 2 Erw.“ */
export function configLine(f: Favorite): string {
  const transport = f.transport.kind === 'none' ? f.transport.label : `Flug ${f.transport.label}`;
  return [f.cabin.name, f.tariff.name, transport, paxSummary(f.pax)].join(' · ');
}

export type FavoriteView =
  | { kind: 'checking' }
  | { kind: 'departed' }
  /** stale: Datum des letzten Stands, wenn die aktuelle Prüfung fehlte oder scheiterte */
  | { kind: 'price'; total: number; delta: number; stale?: string; error?: string }
  | { kind: 'unavailable'; reason: string; stale?: string; error?: string }
  | { kind: 'error'; text: string };

/**
 * Was zu einem Favoriten angezeigt wird. Eine Preisdifferenz gibt es nur bei verfügbarem Angebot; ist die
 * Kombination nicht mehr verfügbar, steht nur der Grund da.
 */
export function favoriteView(f: Favorite, status: CheckStatus | undefined, today: string): FavoriteView {
  if (isDeparted(f, today)) return { kind: 'departed' };
  if (status?.kind === 'pending' || status?.kind === 'loading') return { kind: 'checking' };
  const last = f.last;
  const error = status?.kind === 'error' ? status.text : undefined;
  if (!last) return error ? { kind: 'error', text: error } : { kind: 'checking' };
  // Ohne erfolgreiche Prüfung in dieser Sitzung gilt der letzte Stand – mit Datum, wenn er nicht von heute ist.
  const fresh = status?.kind === 'done' || (!error && last.at.slice(0, 10) === today);
  const stale = fresh ? undefined : dateShort(last.at.slice(0, 10));
  const extra = { ...(stale ? { stale } : {}), ...(error ? { error } : {}) };
  if (last.status === 'unavailable') return { kind: 'unavailable', reason: last.reason, ...extra };
  return { kind: 'price', total: last.total, delta: priceDelta(f, last) ?? 0, ...extra };
}

export interface HomeLists {
  /** Anzahl sichtbarer Favoriten (je zwei Zeilen) */
  favorites: number;
  /** ob eine Zeile „↓ n weitere“ nötig ist */
  more: boolean;
  /** Anzahl sichtbarer „Zuletzt angesehen“ */
  recent: number;
  /** belegte Zeilen insgesamt */
  height: number;
}

export const MAX_RECENT_HOME = 3;

/**
 * Teilt die freien Zeilen der Startseite auf. Favoriten haben Vorrang (zwei Zeilen je Eintrag, darüber Leerzeile
 * und Überschrift), „Zuletzt angesehen“ bekommt den Rest, höchstens drei.
 */
export function homeLists(room: number, favCount: number, recentCount: number, recentLimit = MAX_RECENT_HOME): HomeLists {
  const recentPart = (n: number) => (n ? 2 + n : 0);
  const favPart = (n: number, more: boolean) => (n ? 2 + 2 * n + (more ? 1 : 0) : 0);
  const maxRecent = Math.max(0, Math.min(recentLimit, recentCount, room - 2));
  if (favCount) {
    for (let recent = maxRecent; recent >= 0; recent--) {
      const free = room - recentPart(recent);
      let fav = Math.min(favCount, Math.floor((free - 2) / 2));
      let more = false;
      if (fav < favCount) {
        fav = Math.floor((free - 3) / 2);
        more = true;
      }
      if (fav >= 1) return { favorites: fav, more, recent, height: favPart(fav, more) + recentPart(recent) };
    }
  }
  // Kein Favorit passt (oder es gibt keine): nur „Zuletzt angesehen“, so viel Platz ist.
  return { favorites: 0, more: false, recent: maxRecent, height: recentPart(maxRecent) };
}

/** Änderung als „−120 €“ oder „−4,7 %“ (bezogen auf den Preis beim Merken). */
export function formatDelta(delta: number, savedTotal: number, mode: 'euro' | 'percent'): string {
  return mode === 'percent' && savedTotal > 0 ? signedPercent(delta / savedTotal) : signedEuroDetail(delta);
}

/** Richtung für die Farbe: kleine Änderungen unter der Schwelle bleiben neutral. */
export function deltaTone(delta: number, threshold: number): 'down' | 'up' | 'flat' {
  if (delta === 0 || Math.abs(delta) < threshold) return 'flat';
  return delta < 0 ? 'down' : 'up';
}

/**
 * Reihenfolge der Favoriten. Abgefahrene immer zuletzt. „change“: größte Preissenkung zuerst, ohne Preis
 * (nicht verfügbar, noch nicht geprüft) danach; „saved“: zuletzt gemerkte zuerst.
 */
export function sortFavorites<T extends { fav: Favorite }>(
  items: T[],
  sort: 'departure' | 'change' | 'saved',
  today: string,
): T[] {
  const byDate = (a: T, b: T) =>
    a.fav.trip.startDate.localeCompare(b.fav.trip.startDate) || a.fav.savedAt.localeCompare(b.fav.savedAt);
  const delta = (t: T) => priceDelta(t.fav, t.fav.last);
  return [...items].sort((a, b) => {
    const dep = Number(isDeparted(a.fav, today)) - Number(isDeparted(b.fav, today));
    if (dep) return dep;
    if (sort === 'saved') return b.fav.savedAt.localeCompare(a.fav.savedAt);
    if (sort === 'change') {
      const da = delta(a);
      const db = delta(b);
      if (da === null || db === null) return Number(da === null) - Number(db === null) || byDate(a, b);
      return da - db || byDate(a, b);
    }
    return byDate(a, b);
  });
}
