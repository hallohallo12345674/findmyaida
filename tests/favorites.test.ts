import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, transportKey } from '../src/domain/compare.js';
import {
  configOf,
  createFavorite,
  evaluateFavorite,
  favoriteId,
  filtersHide,
  isDeparted,
  priceDelta,
  type FavoriteConfig,
} from '../src/domain/favorites.js';
import type { Offer } from '../src/domain/types.js';
import { favoriteView, homeLists } from '../src/ui/favorites.js';
import { matrix, pax } from './helpers.js';

const m = matrix('PR07261128', pax(2));
const AT = '2026-11-16T10:00:00.000Z';
const TRIP = { title: 'Kanaren', shipName: 'AIDAprima', startDate: '2026-11-28', endDate: '2026-12-05', duration: 7 };

/** Ein Rückflug-Angebot ab HAM in der Verandakategorie (V). */
const sample = (): Offer => {
  const o = m.offers.find((x) => x.cabinGroup === 'V' && transportKey(x) === 'return:HAM:HAM' && x.tariffCode === 'CLA');
  if (!o) throw new Error('Fixture enthält kein passendes Angebot');
  return o;
};

const cheapest = (list: Offer[]) => Math.min(...list.map((o) => o.total));

describe('Favoriten: Konfiguration', () => {
  it('speichert die Kabine wie angezeigt: Kategorie bzw. Unterkategorie', () => {
    const o = sample();
    const g = configOf(o, pax(2), false);
    const s = configOf(o, pax(2), true);
    expect(g.cabin).toMatchObject({ level: 'group', code: 'V', group: 'V' });
    expect(s.cabin).toMatchObject({ level: 'sub', code: o.cabinCode, group: 'V' });
    expect(g.tariff).toEqual({ code: 'CLA', name: 'CLASSIC' });
    expect(g.transport).toMatchObject({ key: 'return:HAM:HAM', kind: 'return', from: 'HAM', to: 'HAM' });
    expect(favoriteId(g)).not.toBe(favoriteId(s));
  });

  it('die ID hängt nur an der Konfiguration, nicht an der Produkt-ID der Antwort', () => {
    const o = sample();
    const a = favoriteId(configOf(o, pax(2), false));
    const b = favoriteId(configOf({ ...o, id: 'PR07261128:999' }, pax(2), false));
    expect(a).toBe(b);
    expect(a).toBe('PR07261128|2-0-0-0|CLA|group:V|return:HAM:HAM');
    expect(favoriteId(configOf(o, pax(1), false))).not.toBe(a);
  });

  it('Vergleichswert ist das günstigste passende Angebot, auch wenn ein teureres gezeigt wurde', () => {
    const c = configOf(sample(), pax(2), false);
    const hits = m.offers.filter((x) => x.tariffCode === 'CLA' && x.cabinGroup === 'V' && transportKey(x) === 'return:HAM:HAM');
    const best = hits.reduce((a, b) => (b.total < a.total ? b : a));
    const pricier = hits.find((x) => x.total > best.total);
    const f = createFavorite(configOf(pricier ?? best, pax(2), false), m.offers, TRIP, new Date(AT))!;
    expect(f.id).toBe(favoriteId(c));
    expect(f.saved).toEqual({ total: best.total, perPerson: best.perPerson });
    expect(f.last).toEqual({ at: AT, status: 'ok', total: best.total, perPerson: best.perPerson });
    expect(priceDelta(f, f.last)).toBe(0);
    expect(f.savedAt).toBe(AT);
    // ohne passendes Angebot entsteht kein Favorit
    expect(createFavorite(c, [], TRIP, new Date(AT))).toBeNull();
  });
});

