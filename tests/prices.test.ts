import { describe, expect, it } from 'vitest';
import { buildPriceRequest, yesterday } from '../src/api/prices.js';
import { bookingLink } from '../src/domain/links.js';
import { matrix, pax } from './helpers.js';

const find = (m: ReturnType<typeof matrix>, tariff: string, cabin: string, dep?: string, arr?: string) =>
  m.offers.filter(
    (o) =>
      o.tariffCode === tariff &&
      o.cabinCode === cabin &&
      (dep === undefined || o.outbound?.from === dep) &&
      (arr === undefined || o.inbound?.to === arr),
  );

describe('buildPriceRequest', () => {
  it('builds the SearchHub request like the AIDA booking SPA', () => {
    const body = buildPriceRequest('PR07261128', pax(2, 0, 1, 0), new Date('2026-11-15T12:00:00'));
    expect(body.cruise.journeyIdentifier).toEqual(['PR07261128']);
    expect(body.cruise.tariffTypes).toContain('COMAI');
    expect(body.flight).toEqual({ allowOpenJaw: true, allowOneway: true });
    expect(body.period.start.date).toBe('2026-11-14');
    expect(body.passengers).toEqual([
      { id: 1, age: 40 },
      { id: 2, age: 40 },
      { id: 3, age: 10 },
    ]);
  });

  it('computes yesterday across month boundaries', () => {
    expect(yesterday(new Date('2027-03-01T10:00:00'))).toBe('2027-02-28');
  });
});

describe('normalizePrices – AIDAprima PR07261128, 2 Erwachsene', () => {
  const m = matrix('PR07261128', pax(2));

  it('keeps every priced product', () => {
    expect(m.offers).toHaveLength(319);
    expect(m.unavailable).toBe(0);
    expect(m.cruise?.shipName).toBe('AIDAprima');
    expect(m.cruise?.checkIn).toBe('14:00–19:00');
  });

  it('matches the prices shown in the AIDA booking wizard', () => {
    const ber = find(m, 'CLA', 'IV', 'BER', 'BER');
    expect(ber).toHaveLength(1);
    expect(ber[0]!.total).toBe(1998);
    expect(ber[0]!.flightSupplement).toBe(800);
    expect(ber[0]!.cruisePrice).toBe(1198);
    expect(ber[0]!.perPerson).toBe(999);
    expect(ber[0]!.transport).toBe('return');

    const ham = find(m, 'CLA', 'IV', 'HAM', 'HAM');
    expect(ham[0]!.total).toBe(2098);
  });

  it('extracts early bird discount, flights and campaigns', () => {
    const o = find(m, 'IND', 'IA', 'BER', 'BER')[0]!;
    expect(o.total).toBe(2250);
    expect(o.earlyBird).toBe(-300);
    expect(o.outbound?.segments[0]?.airlineName).toBe('Eurowings');
    expect(o.outbound?.segments[0]?.flightNumber).toBe('5402');
    expect(o.outbound?.depTime).toBe('10:35');
    expect(o.included).toContain('Rail&Fly 2. Kl.');
  });

  it('classifies transport variants', () => {
    const kinds = new Set(m.offers.map((o) => o.transport));
    expect(kinds).toEqual(new Set(['return', 'openjaw', 'outbound', 'inbound']));
    for (const o of m.offers) {
      if (o.transport === 'return') expect(o.outbound!.from).toBe(o.inbound!.to);
      if (o.transport === 'openjaw') expect(o.outbound!.from).not.toBe(o.inbound!.to);
      if (o.transport === 'outbound') expect(o.inbound).toBeUndefined();
    }
  });

  it('maps cabin subcategories to AIDA cabin groups', () => {
    const groups = Object.fromEntries(m.offers.map((o) => [o.cabinCode, o.cabinGroup]));
    expect(groups).toMatchObject({ IV: 'I', IA: 'I', MV: 'M', VV: 'V', VG: 'V', DL: 'D', DV: 'D' });
    expect(m.offers.find((o) => o.cabinCode === 'IV')!.flex).toBe(true);
    expect(m.offers.find((o) => o.cabinCode === 'IA')!.flex).toBe(false);
  });

  it('builds a prefilled booking deeplink', () => {
    const o = find(m, 'CLA', 'IV', 'BER', 'BER')[0]!;
    expect(bookingLink(o, pax(2))).toBe(
      'https://aida.de/buchen/PR07261128/CLASSIC/meine-reise/reisende?adults=2&juveniles=0&children=0&babies=0&cabin=I&flightType=air&depAirport=BER&arrAirport=BER',
    );
  });
});

describe('normalizePrices – other cases', () => {
  it('handles cruises without flights (own arrival)', () => {
    const m = matrix('BL07261122', pax(2));
    const own = m.offers.filter((o) => o.transport === 'none');
    expect(own.length).toBe(5);
    expect(own.every((o) => o.flightSupplement === 0 && !o.outbound && !o.inbound)).toBe(true);
  });

  it('reports unavailable occupancy instead of zero prices', () => {
    const m = matrix('PR07261128', pax(1));
    expect(m.offers).toHaveLength(0);
    expect(m.unavailable).toBe(1);
  });

  it('keeps individual passenger prices for families', () => {
    const m = matrix('PR07261128', pax(2, 0, 1));
    const o = m.offers[0]!;
    expect(o.passengerPrices).toHaveLength(3);
    expect(o.passengerPrices[2]).toBeLessThan(o.passengerPrices[0]!);
    expect(o.perPerson).toBeCloseTo(o.total / 3);
  });

  it('groups AIDAcosma comfort and balcony cabins', () => {
    const m = matrix('CO07261212', pax(2));
    const g = Object.fromEntries(m.offers.map((o) => [o.cabinCode, o.cabinGroup]));
    expect(g).toMatchObject({ BA: 'V', VA: 'K', KV: 'K', DL: 'D', MB: 'M' });
  });
});
