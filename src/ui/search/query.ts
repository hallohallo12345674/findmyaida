import {
  HOLIDAY_TYPES,
  STATES,
  fitTrip,
  officialNames,
  typesIn,
  type HolidayType,
  type StateInfo,
  type TripHolidays,
} from '../../domain/holidays.js';
import { EMPTY_QUERY, type FilterKind, type QueryChip, type TripQuery } from '../../domain/tripQuery.js';
import type { Catalog, Departure } from '../../domain/types.js';
import { MONTHS } from '../format.js';
import { fold, search, type SearchEntry } from '../search.js';

export { EMPTY_QUERY, type FilterKind, type QueryChip, type TripQuery };

export const KIND_LABEL: Record<FilterKind, string> = {
  region: 'Region',
  month: 'Monat',
  duration: 'Dauer',
  ship: 'Schiff',
  state: 'Land',
  holiday: 'Ferien',
};

export const COMMANDS: { key: string; kind: FilterKind; hint: string }[] = [
  { key: 'region:', kind: 'region', hint: 'z. B. region:kanaren' },
  { key: 'monat:', kind: 'month', hint: 'z. B. monat:dez' },
  { key: 'dauer:', kind: 'duration', hint: 'z. B. dauer:8-14' },
  { key: 'schiff:', kind: 'ship', hint: 'z. B. schiff:cosma' },
  { key: 'land:', kind: 'state', hint: 'z. B. land:bayern oder land:BY' },
  { key: 'ferien:', kind: 'holiday', hint: 'z. B. ferien:sommer' },
];

/** Befehle, die gerade sinnvoll sind: ferien: erst, wenn ein Bundesland gewählt ist. */
export function visibleCommands(q: TripQuery): typeof COMMANDS {
  return COMMANDS.filter((c) => c.kind !== 'holiday' || hasState(q));
}

const KEY_ALIASES: Record<string, FilterKind> = {
  region: 'region',
  r: 'region',
  monat: 'month',
  m: 'month',
  dauer: 'duration',
  d: 'duration',
  schiff: 'ship',
  s: 'ship',
  land: 'state',
  bl: 'state',
  bundesland: 'state',
  ferien: 'holiday',
  f: 'holiday',
};

export type SlashCommand = 'alle' | 'einstellungen' | 'hilfe' | 'beenden';
export const SLASH: { command: SlashCommand; label: string }[] = [
  { command: 'alle', label: 'Alle Reisen anzeigen' },
  { command: 'einstellungen', label: 'Darstellung, Standardwerte, Favoriten …' },
  { command: 'hilfe', label: 'Tastenkürzel und Bedienung' },
  { command: 'beenden', label: 'Programm beenden' },
];

export type Suggestion =
  | { type: 'chip'; chip: QueryChip }
  | { type: 'command'; insert: string; label: string }
  | { type: 'slash'; command: SlashCommand; label: string };

export interface QueryContext {
  regions: { code: string; name: string }[];
  ships: { code: string; name: string }[];
  months: string[];
  durations: number[];
}

export const DURATION_PRESETS: { value: string; label: string }[] = [
  { value: '1-7', label: 'bis 7 Tage' },
  { value: '8-14', label: '8–14 Tage' },
  { value: '15-999', label: 'ab 15 Tagen' },
];

export function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7)) - 1;
  const name = MONTHS[m] ?? ym;
  return `${name[0]!.toUpperCase()}${name.slice(1)} ${ym.slice(0, 4)}`;
}

export function buildContext(catalog: Catalog | null, regions: { code: string; name: string }[]): QueryContext {
  const ships = new Map<string, string>();
  const months = new Set<string>();
  const durations = new Set<number>();
  for (const d of catalog?.departures ?? []) {
    ships.set(d.shipCode, d.shipName);
    months.add(d.startDate.slice(0, 7));
    durations.add(d.duration);
  }
  return {
    regions: regions.slice().sort((a, b) => a.name.localeCompare(b.name)),
    ships: [...ships.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)),
    months: [...months].sort(),
    durations: [...durations].sort((a, b) => a - b),
  };
}

export function isEmptyQuery(q: TripQuery): boolean {
  return !q.chips.length && !q.text.trim();
}

