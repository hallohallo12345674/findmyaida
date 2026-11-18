import { describe, expect, it } from 'vitest';
import { normalizeCatalog } from '../src/api/catalog.js';
import { CatalogResponse } from '../src/api/schemas.js';
import { toggleValue } from '../src/ui/components/dialogs.js';
import { windowAround } from '../src/ui/layout.js';
import { hitTest } from '../src/ui/mouse/MouseProvider.js';
import { isMouseSequence, parseSgrMouse } from '../src/ui/mouse/parse.js';
import {
  acceptSuggestion,
  buildContext,
  EMPTY_QUERY,
  filterTrips,
  hasOrphanHolidayCommand,
  parseDuration,
  removeChip,
  removeLastChip,
  resolveCommands,
  suggest,
  visibleCommands,
} from '../src/ui/search/query.js';
import { buildIndex } from '../src/ui/search.js';
import { fixture } from './helpers.js';

describe('SGR-Maus', () => {
  it('parst Klick, Loslassen, Rad und Modifikatoren (0-basiert)', () => {
    expect(parseSgrMouse('\x1b[<0;10;5M')).toMatchObject({ x: 9, y: 4, button: 0, kind: 'down' });
    expect(parseSgrMouse('[<0;10;5m')).toMatchObject({ kind: 'up' });
    expect(parseSgrMouse('[<64;3;3M')).toMatchObject({ kind: 'wheelUp' });
    expect(parseSgrMouse('[<65;3;3M')).toMatchObject({ kind: 'wheelDown' });
    expect(parseSgrMouse('[<32;3;3M')).toMatchObject({ kind: 'drag', button: 0 });
    expect(parseSgrMouse('[<4;1;1M')).toMatchObject({ shift: true });
    expect(parseSgrMouse('q')).toBeNull();
    expect(isMouseSequence('[<0;1;1M')).toBe(true);
    expect(isMouseSequence('[A')).toBe(false);
  });

  it('Treffer: oberste Ebene ist modal, sonst kleinstes Element', () => {
    const regions = [
      { id: 'screen', layer: 0, rect: { x: 0, y: 0, w: 100, h: 30 } },
      { id: 'button', layer: 0, rect: { x: 10, y: 5, w: 8, h: 1 } },
      { id: 'backdrop', layer: 1, rect: { x: 0, y: 0, w: 100, h: 30 } },
      { id: 'dialog', layer: 1, rect: { x: 30, y: 10, w: 40, h: 10 } },
    ];
    expect(hitTest(regions, 12, 5)?.id).toBe('backdrop');
    expect(hitTest(regions, 35, 12)?.id).toBe('dialog');
    expect(hitTest(regions.slice(0, 2), 12, 5)?.id).toBe('button');
    expect(hitTest(regions.slice(0, 2), 50, 20)?.id).toBe('screen');
  });
});

