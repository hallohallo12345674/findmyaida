import { describe, expect, it } from 'vitest';
import {
  STATES,
  commonWindow,
  fitTrip,
  holidayConflicts,
  missedSchoolDays,
  periodsFor,
  stateNote,
  typesIn,
} from '../src/domain/holidays.js';

const YEARS = [2026, 2027, 2028, 2029];

describe('Ferien-Schnappschuss', () => {
  it('hat Sommerferien 2026–2028 für alle 16 Länder', () => {
    expect(STATES).toHaveLength(16);
    for (const s of STATES) {
      for (const y of [2026, 2027, 2028]) {
        expect(periodsFor(s.code, ['sommer']).some((p) => p.start.startsWith(String(y))), `${s.code} ${y}`).toBe(true);
      }
    }
  });

  it('ordnet gleichnamige Ferien nach Datum zu', () => {
    const by = periodsFor('BY', ['winter']).find((p) => p.start.startsWith('2027'))!;
    expect(by.name).toBe('Frühjahrsferien');
    expect(by.start).toBe('2027-02-08');
    const hh = periodsFor('HH', ['ostern']).find((p) => p.start.startsWith('2027'))!;
    expect(hh.name).toBe('Frühjahrsferien');
    expect(hh.start).toBe('2027-03-01');
  });

  it('eintägige „Pfingstferien“ sind keine Ferienart', () => {
    expect(typesIn('NW').has('pfingsten')).toBe(false);
    expect(typesIn('BY').has('pfingsten')).toBe(true);
  });

  it('MV nur allgemeinbildende Schulen, SH ohne Insel-Ausnahmen', () => {
    for (const st of ['MV', 'SH']) {
      for (const p of periodsFor(st)) {
        const sameYear = periodsFor(st, [p.type]).filter((q) => q.start.slice(0, 4) === p.start.slice(0, 4));
        expect(sameYear, `${st} ${p.type} ${p.start}`).toHaveLength(1);
      }
    }
    expect(periodsFor('MV', ['sommer']).find((p) => p.start.startsWith('2026'))).toMatchObject({ start: '2026-07-13', end: '2026-08-22' });
    expect(stateNote('SH')).toMatch(/Sylt/);
  });
});

describe('fitTrip und Schultage', () => {
  it('Reise komplett in den Sommerferien BY → 0 Schultage', () => {
    const f = fitTrip('2026-08-08', '2026-08-15', ['BY'], ['sommer'])!;
    expect(f.maxMissed).toBe(0);
    expect(f.fits[0]).toMatchObject({ state: 'BY', name: 'Sommerferien', start: '2026-08-03', end: '2026-09-14' });
  });

  it('Start zwei Schultage vor Ferienbeginn → genau diese zwei Tage', () => {
    const f = fitTrip('2026-07-30', '2026-08-06', ['BY'], ['sommer'])!;
    expect(f.fits[0]!.missedDates).toEqual(['2026-07-30', '2026-07-31']);
  });

  it('Feiertage und schulfreie Tage zählen nicht als Schultag', () => {
    // 18.11.2026 Buß- und Bettag ist in Bayern schulfrei
    expect(missedSchoolDays('BY', '2026-11-16', '2026-11-20')).toEqual(['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-20']);
  });

  it('gemeinsame Ferien: jedes Land muss sich überschneiden', () => {
    expect(commonWindow(['BY', 'HE'], 'sommer', 2026)).toEqual({ start: '2026-08-03', end: '2026-08-07' });
    const both = fitTrip('2026-08-01', '2026-08-08', ['BY', 'HE'], ['sommer'])!;
    expect(both.fits.map((x) => x.state)).toEqual(['BY', 'HE']);
    expect(both.maxMissed).toBe(0);
    // Mitte September: nur noch Bayern hat Ferien → passt nicht für BY + HE
    expect(fitTrip('2026-09-01', '2026-09-08', ['BY', 'HE'], ['sommer'])).toBeNull();
    // gleiche Reise teilweise in BY-Ferien, in HE Schultage
    const partial = fitTrip('2026-08-05', '2026-08-12', ['BY', 'HE'], ['sommer'])!;
    expect(partial.fits.find((x) => x.state === 'HE')!.missed).toBe(3);
    expect(partial.maxMissed).toBe(3);
  });
});

