import { describe, expect, it } from 'vitest';
import { normalizeCatalog, titleCase } from '../src/api/catalog.js';
import { CatalogResponse } from '../src/api/schemas.js';
import {
  DEFAULT_FILTERS,
  applyFilters,
  buildPivot,
  cellKey,
  sortOffers,
  transportKey,
} from '../src/domain/compare.js';
import { fixture, matrix, pax } from './helpers.js';

const m = matrix('PR07261128', pax(2));

describe('applyFilters', () => {
  it('default shows only round trips from the same airport (plus own arrival)', () => {
    const { offers } = applyFilters(m.offers, DEFAULT_FILTERS);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.transport === 'return' || o.transport === 'none')).toBe(true);
  });

  it('filters by departure airport', () => {
    const { offers, notices } = applyFilters(m.offers, { ...DEFAULT_FILTERS, depAirports: ['HAM'] });
    expect(notices).toEqual([]);
    expect(offers.every((o) => o.outbound?.from === 'HAM')).toBe(true);
  });

  it('falls back with a notice when a preferred airport is not offered', () => {
    const { offers, notices } = applyFilters(m.offers, { ...DEFAULT_FILTERS, depAirports: ['MUC'] });
    expect(notices[0]).toMatch(/MUC nicht verfügbar/);
    expect(offers.length).toBeGreaterThan(0);
  });

  it('own-arrival offers ignore airport filters', () => {
    const bl = matrix('BL07261122', pax(2));
    const { offers } = applyFilters(bl.offers, { ...DEFAULT_FILTERS, depAirports: ['HAM'] });
    expect(offers.some((o) => o.transport === 'none')).toBe(true);
  });
});

describe('buildPivot', () => {
  it('cabin group × tariff picks the cheapest offer per cell', () => {
    const { offers } = applyFilters(m.offers, { ...DEFAULT_FILTERS, depAirports: ['BER'] });
    const p = buildPivot(offers, 'cabinGroup', 'tariff');
    expect(p.rows.map((r) => r.key)).toEqual(['I', 'M', 'V', 'D']);
    expect(p.cols[0]!.key).toBe('LIG');
    expect(p.cols.map((c) => c.key)).toContain('COMAI');
    const cell = p.cells.get(cellKey('I', 'CLA'))!;
    expect(cell.total).toBe(1998);
    expect(p.min).toBe(Math.min(...offers.map((o) => o.total)));
  });

  it('transport × tariff for a pinned cabin lists each airport once', () => {
    const inside = m.offers.filter((o) => o.cabinGroup === 'I' && o.transport === 'return');
    const p = buildPivot(inside, 'transport', 'tariff');
    const keys = p.rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(p.rows.map((r) => r.label)).toContain('BER ⇄ BER');
    expect(p.cells.get(cellKey('return:HAM:HAM', 'CLA'))!.total).toBe(2098);
  });
});

describe('sortOffers', () => {
  it('sorts by price ascending and descending', () => {
    const asc = sortOffers(m.offers, 'price', false);
    expect(asc[0]!.total).toBe(Math.min(...m.offers.map((o) => o.total)));
    const desc = sortOffers(m.offers, 'price', true);
    expect(desc[0]!.total).toBe(Math.max(...m.offers.map((o) => o.total)));
  });

  it('transport key is stable per airport pair', () => {
    const o = m.offers.find((x) => x.transport === 'openjaw')!;
    expect(transportKey(o)).toBe(`openjaw:${o.outbound!.from}:${o.inbound!.to}`);
  });
});

describe('normalizeCatalog', () => {
  const cat = normalizeCatalog([CatalogResponse.parse(fixture('catalog-demo.json'))]);

  it('flattens routes and departures', () => {
    expect(cat.routes.length).toBe(14);
    expect(cat.departures.some((d) => d.journeyId === 'PR07261128')).toBe(true);
    const dates = cat.departures.map((d) => d.startDate);
    expect(dates).toEqual([...dates].sort());
  });

  it('prettifies port names', () => {
    expect(titleCase('LAS PALMAS/GRAN CANARIA')).toBe('Las Palmas/Gran Canaria');
    const r = cat.routes.find((x) => x.title === 'Kanaren & Marokko ab Gran Canaria')!;
    expect(r.ports[0]!.name).toBe('Las Palmas/Gran Canaria');
  });
});
