import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTERS } from '../src/domain/compare.js';
import { DEFAULT_PAX } from '../src/domain/pax.js';
import { configOf, createFavorite } from '../src/domain/favorites.js';
import { Cache } from '../src/store/cache.js';
import { loadFavorites, saveFavorites } from '../src/store/favorites.js';
import { DEFAULT_STATE, loadState, pushRecent, saveState } from '../src/store/state.js';
import { matrix, pax } from './helpers.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'findmyaida-store-'));

function stateFile(content: unknown): string {
  const file = path.join(tmpDir(), 'state.json');
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

describe('loadState', () => {
  it('liefert den Standardzustand, wenn die Datei fehlt, kaputt ist oder eine andere Version hat', () => {
    expect(loadState(path.join(tmpDir(), 'fehlt.json'))).toBe(DEFAULT_STATE);
    expect(loadState(stateFile('{ kein json'))).toBe(DEFAULT_STATE);
    expect(loadState(stateFile({ version: 2, view: 3 }))).toBe(DEFAULT_STATE);
  });

  it('ergänzt fehlende Felder aus dem Standardzustand', () => {
    const s = loadState(stateFile({ version: 1, view: 3, filters: { tariffs: ['CLASSIC'] } }));
    expect(s.view).toBe(3);
    expect(s.filters).toEqual({ ...DEFAULT_FILTERS, tariffs: ['CLASSIC'] });
    expect(s.pax).toEqual(DEFAULT_PAX);
    expect(s.focus).toEqual({});
    expect(s.tripQuery).toEqual({ chips: [], text: '' });
    expect(s.tripSort).toEqual(DEFAULT_STATE.tripSort);
  });

  it('übernimmt den Zustand aus dem früheren Ordner nur, wenn es noch keinen neuen gibt', () => {
    const legacy = stateFile({ version: 1, view: 2 });
    expect(loadState(path.join(tmpDir(), 'fehlt.json'), legacy).view).toBe(2);
    expect(loadState(stateFile({ version: 1, view: 4 }), legacy).view).toBe(4);
  });

  it('ersetzt ungültige Werte, statt sie zu übernehmen', () => {
    const s = loadState(
      stateFile({
        version: 1,
        pax: pax(0, 0, 2),
        view: 7,
        paxHistory: [pax(2), pax(9), pax(1, 1), pax(2, 0, 1), pax(2, 0, 2), pax(3), pax(4), pax(1)],
        recent: ['A', 5, null, ...Array.from({ length: 20 }, (_, i) => `J${i}`)],
        tripQuery: { chips: 'x', text: 5 },
      }),
    );
    expect(s.pax).toEqual(DEFAULT_PAX);
    expect(s.view).toBe(1);
    expect(s.paxHistory).toEqual([pax(2), pax(1, 1), pax(2, 0, 1), pax(2, 0, 2), pax(3), pax(4)]);
    expect(s.recent).toHaveLength(12);
    expect(s.recent.slice(0, 2)).toEqual(['A', 'J0']);
    expect(s.tripQuery).toEqual({ chips: [], text: '' });
  });

  it('füllt „zuletzt angesehen“ aus der letzten Reise eines älteren Zustands', () => {
    expect(loadState(stateFile({ version: 1, journeyId: 'PR07261128' })).recent).toEqual(['PR07261128']);
  });
});

describe('saveState und pushRecent', () => {
  it('schreibt einen Zustand, den loadState unverändert wieder liest', () => {
    const file = path.join(tmpDir(), 'neu', 'state.json');
    const state = { ...DEFAULT_STATE, view: 2 as const, journeyId: 'PR07261128', recent: ['PR07261128'] };
    saveState(file, state);
    expect(loadState(file)).toEqual(state);
  });

  it('scheitert still, wenn sich nicht schreiben lässt', () => {
    const blocker = stateFile('x');
    expect(() => saveState(path.join(blocker, 'state.json'), DEFAULT_STATE)).not.toThrow();
  });

  it('stellt die Reise nach vorn, ohne Dopplung, höchstens zwölf', () => {
    expect(pushRecent(['A', 'B', 'C'], 'B')).toEqual(['B', 'A', 'C']);
    const many = Array.from({ length: 12 }, (_, i) => `J${i}`);
    expect(pushRecent(many, 'NEU')).toEqual(['NEU', ...many.slice(0, 11)]);
  });
});

describe('Cache', () => {
  afterEach(() => vi.useRealTimers());

  it('liefert Einträge nur innerhalb der Gültigkeitsdauer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const cache = new Cache(null);
    cache.set('k', { a: 1 });
    expect(cache.get('k', 1000)).toEqual({ savedAt: 1_000_000, data: { a: 1 } });
    vi.setSystemTime(1_000_999);
    expect(cache.get('k', 1000)?.data).toEqual({ a: 1 });
    vi.setSystemTime(1_001_000);
    expect(cache.get('k', 1000)).toBeNull();
  });

  it('liest Einträge von der Platte in einer neuen Instanz und beachtet auch dort die Gültigkeitsdauer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    const dir = path.join(tmpDir(), 'cache');
    new Cache(dir).set('prices-bridge-PR07261128-2-0-0-0', [1, 2]);
    expect(new Cache(dir).get('prices-bridge-PR07261128-2-0-0-0', 1000)?.data).toEqual([1, 2]);
    vi.setSystemTime(6_000);
    expect(new Cache(dir).get('prices-bridge-PR07261128-2-0-0-0', 1000)).toBeNull();
  });

  it('macht aus dem Schlüssel einen sicheren Dateinamen', () => {
    const dir = tmpDir();
    new Cache(dir).set('region/../x:y', 1);
    expect(fs.readdirSync(dir)).toEqual(['region_.._x_y.json']);
  });

  it('löscht Einträge aus Speicher und Platte', () => {
    const dir = tmpDir();
    const cache = new Cache(dir);
    cache.set('k', 1);
    cache.delete('k');
    expect(cache.get('k', 1000)).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('funktioniert ohne Platte und bei nicht beschreibbarem Ordner weiter im Speicher', () => {
    const blocker = stateFile('x');
    const cache = new Cache(path.join(blocker, 'cache'));
    expect(() => cache.set('k', 1)).not.toThrow();
    expect(cache.get('k', 1000)?.data).toBe(1);
    expect(new Cache(null).get('k', 1000)).toBeNull();
  });
});

describe('Favoriten-Datei', () => {
  const m = matrix('PR07261128', pax(2));
  const offer = m.offers.find((o) => o.tariffCode === 'CLA' && o.cabinGroup === 'V')!;
  const trip = { title: 'Kanaren', shipName: 'AIDAprima', startDate: '2026-11-28', endDate: '2026-12-05', duration: 7 };
  const fav = (expand = false) =>
    createFavorite(configOf(offer, pax(2), expand), m.offers, trip, new Date('2026-11-16T10:00:00Z'))!;

  it('Schreiben und Lesen ergeben dieselben Daten; fehlende Datei ergibt eine leere Liste', () => {
    const file = path.join(tmpDir(), 'favorites.json');
    expect(loadFavorites(file)).toEqual({ favorites: [], corrupt: false, skipped: 0 });
    const list = [fav(false), { ...fav(true), last: { at: '2026-11-16T11:00:00Z', status: 'ok' as const, total: 1, perPerson: 1 } }];
    saveFavorites(file, list);
    expect(loadFavorites(file)).toEqual({ favorites: list, corrupt: false, skipped: 0 });
    expect(fs.readdirSync(path.dirname(file))).toEqual(['favorites.json']);
  });

  it('überspringt ungültige Einträge einzeln und behält die gültigen', () => {
    const good = fav();
    const file = path.join(tmpDir(), 'favorites.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        favorites: [good, { ...good, saved: { total: 'teuer' } }, { ...good, pax: { ...good.pax, adults: 0 } }, good],
      }),
    );
    const r = loadFavorites(file);
    expect(r.favorites).toEqual([good]);
    expect(r.skipped).toBe(3);
  });

  it('sichert eine kaputte Datei als .bak, statt sie zu überschreiben', () => {
    const file = path.join(tmpDir(), 'favorites.json');
    fs.writeFileSync(file, '{ kaputt');
    const r = loadFavorites(file);
    expect(r).toEqual({ favorites: [], corrupt: true, skipped: 0 });
    saveFavorites(file, [fav()], r.corrupt);
    expect(fs.readFileSync(`${file}.bak`, 'utf8')).toBe('{ kaputt');
    expect(loadFavorites(file).favorites).toHaveLength(1);
  });
});