describe('Suchbefehle und Vorschläge', () => {
  const catalog = normalizeCatalog([CatalogResponse.parse(fixture('catalog-demo.json'))]);
  const ctx = buildContext(catalog, [
    { code: 'VRKA', name: 'Kanaren' },
    { code: 'VRNE', name: 'Nordeuropa' },
  ]);

  it('schlägt Regionen, Schiffe und Monate ohne Präfix vor', () => {
    const kan = suggest({ chips: [], text: 'kan' }, ctx);
    expect(kan[0]).toMatchObject({ type: 'chip', chip: { kind: 'region', value: 'VRKA' } });
    const cos = suggest({ chips: [], text: 'cos' }, ctx);
    expect(cos.some((s) => s.type === 'chip' && s.chip.kind === 'ship' && s.chip.label === 'AIDAcosma')).toBe(true);
    const dez = suggest({ chips: [], text: 'dez' }, ctx);
    expect(dez[0]).toMatchObject({ type: 'chip', chip: { kind: 'month', value: '2026-12', label: 'Dezember 2026' } });
    const reg = suggest({ chips: [], text: 'reg' }, ctx);
    expect(reg[0]).toMatchObject({ type: 'command', insert: 'region:' });
  });

  it('versteht Befehle mit Wert und Slash-Befehle', () => {
    expect(suggest({ chips: [], text: 'schiff:blu' }, ctx)[0]).toMatchObject({ chip: { value: 'BL' } });
    expect(suggest({ chips: [], text: 'd:8-14' }, ctx)[0]).toMatchObject({ chip: { value: '8-14', label: '8–14 Tage' } });
    expect(suggest({ chips: [], text: '/al' }, ctx)[0]).toMatchObject({ type: 'slash', command: 'alle' });
    expect(parseDuration('15+')).toBe('15-999');
    expect(parseDuration('<8')).toBe('1-7');
  });

  it('übernimmt Vorschläge als Chips und löst getippte Befehle auf', () => {
    const q = acceptSuggestion({ chips: [], text: 'madeira kan' }, suggest({ chips: [], text: 'madeira kan' }, ctx)[0]!);
    expect(q).toEqual({ chips: [{ kind: 'region', value: 'VRKA', label: 'Kanaren' }], text: 'madeira ' });
    const r = resolveCommands({ chips: [], text: 'schiff:cosma madeira monat:dez' }, ctx);
    expect(r.chips.map((c) => c.value)).toEqual(['CO', '2026-12']);
    expect(r.text).toBe('madeira');
  });

  it('filtert: gleiche Kategorie ODER, verschiedene UND', () => {
    const index = buildIndex(catalog);
    const all = filterTrips(catalog, index, EMPTY_QUERY, new Map()).deps.length;
    expect(all).toBe(catalog.departures.length);
    const ships = filterTrips(
      catalog,
      index,
      { chips: [{ kind: 'ship', value: 'BL', label: 'AIDAblu' }, { kind: 'ship', value: 'MA', label: 'AIDAmar' }], text: '' },
      new Map(),
    ).deps;
    expect(ships.every((d) => d.shipCode === 'BL' || d.shipCode === 'MA')).toBe(true);
    const both = filterTrips(
      catalog,
      index,
      {
        chips: [
          { kind: 'ship', value: 'BL', label: 'AIDAblu' },
          { kind: 'duration', value: '8-14', label: '8–14 Tage' },
        ],
        text: '',
      },
      new Map(),
    ).deps;
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((d) => d.shipCode === 'BL' && d.duration >= 8 && d.duration <= 14)).toBe(true);
    const pending = filterTrips(catalog, index, { chips: [{ kind: 'region', value: 'VRKA', label: 'Kanaren' }], text: '' }, new Map());
    expect(pending.pendingRegions).toEqual(['VRKA']);
  });
});

describe('Filter-Auswahl im Dialog', () => {
  const all = ['a', 'b', 'c'];
  it('leer = alle; Abwählen aus „alle“ lässt die übrigen stehen', () => {
    expect(toggleValue([], 'b', all)).toEqual(['a', 'c']);
    expect(toggleValue(['a', 'c'], 'b', all)).toEqual([]);
    expect(toggleValue(['a'], 'a', all)).toEqual([]);
  });
});