function splitLast(text: string): { before: string; word: string } {
  const i = text.lastIndexOf(' ');
  return { before: text.slice(0, i + 1), word: text.slice(i + 1) };
}

function wordStart(hay: string, needle: string): boolean {
  if (!needle) return true;
  const i = hay.indexOf(needle);
  return i === 0 || (i > 0 && /[\s/&(.-]/.test(hay[i - 1]!));
}

export function parseDuration(v: string): string | null {
  const s = v.replace(/\s|tage?n?/gi, '');
  let m = /^(\d+)\+$/.exec(s);
  if (m) return `${m[1]}-999`;
  m = /^<(\d+)$/.exec(s);
  if (m) return `1-${Number(m[1]) - 1}`;
  m = /^(\d+)[-–](\d+)$/.exec(s);
  if (m) return `${m[1]}-${m[2]}`;
  m = /^(\d+)$/.exec(s);
  if (m) return `${m[1]}-${m[1]}`;
  return null;
}

export function durationLabel(value: string): string {
  const preset = DURATION_PRESETS.find((p) => p.value === value);
  if (preset) return preset.label;
  const [a, b] = value.split('-').map(Number);
  if (a === b) return `${a} Tage`;
  if (b! >= 999) return `ab ${a} Tagen`;
  return `${a}–${b} Tage`;
}

const squash = (s: string) => fold(s).replace(/[\s-]/g, '');

function stateChip(s: StateInfo): QueryChip {
  return { kind: 'state', value: s.code, label: s.code, long: s.name };
}

/** Bundesländer nach Name, Kürzel oder Alias (z. B. „bayern“, „BY“, „nrw“). */
function stateChips(raw: string): QueryChip[] {
  const v = squash(raw);
  if (!v) return STATES.map(stateChip);
  const exact = (s: StateInfo) => s.code.toLowerCase() === v || s.aliases.includes(v);
  return STATES.filter((s) => exact(s) || squash(s.name).includes(v) || s.code.toLowerCase().startsWith(v))
    .sort((a, b) => Number(exact(b)) - Number(exact(a)) || Number(squash(b.name).startsWith(v)) - Number(squash(a.name).startsWith(v)))
    .map(stateChip);
}

/**
 * Ferienarten für die gewählten Länder. onlyAvailable: nur Arten, die es in allen Ländern gibt
 * (für Vorschläge). Abweichende offizielle Namen stehen im Vorschlag dabei.
 */
function holidayChips(raw: string, q: TripQuery | undefined, onlyAvailable: boolean): QueryChip[] {
  const states = q ? stateCodes(q) : [];
  if (!states.length) return [];
  const v = fold(raw);
  return HOLIDAY_TYPES.filter((t) => !onlyAvailable || states.every((s) => typesIn(s).has(t.type)))
    .filter((t) => {
      if (!v) return true;
      const names = states.flatMap((s) => officialNames(s, t.type));
      return [t.label, t.short, ...names].some((n) => fold(n).startsWith(v));
    })
    .map((t) => {
      const special = states
        .map((s) => ({ s, names: officialNames(s, t.type).filter((n) => n !== t.label) }))
        .filter((x) => x.names.length)
        .map((x) => `${x.s}: ${x.names.join('/')}`);
      return { kind: 'holiday' as const, value: t.type, label: t.label, ...(special.length ? { long: `${t.label} (${special.join(', ')})` } : {}) };
    });
}

function chipsFor(kind: FilterKind, raw: string, ctx: QueryContext, q?: TripQuery, onlyAvailable = true): QueryChip[] {
  const v = fold(raw);
  switch (kind) {
    case 'state':
      return stateChips(raw);
    case 'holiday':
      return holidayChips(raw, q, onlyAvailable);
    case 'region':
      return ctx.regions
        .filter((r) => fold(r.name).includes(v))
        .sort((a, b) => Number(wordStart(fold(b.name), v)) - Number(wordStart(fold(a.name), v)))
        .map((r) => ({ kind, value: r.code, label: r.name }));
    case 'ship':
      return ctx.ships
        .filter((s) => fold(s.name).includes(v) || fold(s.name.replace(/^AIDA/i, '')).startsWith(v))
        .map((s) => ({ kind, value: s.code, label: s.name }));
    case 'month':
      return ctx.months
        .filter((ym) => fold(monthLabel(ym)).split(' ').some((p) => p.startsWith(v)) || ym.startsWith(raw) || !v)
        .map((ym) => ({ kind, value: ym, label: monthLabel(ym) }));
    case 'duration': {
      const parsed = parseDuration(raw);
      if (parsed) return [{ kind, value: parsed, label: durationLabel(parsed) }];
      return DURATION_PRESETS.filter((p) => fold(p.label).includes(v)).map((p) => ({ kind, value: p.value, label: p.label }));
    }
  }
}

const sameChip = (a: QueryChip, b: QueryChip) => a.kind === b.kind && a.value === b.value;

/** Vorschläge für das gerade getippte (letzte) Wort. */
export function suggest(q: TripQuery, ctx: QueryContext, limit = 6): Suggestion[] {
  const { word } = splitLast(q.text);
  const out: Suggestion[] = [];
  const has = (c: QueryChip) => q.chips.some((x) => sameChip(x, c));

  if (word.startsWith('/')) {
    const w = fold(word.slice(1));
    return SLASH.filter((s) => s.command.startsWith(w)).map((s) => ({ type: 'slash', command: s.command, label: s.label }));
  }

  const cmd = /^([a-zäöü]+):(.*)$/i.exec(word);
  if (cmd) {
    const kind = KEY_ALIASES[fold(cmd[1]!)];
    if (!kind) return [];
    return chipsFor(kind, cmd[2]!, ctx, q)
      .filter((c) => !has(c))
      .slice(0, limit)
      .map((chip) => ({ type: 'chip', chip }));
  }

  const w = fold(word);
  if (w.length < 2) return [];
  for (const c of visibleCommands(q)) {
    if (c.key.startsWith(w) && c.key !== w) out.push({ type: 'command', insert: c.key, label: `${c.key}  ${c.hint}` });
  }
  // Bundesland: Kürzel/Alias nur exakt (z. B. „by“, „nrw“), Namen ab 3 Buchstaben am Wortanfang
  const states = STATES.filter(
    (st) => st.code.toLowerCase() === w || st.aliases.includes(w) || (w.length >= 3 && wordStart(fold(st.name), w)),
  ).map(stateChip);
  const holidays = holidayChips(w, q, true).filter(() => w.length >= 3);
  const regions = ctx.regions.filter((r) => wordStart(fold(r.name), w)).map((r) => ({ kind: 'region' as const, value: r.code, label: r.name }));
  const ships = ctx.ships
    .filter((s) => fold(s.name.replace(/^AIDA/i, '')).startsWith(w) || fold(s.name).startsWith(w))
    .map((s) => ({ kind: 'ship' as const, value: s.code, label: s.name }));
  const months = ctx.months
    .filter((ym) => fold(monthLabel(ym)).startsWith(w))
    .slice(0, 2)
    .map((ym) => ({ kind: 'month' as const, value: ym, label: monthLabel(ym) }));
  for (const chip of [...states, ...regions, ...holidays, ...ships, ...months]) if (!has(chip)) out.push({ type: 'chip', chip });
  return out.slice(0, limit);
}

/** Übernimmt einen Vorschlag: ersetzt das letzte Wort durch einen Chip bzw. den Befehl. */
export function acceptSuggestion(q: TripQuery, s: Suggestion): TripQuery {
  const { before } = splitLast(q.text);
  if (s.type === 'command') return { ...q, text: before + s.insert };
  if (s.type === 'chip') {
    const chips = q.chips.some((c) => sameChip(c, s.chip)) ? q.chips : [...q.chips, s.chip];
    return { chips, text: before.trimEnd() ? `${before.trimEnd()} ` : '' };
  }
  return { ...q, text: before.trimEnd() };
}

/** Wandelt vollständige Befehle (z. B. „schiff:cosma“) im Text in Chips um (bester Treffer). */
export function resolveCommands(q: TripQuery, ctx: QueryContext): TripQuery {
  const chips = [...q.chips];
  const words = q.text.split(/\s+/).filter(Boolean);
  const kindOf = (word: string) => {
    const m = /^([a-zäöü]+):(.+)$/i.exec(word);
    return m ? { kind: KEY_ALIASES[fold(m[1]!)], value: m[2]! } : null;
  };
  const used = new Set<number>();
  // Bundesländer zuerst, damit „land:by ferien:sommer“ in einem Zug funktioniert.
  for (const pass of ['state', 'other'] as const) {
    words.forEach((word, i) => {
      const k = kindOf(word);
      if (!k?.kind || (pass === 'state') !== (k.kind === 'state')) return;
      const chip = chipsFor(k.kind, k.value, ctx, { chips, text: '' }, false)[0];
      if (!chip) return;
      used.add(i);
      if (!chips.some((c) => sameChip(c, chip))) chips.push(chip);
    });
  }
  const rest = words.filter((w, i) => !used.has(i) && !/^\/\w*$/.test(w));
  return { chips, text: rest.join(' ') };
}

/** Ohne Bundesland gibt es keine Ferienfilter: sie werden mit dem letzten Land entfernt. */
function dropOrphanHolidays(chips: QueryChip[]): QueryChip[] {
  return chips.some((c) => c.kind === 'state') ? chips : chips.filter((c) => c.kind !== 'holiday');
}

export function removeLastChip(q: TripQuery): TripQuery {
  return { ...q, chips: dropOrphanHolidays(q.chips.slice(0, -1)) };
}

export function removeChip(q: TripQuery, i: number): TripQuery {
  return { ...q, chips: dropOrphanHolidays(q.chips.filter((_, k) => k !== i)) };
}

export function stateCodes(q: TripQuery): string[] {
  return q.chips.filter((c) => c.kind === 'state').map((c) => c.value);
}

export function holidayTypes(q: TripQuery): HolidayType[] {
  return q.chips.filter((c) => c.kind === 'holiday').map((c) => c.value as HolidayType);
}

export function hasState(q: TripQuery): boolean {
  return q.chips.some((c) => c.kind === 'state');
}

/** Getipptes „ferien:…“ ohne Bundesland (wird nicht übernommen, dafür gibt es einen Hinweis). */
export function hasOrphanHolidayCommand(q: TripQuery): boolean {
  return !hasState(q) && q.text.split(/\s+/).some((w) => /^(ferien|f):/i.test(w));
}

export function regionCodes(q: TripQuery): string[] {
  return q.chips.filter((c) => c.kind === 'region').map((c) => c.value);
}

/**
 * Wendet Text und Chips an. Gleiche Kategorie = ODER, verschiedene Kategorien = UND.
 * Regionen, deren Termine noch nicht geladen sind, werden als „pending“ gemeldet.
 */
export function filterTrips(
  catalog: Catalog,
  index: SearchEntry[],
  q: TripQuery,
  regionIds: Map<string, Set<string>>,
): { deps: Departure[]; pendingRegions: string[]; holiday: Map<string, TripHolidays> } {
  const text = q.text.split(/\s+/).filter((w) => w && !/^[a-zäöü]+:/i.test(w) && !w.startsWith('/')).join(' ');
  let deps = text ? search(index, text) : catalog.departures;
  const by = (k: FilterKind) => q.chips.filter((c) => c.kind === k);
  const regions = by('region');
  const pendingRegions = regions.filter((r) => !regionIds.has(r.value)).map((r) => r.value);
  if (regions.length) {
    deps = deps.filter((d) => regions.some((r) => regionIds.get(r.value)?.has(d.journeyId)));
  }
  const months = by('month');
  if (months.length) deps = deps.filter((d) => months.some((m) => d.startDate.startsWith(m.value)));
  const durs = by('duration');
  if (durs.length)
    deps = deps.filter((d) =>
      durs.some((c) => {
        const [a, b] = c.value.split('-').map(Number);
        return d.duration >= a! && d.duration <= b!;
      }),
    );
  const ships = by('ship');
  if (ships.length) deps = deps.filter((d) => ships.some((s) => s.value === d.shipCode));
  // Schulferien: gemeinsame Ferien aller gewählten Länder (nur mit Bundesland aktiv)
  const holiday = new Map<string, TripHolidays>();
  const states = by('state').map((c) => c.value);
  if (states.length) {
    const types = by('holiday').map((c) => c.value as HolidayType);
    deps = deps.filter((d) => {
      const fit = fitTrip(d.startDate, d.endDate, states, types);
      if (fit) holiday.set(d.journeyId, fit);
      return !!fit;
    });
  }
  return { deps, pendingRegions, holiday };
}
