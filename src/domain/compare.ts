import { cabinGroupLabel, cabinGroupOrder } from './cabins.js';
import { tariffInfo, tariffOrder } from './tariffs.js';
import type { Filters, Offer, TransportKind } from './types.js';

export const TRANSPORT_KINDS: { kind: TransportKind; label: string }[] = [
  { kind: 'return', label: 'Hin- & Rückflug (gleicher Flughafen)' },
  { kind: 'openjaw', label: 'Gabelflug (verschiedene Flughäfen)' },
  { kind: 'outbound', label: 'nur Hinflug' },
  { kind: 'inbound', label: 'nur Rückflug' },
  { kind: 'none', label: 'Eigene An- und Abreise' },
];

export const DEFAULT_FILTERS: Filters = {
  tariffs: [],
  cabinGroups: [],
  transports: ['return', 'none'],
  depAirports: [],
  arrAirports: [],
};

const KIND_ORDER: Record<TransportKind, number> = { return: 0, openjaw: 1, outbound: 2, inbound: 3, none: 4 };

export function transportKey(o: Offer): string {
  return `${o.transport}:${o.outbound?.from ?? ''}:${o.inbound?.to ?? ''}`;
}

export function transportLabel(o: Pick<Offer, 'transport' | 'outbound' | 'inbound'>): string {
  switch (o.transport) {
    case 'return':
      return `${o.outbound!.from} ⇄ ${o.inbound!.to}`;
    case 'openjaw':
      return `${o.outbound!.from} → … → ${o.inbound!.to}`;
    case 'outbound':
      return `nur Hin ab ${o.outbound!.from}`;
    case 'inbound':
      return `nur Rück nach ${o.inbound!.to}`;
    default:
      return 'Eigene Anreise';
  }
}

export interface FilterResult {
  offers: Offer[];
  notices: string[];
}

/**
 * Wendet die (gespeicherten) Filter an. Flughafenfilter greifen nur bei Angeboten mit dem
 * jeweiligen Flug. Ist kein bevorzugter Flughafen verfügbar, wird der Filter ignoriert und ein
 * Hinweis erzeugt, damit nie eine leere Ansicht ohne Erklärung entsteht.
 */
export function applyFilters(all: Offer[], f: Filters): FilterResult {
  const notices: string[] = [];
  let offers = all;
  if (f.tariffs.length) offers = offers.filter((o) => f.tariffs.includes(o.tariffCode));
  if (f.cabinGroups.length) offers = offers.filter((o) => f.cabinGroups.includes(o.cabinGroup));
  if (f.transports.length) {
    const t = offers.filter((o) => f.transports.includes(o.transport));
    if (!t.length && offers.length) {
      notices.push('Gewählte Anreiseart nicht verfügbar – zeige alle Anreisearten');
    } else offers = t;
  }
  if (f.depAirports.length) {
    const hasAny = offers.some((o) => o.outbound && f.depAirports.includes(o.outbound.from));
    if (hasAny) offers = offers.filter((o) => !o.outbound || f.depAirports.includes(o.outbound.from));
    else if (offers.some((o) => o.outbound))
      notices.push(`${f.depAirports.join(', ')} nicht verfügbar – zeige alle Abflughäfen`);
  }
  if (f.arrAirports.length) {
    const hasAny = offers.some((o) => o.inbound && f.arrAirports.includes(o.inbound.to));
    if (hasAny) offers = offers.filter((o) => !o.inbound || f.arrAirports.includes(o.inbound.to));
    else if (offers.some((o) => o.inbound))
      notices.push(`${f.arrAirports.join(', ')} nicht verfügbar – zeige alle Rückflughäfen`);
  }
  return { offers, notices };
}

export function isDefaultFilters(f: Filters, defaults: Filters = DEFAULT_FILTERS): boolean {
  return JSON.stringify(f) === JSON.stringify(defaults);
}

// ---------------------------------------------------------------- Pivot

export type Dim = 'cabinGroup' | 'cabin' | 'tariff' | 'transport';

export interface AxisEntry {
  key: string;
  label: string;
  sub?: string;
}

export function dimKey(o: Offer, d: Dim): string {
  switch (d) {
    case 'cabinGroup':
      return o.cabinGroup;
    case 'cabin':
      return o.cabinCode;
    case 'tariff':
      return o.tariffCode;
    case 'transport':
      return transportKey(o);
  }
}

/** Passt ein Angebot zu einem Fokus-Wert? 'cabin'-Schlüssel dürfen Gruppe oder Unterkategorie sein. */
export function matchesCabin(o: Offer, key: string): boolean {
  return o.cabinGroup === key || o.cabinCode === key;
}

export interface Pivot {
  rows: AxisEntry[];
  cols: AxisEntry[];
  cells: Map<string, Offer>;
  min: number;
  max: number;
}

export function cellKey(r: string, c: string): string {
  return `${r}\u0000${c}`;
}

