import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_FILTERS, type SortField } from '../domain/compare.js';
import { DEFAULT_PAX, validatePax } from '../domain/pax.js';
import { EMPTY_QUERY, type TripQuery } from '../domain/tripQuery.js';
import type { Filters, Pax, PriceMode, ViewId } from '../domain/types.js';

export type TripSortField = 'date' | 'route' | 'ship' | 'duration' | 'price' | 'holiday';

export interface PersistedState {
  version: 1;
  journeyId?: string;
  pax: Pax;
  paxHistory: Pax[];
  filters: Filters;
  view: ViewId;
  expand: boolean;
  priceMode: PriceMode;
  showDelta: boolean;
  sortField: SortField;
  sortDesc: boolean;
  focus: { cabin?: string; tariff?: string; transport?: string };
  /** zuletzt angesehene Reisen (JourneyIdentifier, neueste zuerst) */
  recent: string[];
  /** letzte Suche in der Reiseübersicht */
  tripQuery: TripQuery;
  tripSort: { field: TripSortField; desc: boolean };
  /** Index des zuletzt gezeigten Startseiten-Spruchs (keine Wiederholung beim nächsten Start) */
  lastSaying?: number;
}

export const DEFAULT_STATE: PersistedState = {
  version: 1,
  pax: DEFAULT_PAX,
  paxHistory: [DEFAULT_PAX],
  filters: DEFAULT_FILTERS,
  view: 1,
  expand: false,
  priceMode: 'total',
  showDelta: false,
  sortField: 'price',
  sortDesc: false,
  focus: {},
  recent: [],
  tripQuery: EMPTY_QUERY,
  tripSort: { field: 'date', desc: false },
};

export const APP_DIR = 'findmyaida';
const LEGACY_DIR = 'aida-tui';

function configBase(): string {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

export function defaultConfigDir(): string {
  return path.join(configBase(), APP_DIR);
}

/** Früherer Speicherort (vor der Umbenennung in FindMyAIDA). */
export function legacyConfigDir(): string {
  return path.join(configBase(), LEGACY_DIR);
}

export function loadState(file: string, legacyFile?: string): PersistedState {
  let source = file;
  if (!fs.existsSync(file) && legacyFile && fs.existsSync(legacyFile)) source = legacyFile;
  try {
    const raw = JSON.parse(fs.readFileSync(source, 'utf8')) as Partial<PersistedState>;
    if (raw.version !== 1) return DEFAULT_STATE;
    const s: PersistedState = {
      ...DEFAULT_STATE,
      ...raw,
      filters: { ...DEFAULT_FILTERS, ...(raw.filters ?? {}) },
      focus: raw.focus ?? {},
      tripQuery: {
        chips: Array.isArray(raw.tripQuery?.chips) ? raw.tripQuery!.chips : [],
        text: typeof raw.tripQuery?.text === 'string' ? raw.tripQuery.text : '',
      },
      tripSort: raw.tripSort ?? DEFAULT_STATE.tripSort,
      recent: Array.isArray(raw.recent) ? raw.recent.filter((x) => typeof x === 'string').slice(0, 12) : [],
    };
    if (validatePax(s.pax)) s.pax = DEFAULT_PAX;
    s.paxHistory = (s.paxHistory ?? []).filter((p) => !validatePax(p)).slice(0, 6);
    if (![1, 2, 3, 4].includes(s.view)) s.view = 1;
    if (!s.recent.length && s.journeyId) s.recent = [s.journeyId];
    return s;
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(file: string, s: PersistedState): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(s, null, 2));
  } catch {
    /* nicht kritisch */
  }
}

export function pushRecent(recent: string[], journeyId: string): string[] {
  return [journeyId, ...recent.filter((x) => x !== journeyId)].slice(0, 12);
}
