import data from '../data/school-holidays.json' with { type: 'json' };

export type HolidayType = 'winter' | 'ostern' | 'pfingsten' | 'sommer' | 'herbst' | 'weihnachten';

export const HOLIDAY_TYPES: { type: HolidayType; label: string; short: string }[] = [
  { type: 'winter', label: 'Winterferien', short: 'Winter' },
  { type: 'ostern', label: 'Osterferien', short: 'Ostern' },
  { type: 'pfingsten', label: 'Pfingstferien', short: 'Pfingsten' },
  { type: 'sommer', label: 'Sommerferien', short: 'Sommer' },
  { type: 'herbst', label: 'Herbstferien', short: 'Herbst' },
  { type: 'weihnachten', label: 'Weihnachtsferien', short: 'Weihnachten' },
];

export interface StateInfo {
  code: string;
  name: string;
  /** „in Bayern“, „im Saarland“ */
  in: string;
  aliases: string[];
}

export const STATES: StateInfo[] = [
  { code: 'BW', name: 'Baden-Württemberg', in: 'in Baden-Württemberg', aliases: ['bawü', 'bawue'] },
  { code: 'BY', name: 'Bayern', in: 'in Bayern', aliases: [] },
  { code: 'BE', name: 'Berlin', in: 'in Berlin', aliases: [] },
  { code: 'BB', name: 'Brandenburg', in: 'in Brandenburg', aliases: [] },
  { code: 'HB', name: 'Bremen', in: 'in Bremen', aliases: [] },
  { code: 'HH', name: 'Hamburg', in: 'in Hamburg', aliases: [] },
  { code: 'HE', name: 'Hessen', in: 'in Hessen', aliases: [] },
  { code: 'MV', name: 'Mecklenburg-Vorpommern', in: 'in Mecklenburg-Vorpommern', aliases: [] },
  { code: 'NI', name: 'Niedersachsen', in: 'in Niedersachsen', aliases: [] },
  { code: 'NW', name: 'Nordrhein-Westfalen', in: 'in Nordrhein-Westfalen', aliases: ['nrw'] },
  { code: 'RP', name: 'Rheinland-Pfalz', in: 'in Rheinland-Pfalz', aliases: ['rlp'] },
  { code: 'SL', name: 'Saarland', in: 'im Saarland', aliases: [] },
  { code: 'SN', name: 'Sachsen', in: 'in Sachsen', aliases: [] },
  { code: 'ST', name: 'Sachsen-Anhalt', in: 'in Sachsen-Anhalt', aliases: ['lsa'] },
  { code: 'SH', name: 'Schleswig-Holstein', in: 'in Schleswig-Holstein', aliases: [] },
  { code: 'TH', name: 'Thüringen', in: 'in Thüringen', aliases: [] },
];

export interface Period {
  state: string;
  type: HolidayType;
  name: string;
  start: string;
  end: string;
}

interface Snapshot {
  source: string;
  fetchedAt: string;
  range: string[];
  notes: Record<string, string>;
  periods: Period[];
  free: { state: string; name: string; start: string; end: string }[];
}

const SNAP = data as Snapshot;
export const HOLIDAY_SOURCE = { source: SNAP.source, fetchedAt: SNAP.fetchedAt, range: SNAP.range };

export function stateInfo(code: string): StateInfo {
  return STATES.find((s) => s.code === code) ?? { code, name: code, in: `in ${code}`, aliases: [] };
}

export function stateNote(code: string): string | undefined {
  return SNAP.notes[code];
}

export function holidayLabel(t: HolidayType): string {
  return HOLIDAY_TYPES.find((h) => h.type === t)?.label ?? t;
}

export function holidayShort(t: HolidayType): string {
  return HOLIDAY_TYPES.find((h) => h.type === t)?.short ?? t;
}

// ------------------------------------------------------------ Datumsrechnung (UTC, Tagesnummern)

export const dayNo = (iso: string): number => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
export const isoOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
const weekday = (n: number): number => new Date(n * 86_400_000).getUTCDay();

const periodsByState = new Map<string, Period[]>();
for (const p of SNAP.periods) {
  const list = periodsByState.get(p.state) ?? [];
  list.push(p);
  periodsByState.set(p.state, list);
}

/** Tagesnummern, an denen in einem Land keine Schule ist (Ferien, freie Tage, Feiertage). */
const freeDays = new Map<string, Set<number>>();
function freeSet(state: string): Set<number> {
  let set = freeDays.get(state);
  if (set) return set;
  set = new Set<number>();
  const add = (start: string, end: string) => {
    for (let d = dayNo(start); d <= dayNo(end); d++) set!.add(d);
  };
  for (const p of periodsByState.get(state) ?? []) add(p.start, p.end);
  for (const f of SNAP.free) if (f.state === state || f.state === 'DE') add(f.start, f.end);
  freeDays.set(state, set);
  return set;
}

export function periodsFor(state: string, types?: HolidayType[]): Period[] {
  const all = periodsByState.get(state) ?? [];
  return types?.length ? all.filter((p) => types.includes(p.type)) : all;
}

/** Ferienarten, die es in einem Land im Datenzeitraum gibt. */
export function typesIn(state: string): Set<HolidayType> {
  return new Set(periodsFor(state).map((p) => p.type));
}