describe('Favoriten: Bewertung', () => {
  it('nimmt das günstigste passende Angebot und rechnet die Differenz', () => {
    const o = sample();
    const c = configOf(o, pax(2), false);
    const expected = cheapest(
      m.offers.filter((x) => x.tariffCode === 'CLA' && x.cabinGroup === 'V' && transportKey(x) === 'return:HAM:HAM'),
    );
    const check = evaluateFavorite(c, m.offers, AT);
    expect(check).toMatchObject({ status: 'ok', total: expected });
    const fav = { saved: { total: expected + 120, perPerson: 0 } };
    expect(priceDelta(fav, check)).toBe(-120);
    expect(priceDelta({ saved: { total: expected - 50.5, perPerson: 0 } }, check)).toBe(50.5);
  });

  it('Unterkategorie: nur genau diese Kabine zählt', () => {
    const o = sample();
    const c = configOf(o, pax(2), true);
    const check = evaluateFavorite(c, m.offers, AT);
    const subOnly = m.offers.filter(
      (x) => x.tariffCode === 'CLA' && x.cabinCode === o.cabinCode && transportKey(x) === 'return:HAM:HAM',
    );
    expect(check).toMatchObject({ status: 'ok', total: cheapest(subOnly) });
  });

  it('ignoriert die Filter des Vergleichs', () => {
    const c = configOf(sample(), pax(2), false);
    expect(filtersHide({ ...DEFAULT_FILTERS, tariffs: ['LIG'] }, c)).toBe(true);
    expect(filtersHide({ ...DEFAULT_FILTERS, depAirports: ['BER'] }, c)).toBe(true);
    expect(filtersHide(DEFAULT_FILTERS, c)).toBe(false);
    // Bewertung bekommt immer alle Angebote, Filter spielen keine Rolle
    expect(evaluateFavorite(c, m.offers, AT).status).toBe('ok');
  });

  const variants: [string, (c: FavoriteConfig) => FavoriteConfig, Offer[] | null, RegExp][] = [
    ['Belegung', (c) => c, [], /^Für 2 Erw\. nicht mehr buchbar$/],
    ['Tarif', (c) => ({ ...c, tariff: { code: 'VAR', name: 'VARIO' } }), null, /^Tarif VARIO nicht mehr verfügbar$/],
    [
      'Kabine (gibt es gar nicht)',
      (c) => ({ ...c, cabin: { level: 'group', code: 'S', group: 'S', name: 'Suite' } }),
      null,
      /^Suite ausgebucht$/,
    ],
    [
      'Unterkategorie',
      (c) => ({ ...c, cabin: { level: 'sub', code: 'XX', group: 'V', name: 'Veranda' } }),
      null,
      /^Veranda \(XX\) ausgebucht$/,
    ],
    [
      'Abflughafen',
      (c) => ({ ...c, transport: { ...c.transport, key: 'return:FRA:FRA', from: 'FRA', to: 'FRA' } }),
      null,
      /^Flug ab FRA nicht mehr verfügbar$/,
    ],
    [
      'Rückflughafen',
      (c) => ({ ...c, transport: { ...c.transport, key: 'return:HAM:MUC', to: 'MUC' } }),
      null,
      /^Rückflug nach MUC nicht mehr verfügbar$/,
    ],
  ];
  for (const [name, change, offers, reason] of variants) {
    it(`nicht mehr verfügbar (${name}): klarer Grund, kein Preisvergleich`, () => {
      const c = change(configOf(sample(), pax(2), false));
      const check = evaluateFavorite(c, offers ?? m.offers, AT);
      expect(check.status).toBe('unavailable');
      if (check.status === 'unavailable') expect(check.reason).toMatch(reason);
      expect(priceDelta({ saved: { total: 1000, perPerson: 500 } }, check)).toBeNull();
    });
  }

  it('Kabine nur in anderem Tarif: Grund nennt den Tarif', () => {
    // Veranda im Tarif CLASSIC ist ausgebucht, in anderen Tarifen gibt es sie noch.
    const offers = m.offers.filter((o) => !(o.tariffCode === 'CLA' && o.cabinGroup === 'V'));
    expect(offers.some((o) => o.cabinGroup === 'V')).toBe(true);
    const check = evaluateFavorite(configOf(sample(), pax(2), false), offers, AT);
    expect(check.status === 'unavailable' && check.reason).toBe('Balkon/Veranda im Tarif CLASSIC ausgebucht');
  });

  it('abgefahrene Reisen werden erkannt', () => {
    expect(isDeparted({ trip: TRIP }, '2026-11-16')).toBe(false);
    expect(isDeparted({ trip: TRIP }, '2026-11-28')).toBe(false);
    expect(isDeparted({ trip: TRIP }, '2026-11-29')).toBe(true);
  });
});

describe('Favoriten: Anzeige und Platz auf der Startseite', () => {
  const fav = () => createFavorite(configOf(sample(), pax(2), false), m.offers, TRIP, new Date(AT))!;

  it('Status je Favorit: abgefahren, Prüfung läuft, Fehler mit letztem Stand, nicht verfügbar ohne Differenz', () => {
    const f = fav();
    expect(favoriteView(f, undefined, '2026-12-01')).toEqual({ kind: 'departed' });
    expect(favoriteView(f, { kind: 'loading' }, '2026-11-16')).toEqual({ kind: 'checking' });
    expect(favoriteView(f, { kind: 'done' }, '2026-11-16')).toEqual({ kind: 'price', total: f.saved.total, delta: 0 });
    expect(favoriteView(f, { kind: 'error', text: 'Offline' }, '2026-11-17')).toEqual({
      kind: 'price',
      total: f.saved.total,
      delta: 0,
      stale: '16.11.',
      error: 'Offline',
    });
    const gone = { ...f, last: { at: AT, status: 'unavailable' as const, reason: 'Tarif VARIO nicht mehr verfügbar' } };
    const v = favoriteView(gone, { kind: 'done' }, '2026-11-16');
    expect(v).toEqual({ kind: 'unavailable', reason: 'Tarif VARIO nicht mehr verfügbar' });
    expect('delta' in v).toBe(false);
  });

  it('Favoriten haben Vorrang, „Zuletzt angesehen“ höchstens drei', () => {
    expect(homeLists(20, 2, 5)).toEqual({ favorites: 2, more: false, recent: 3, height: 6 + 5 });
    expect(homeLists(13, 4, 1)).toEqual({ favorites: 4, more: false, recent: 1, height: 10 + 3 });
    // zu wenig Platz: Liste scrollt, „Zuletzt“ weicht zuerst
    const tight = homeLists(9, 10, 3);
    expect(tight.favorites).toBeGreaterThanOrEqual(1);
    expect(tight.more).toBe(true);
    expect(tight.height).toBeLessThanOrEqual(9);
    expect(homeLists(4, 3, 3)).toMatchObject({ favorites: 0, recent: 2 });
    expect(homeLists(10, 0, 5)).toEqual({ favorites: 0, more: false, recent: 3, height: 5 });
  });
});