export function axisOf(offers: Offer[], d: Dim): AxisEntry[] {
  const seen = new Map<string, { entry: AxisEntry; sample: Offer; min: number }>();
  for (const o of offers) {
    const k = dimKey(o, d);
    const cur = seen.get(k);
    if (!cur) seen.set(k, { entry: axisEntry(o, d), sample: o, min: o.total });
    else if (o.total < cur.min) cur.min = o.total;
  }
  const list = [...seen.values()];
  list.sort((a, b) => {
    switch (d) {
      case 'tariff':
        return tariffOrder(a.sample.tariffCode) - tariffOrder(b.sample.tariffCode);
      case 'cabinGroup':
        return cabinGroupOrder(a.sample.cabinGroup) - cabinGroupOrder(b.sample.cabinGroup);
      case 'cabin':
        return (
          cabinGroupOrder(a.sample.cabinGroup) - cabinGroupOrder(b.sample.cabinGroup) ||
          Number(b.sample.flex) - Number(a.sample.flex) ||
          a.min - b.min ||
          a.entry.key.localeCompare(b.entry.key)
        );
      case 'transport':
        return KIND_ORDER[a.sample.transport] - KIND_ORDER[b.sample.transport] || a.min - b.min;
    }
  });
  return list.map((x) => x.entry);
}

function axisEntry(o: Offer, d: Dim): AxisEntry {
  switch (d) {
    case 'cabinGroup':
      return { key: o.cabinGroup, label: cabinGroupLabel(o.cabinGroup) };
    case 'cabin':
      return { key: o.cabinCode, label: shortCabinName(o.cabinName), sub: o.cabinCode };
    case 'tariff':
      return { key: o.tariffCode, label: tariffInfo(o.tariffCode, o.tariffName).short };
    case 'transport':
      return { key: transportKey(o), label: transportLabel(o) };
  }
}

export function shortCabinName(name: string): string {
  return name
    .replace(/^Flexkabine\s+/i, 'Flex ')
    .replace(/kabine/gi, '')
    .replace(/Verandakab\./i, 'Veranda')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildPivot(offers: Offer[], rowDim: Dim, colDim: Dim): Pivot {
  const cells = new Map<string, Offer>();
  let min = Infinity;
  let max = -Infinity;
  for (const o of offers) {
    const k = cellKey(dimKey(o, rowDim), dimKey(o, colDim));
    const cur = cells.get(k);
    if (!cur || o.total < cur.total) cells.set(k, o);
  }
  for (const o of cells.values()) {
    min = Math.min(min, o.total);
    max = Math.max(max, o.total);
  }
  return { rows: axisOf(offers, rowDim), cols: axisOf(offers, colDim), cells, min, max };
}

// ---------------------------------------------------------------- Liste

export type SortField = 'price' | 'tariff' | 'cabin' | 'transport' | 'departure';

export const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: 'price', label: 'Preis' },
  { field: 'tariff', label: 'Tarif' },
  { field: 'cabin', label: 'Kabine' },
  { field: 'transport', label: 'Anreise' },
  { field: 'departure', label: 'Abflugzeit' },
];

export function sortOffers(offers: Offer[], field: SortField, desc: boolean): Offer[] {
  const cmp = (a: Offer, b: Offer): number => {
    switch (field) {
      case 'price':
        return a.total - b.total;
      case 'tariff':
        return tariffOrder(a.tariffCode) - tariffOrder(b.tariffCode) || a.total - b.total;
      case 'cabin':
        return (
          cabinGroupOrder(a.cabinGroup) - cabinGroupOrder(b.cabinGroup) ||
          a.cabinCode.localeCompare(b.cabinCode) ||
          a.total - b.total
        );
      case 'transport':
        return (
          KIND_ORDER[a.transport] - KIND_ORDER[b.transport] ||
          transportKey(a).localeCompare(transportKey(b)) ||
          a.total - b.total
        );
      case 'departure': {
        const ta = a.outbound ? `${a.outbound.depDate} ${a.outbound.depTime}` : '~';
        const tb = b.outbound ? `${b.outbound.depDate} ${b.outbound.depTime}` : '~';
        return ta.localeCompare(tb) || a.total - b.total;
      }
    }
  };
  const sorted = offers.slice().sort(cmp);
  return desc ? sorted.reverse() : sorted;
}

/** Alle Flughäfen, die in den Angeboten vorkommen (für Filter-Auswahl). */
export function airportsOf(offers: Offer[], dir: 'out' | 'in'): { code: string; name: string }[] {
  const m = new Map<string, string>();
  for (const o of offers) {
    const leg = dir === 'out' ? o.outbound : o.inbound;
    if (!leg) continue;
    const code = dir === 'out' ? leg.from : leg.to;
    const name = dir === 'out' ? leg.fromName : leg.toName;
    m.set(code, name);
  }
  return [...m.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
}