/** Offizielle Bezeichnungen eines Landes für eine Ferienart, z. B. BY winter → Frühjahrsferien. */
export function officialNames(state: string, type: HolidayType): string[] {
  return [...new Set(periodsFor(state, [type]).map((p) => p.name))];
}

/** Schultage (Mo–Fr, nicht frei) zwischen start und end, beide inklusive. */
export function missedSchoolDays(state: string, start: string, end: string): string[] {
  const free = freeSet(state);
  const out: string[] = [];
  for (let d = dayNo(start); d <= dayNo(end); d++) {
    const wd = weekday(d);
    if (wd === 0 || wd === 6 || free.has(d)) continue;
    out.push(isoOf(d));
  }
  return out;
}

export interface HolidayFit {
  state: string;
  type: HolidayType;
  /** offizielle Bezeichnung im Land */
  name: string;
  start: string;
  end: string;
  missed: number;
  missedDates: string[];
}

export interface TripHolidays {
  /** eine Passung je gewähltem Land (in Reihenfolge der Länder) */
  fits: HolidayFit[];
  maxMissed: number;
}

const overlapDays = (s1: number, e1: number, s2: number, e2: number) => Math.max(0, Math.min(e1, e2) - Math.max(s1, s2) + 1);

/**
 * Gemeinsame Ferien: Die Reise muss sich in JEDEM Land mit Ferien der gewählten Arten überschneiden
 * (teilweise genügt). Gibt null zurück, wenn ein Land nicht passt.
 */
export function fitTrip(start: string, end: string, states: string[], types: HolidayType[] = []): TripHolidays | null {
  if (!states.length) return null;
  const s = dayNo(start);
  const e = dayNo(end);
  const fits: HolidayFit[] = [];
  for (const state of states) {
    let best: Period | null = null;
    let bestOv = 0;
    for (const p of periodsFor(state, types)) {
      const ov = overlapDays(s, e, dayNo(p.start), dayNo(p.end));
      if (ov > bestOv) {
        best = p;
        bestOv = ov;
      }
    }
    if (!best) return null;
    const missedDates = missedSchoolDays(state, start, end);
    fits.push({ state, type: best.type, name: best.name, start: best.start, end: best.end, missed: missedDates.length, missedDates });
  }
  return { fits, maxMissed: Math.max(...fits.map((f) => f.missed)) };
}

/** Gemeinsame Zeit einer Ferienart in einem Jahr (nach Beginn); null, wenn keine. */
export function commonWindow(states: string[], type: HolidayType, year: number): { start: string; end: string } | null {
  let lo = -Infinity;
  let hi = Infinity;
  for (const st of states) {
    const p = periodsFor(st, [type]).find((x) => Number(x.start.slice(0, 4)) === year);
    if (!p) return null;
    lo = Math.max(lo, dayNo(p.start));
    hi = Math.min(hi, dayNo(p.end));
  }
  return hi >= lo ? { start: isoOf(lo), end: isoOf(hi) } : null;
}

export interface ConflictYear {
  type: HolidayType;
  year: number;
  perState: { state: string; period: Period | null }[];
  common: { start: string; end: string } | null;
}

export interface HolidayConflicts {
  errors: string[];
  warnings: string[];
  years: ConflictYear[];
}

function joinStates(codes: string[], form: 'name' | 'in'): string {
  const parts = codes.map((c) => {
    const s = stateInfo(c);
    return form === 'in' ? `${s.in} (${c})` : `${s.name} (${c})`;
  });
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`;
}

const joinYears = (ys: number[]) => (ys.length <= 1 ? String(ys[0] ?? '') : `${ys.slice(0, -1).join(', ')} und ${ys[ys.length - 1]}`);

/**
 * Prüft gewählte Länder + Ferienarten für die Jahre, in denen es Reisen gibt:
 * Art fehlt im Land (Fehler) · Art fehlt in einzelnen Jahren (Hinweis) · keine gemeinsame Zeit
 * (in allen Jahren: Fehler, sonst Hinweis).
 */
export function holidayConflicts(states: string[], types: HolidayType[], years: number[]): HolidayConflicts {
  const out: HolidayConflicts = { errors: [], warnings: [], years: [] };
  if (!states.length || !types.length) return out;
  for (const type of types) {
    const label = holidayLabel(type);
    const missing = states.filter((st) => !typesIn(st).has(type));
    if (missing.length) {
      out.errors.push(`${label} gibt es ${joinStates(missing, 'in')} nicht.`);
      continue;
    }
    const noCommon: number[] = [];
    const checked: number[] = [];
    for (const year of years) {
      const perState = states.map((state) => ({
        state,
        period: periodsFor(state, [type]).find((p) => Number(p.start.slice(0, 4)) === year) ?? null,
      }));
      const absent = perState.filter((x) => !x.period).map((x) => x.state);
      const common = absent.length ? null : commonWindow(states, type, year);
      out.years.push({ type, year, perState, common });
      if (absent.length) {
        out.warnings.push(`${year} keine ${label} ${joinStates(absent, 'in')}.`);
        continue;
      }
      checked.push(year);
      if (states.length > 1 && !common) noCommon.push(year);
    }
    if (noCommon.length && noCommon.length === checked.length) {
      out.errors.push(`${joinStates(states, 'name')} haben nie gleichzeitig ${label}.`);
    } else if (noCommon.length) {
      out.warnings.push(`Keine gemeinsamen ${label} ${joinYears(noCommon)}.`);
    }
  }
  return out;
}