describe('holidayConflicts', () => {
  it('Ferienart fehlt im Land → Fehler', () => {
    const c = holidayConflicts(['NW'], ['winter'], YEARS);
    expect(c.errors).toEqual(['Winterferien gibt es in Nordrhein-Westfalen (NW) nicht.']);
  });

  it('Ferienart fehlt in einzelnen Jahren → Hinweis', () => {
    const c = holidayConflicts(['SL'], ['pfingsten'], YEARS);
    expect(c.errors).toEqual([]);
    expect(c.warnings[0]).toBe('2026 keine Pfingstferien im Saarland (SL).');
  });

  it('keine gemeinsame Zeit in manchen Jahren → Hinweis, in allen → Fehler', () => {
    expect(holidayConflicts(['BY', 'MV'], ['sommer'], YEARS).warnings).toEqual(['Keine gemeinsamen Sommerferien 2029.']);
    expect(holidayConflicts(['BY', 'NW'], ['herbst'], YEARS).warnings).toEqual(['Keine gemeinsamen Herbstferien 2026 und 2029.']);
    const never = holidayConflicts(['BB', 'BY'], ['herbst'], YEARS);
    expect(never.errors).toEqual(['Brandenburg (BB) und Bayern (BY) haben nie gleichzeitig Herbstferien.']);
    const y2026 = never.years.find((y) => y.year === 2026)!;
    expect(y2026.common).toBeNull();
    expect(y2026.perState.every((p) => p.period)).toBe(true);
  });

  it('Weihnachten ist für alle 16 Länder gemeinsam', () => {
    const c = holidayConflicts(STATES.map((s) => s.code), ['weihnachten'], YEARS);
    expect(c.errors).toEqual([]);
    expect(c.warnings).toEqual([]);
  });
});

describe('Rechtsgrundlagen und Sprüche', () => {
  it('alle 16 Länder haben Gesetz, Schulpflicht-Norm, Teilnahme, OWi und amtliche Quelle', async () => {
    const { SCHOOL_LAWS } = await import('../src/domain/schoolLaw.js');
    const { STATES } = await import('../src/domain/holidays.js');
    for (const st of STATES) {
      const l = SCHOOL_LAWS.find((x) => x.state === st.code);
      expect(l, st.code).toBeTruthy();
      expect(l!.law.length).toBeGreaterThan(5);
      expect(l!.abbr).toBeTruthy();
      expect(l!.duty.norm).toMatch(/^(§|Art\.)/);
      expect(l!.duty.title).toBeTruthy();
      expect(l!.attendance).toMatch(/(§|Art\.)/);
      expect(l!.offence.norm).toMatch(/^(§|Art\.)/);
      expect(l!.sources.length).toBeGreaterThan(0);
      for (const u of l!.sources) expect(u).toMatch(/^https:\/\//);
    }
  });

  it('der Amtliche Hinweis nennt keine Zahl von Schultagen', async () => {
    const { officialNotice } = await import('../src/domain/schoolLaw.js');
    const n = officialNotice(['NW', 'BE'], 'herbst', '2026');
    const text = [...n.lines, n.footer].join(' ');
    expect(text).toContain('§ 34 SchulG NRW');
    expect(text).toContain('§ 41 SchulG');
    expect(text).not.toMatch(/Schultag/);
  });

  it('Sprüche wiederholen sich nicht direkt', async () => {
    const { pickSaying, SAYINGS } = await import('../src/ui/sayings.js');
    for (let last = 0; last < SAYINGS.length; last++) {
      for (const r of [0, 0.5, 0.999]) {
        const i = pickSaying(last, () => r);
        expect(i).not.toBe(last);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(SAYINGS.length);
      }
    }
    expect(pickSaying(undefined, () => 0.999)).toBe(SAYINGS.length - 1);
  });
});