describe('Schulferien-Befehle', () => {
  const catalog = normalizeCatalog([CatalogResponse.parse(fixture('catalog-demo.json'))]);
  const ctx = buildContext(catalog, []);
  const by = { kind: 'state' as const, value: 'BY', label: 'BY', long: 'Bayern' };

  it('Bundesland per Name, Kürzel und Alias; Vorschlag lang, Chip kurz', () => {
    const s = suggest({ chips: [], text: 'bay' }, ctx)[0]!;
    expect(s).toMatchObject({ type: 'chip', chip: { kind: 'state', value: 'BY', label: 'BY', long: 'Bayern' } });
    const q = acceptSuggestion({ chips: [], text: 'bay' }, s);
    expect(q.chips[0]!.label).toBe('BY');
    expect(suggest({ chips: [], text: 'nrw' }, ctx)[0]).toMatchObject({ chip: { value: 'NW', long: 'Nordrhein-Westfalen' } });
    expect(suggest({ chips: [], text: 'by' }, ctx)[0]).toMatchObject({ chip: { value: 'BY' } });
    expect(suggest({ chips: [], text: 'land:nordrhein' }, ctx)[0]).toMatchObject({ chip: { value: 'NW' } });
    expect(suggest({ chips: [], text: 'bl:sa' }, ctx).map((x) => x.type === 'chip' && x.chip.value)).toEqual(
      expect.arrayContaining(['SL', 'SN', 'ST']),
    );
  });

  it('ferien: nur mit Bundesland – Vorschläge, Befehlsliste und Auflösung', () => {
    expect(suggest({ chips: [], text: 'ferien:' }, ctx)).toEqual([]);
    expect(suggest({ chips: [], text: 'som' }, ctx).some((x) => x.type === 'chip' && x.chip.kind === 'holiday')).toBe(false);
    expect(suggest({ chips: [], text: 'fer' }, ctx).some((x) => x.type === 'command' && x.insert === 'ferien:')).toBe(false);
    expect(visibleCommands({ chips: [], text: '' }).some((c) => c.key === 'ferien:')).toBe(false);
    expect(visibleCommands({ chips: [by], text: '' }).some((c) => c.key === 'ferien:')).toBe(true);
    expect(hasOrphanHolidayCommand({ chips: [], text: 'ferien:sommer' })).toBe(true);
    expect(resolveCommands({ chips: [], text: 'ferien:sommer' }, ctx).chips).toEqual([]);

    const som = suggest({ chips: [by], text: 'som' }, ctx);
    expect(som[0]).toMatchObject({ chip: { kind: 'holiday', value: 'sommer', label: 'Sommerferien' } });
    // Bayerns Winterferien heißen offiziell „Frühjahrsferien“
    const win = suggest({ chips: [by], text: 'ferien:win' }, ctx)[0]!;
    expect(win).toMatchObject({ chip: { value: 'winter', long: 'Winterferien (BY: Frühjahrsferien)' } });
    // NW hat keine Winterferien → nicht vorgeschlagen
    const nw = { kind: 'state' as const, value: 'NW', label: 'NW' };
    expect(suggest({ chips: [nw], text: 'ferien:win' }, ctx)).toEqual([]);
  });

  it('„land:by ferien:sommer“ in einem Zug; letztes Land entfernen setzt Ferien zurück', () => {
    const r = resolveCommands({ chips: [], text: 'land:by ferien:sommer kiel' }, ctx);
    expect(r.chips.map((c) => `${c.kind}:${c.value}`)).toEqual(['state:BY', 'holiday:sommer']);
    expect(r.text).toBe('kiel');
    expect(removeChip(r, 0).chips).toEqual([]);
    const two = resolveCommands({ chips: [], text: 'land:by land:nw ferien:herbst' }, ctx);
    expect(removeChip(two, 0).chips.map((c) => c.value)).toEqual(['NW', 'herbst']);
    expect(removeLastChip({ chips: [by, { kind: 'holiday', value: 'sommer', label: 'Sommerferien' }], text: '' }).chips).toEqual([by]);
    expect(removeLastChip({ chips: [{ kind: 'holiday', value: 'sommer', label: 'S' }, by], text: '' }).chips).toEqual([]);
  });

  it('filtert nach gemeinsamen Ferien und liefert die Passung je Reise', () => {
    const index = buildIndex(catalog);
    const res = filterTrips(catalog, index, { chips: [by, { kind: 'holiday', value: 'weihnachten', label: 'Weihnachtsferien' }], text: '' }, new Map());
    expect(res.deps.length).toBeGreaterThan(0);
    for (const d of res.deps) {
      const fit = res.holiday.get(d.journeyId)!;
      expect(fit.fits[0]).toMatchObject({ state: 'BY', type: 'weihnachten' });
    }
    // ohne Bundesland: keine Ferieninformationen
    expect(filterTrips(catalog, index, EMPTY_QUERY, new Map()).holiday.size).toBe(0);
  });
});

describe('windowAround', () => {
  it('zeigt alles, wenn die Liste in den Platz passt', () => {
    expect(windowAround(0, 0, 5)).toEqual([0, 0]);
    expect(windowAround(4, 3, 5)).toEqual([0, 4]);
    expect(windowAround(5, 4, 5)).toEqual([0, 5]);
  });

  it('hält den Cursor in der Mitte und bleibt an den Rändern gefüllt', () => {
    expect(windowAround(20, 0, 5)).toEqual([0, 5]);
    expect(windowAround(20, 10, 5)).toEqual([8, 13]);
    expect(windowAround(20, 19, 5)).toEqual([15, 20]);
    expect(windowAround(20, 10, 4)).toEqual([8, 12]);
  });

  it('liefert immer einen vollen Ausschnitt, der den Cursor enthält', () => {
    for (let total = 0; total <= 30; total++) {
      for (let size = 1; size <= 12; size++) {
        for (let cursor = 0; cursor < Math.max(1, total); cursor++) {
          const [start, end] = windowAround(total, cursor, size);
          expect(end - start).toBe(Math.min(total, size));
          expect(start).toBeGreaterThanOrEqual(0);
          expect(end).toBeLessThanOrEqual(total);
          if (total > 0) expect(cursor >= start && cursor < end).toBe(true);
        }
      }
    }
  });
});
