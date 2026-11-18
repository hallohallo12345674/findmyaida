import {
  applyFilters,
  axisOf,
  buildPivot,
  cellKey,
  dimKey,
  matchesCabin,
  sortOffers,
  transportKey,
  type AxisEntry,
  type Dim,
  type Pivot,
  type SortField,
} from '../domain/compare.js';
import type { Filters, Offer, PriceMatrix, ViewId } from '../domain/types.js';

export interface Focus {
  cabin?: string;
  tariff?: string;
  transport?: string;
}

export interface Drill extends Focus {
  fromView: ViewId;
}

export interface Pinned {
  dim: 'cabin' | 'tariff';
  key: string;
  label: string;
  options: AxisEntry[];
}

export interface ViewModel {
  all: Offer[];
  filtered: Offer[];
  notices: string[];
  min: number;
  pivot?: Pivot;
  rowDim?: Dim;
  colDim?: Dim;
  pinned?: Pinned;
  row: number;
  col: number;
  list?: Offer[];
  listIndex: number;
  selected?: Offer;
}

export interface ViewInput {
  matrix: PriceMatrix | null;
  filters: Filters;
  view: ViewId;
  expand: boolean;
  focus: Focus;
  drill: Drill | null;
  listIndex: number;
  sortField: SortField;
  sortDesc: boolean;
}

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 1, label: 'Kabine × Tarif' },
  { id: 2, label: 'Anreise × Tarif' },
  { id: 3, label: 'Anreise × Kabine' },
  { id: 4, label: 'Alle Angebote' },
];

export function cabinDim(expand: boolean): Dim {
  return expand ? 'cabin' : 'cabinGroup';
}

/** Findet die Zeile/Spalte für einen Kabinen-Fokus, auch wenn Gruppe ↔ Unterkategorie wechselt. */
export function resolveCabin(entries: AxisEntry[], key: string | undefined, offers: Offer[]): number {
  if (!key) return 0;
  const exact = entries.findIndex((e) => e.key === key);
  if (exact >= 0) return exact;
  const asSub = offers.find((o) => o.cabinCode === key);
  if (asSub) {
    const i = entries.findIndex((e) => e.key === asSub.cabinGroup);
    if (i >= 0) return i;
  }
  const i = entries.findIndex((e) => offers.some((o) => o.cabinCode === e.key && o.cabinGroup === key));
  return i >= 0 ? i : 0;
}

function idx(entries: AxisEntry[], key: string | undefined): number {
  if (!key) return 0;
  const i = entries.findIndex((e) => e.key === key);
  return i >= 0 ? i : 0;
}

export function computeView(input: ViewInput): ViewModel {
  const all = input.matrix?.offers ?? [];
  const { offers: filtered, notices } = applyFilters(all, input.filters);
  const min = filtered.length ? Math.min(...filtered.map((o) => o.total)) : 0;
  const vm: ViewModel = { all, filtered, notices, min, row: 0, col: 0, listIndex: 0 };
  const cDim = cabinDim(input.expand);
  let f = input.focus;
  // Noch keine Auswahl: vom günstigsten Angebot ausgehen, damit alle Ansichten dazu passen.
  if (!f.cabin && !f.tariff && !f.transport && filtered.length) {
    const best = filtered.reduce((a, b) => (b.total < a.total ? b : a));
    f = { cabin: dimKey(best, cDim), tariff: best.tariffCode, transport: transportKey(best) };
  }

  if (input.view === 1) {
    vm.rowDim = cDim;
    vm.colDim = 'tariff';
    vm.pivot = buildPivot(filtered, cDim, 'tariff');
    vm.row = resolveCabin(vm.pivot.rows, f.cabin, filtered);
    vm.col = idx(vm.pivot.cols, f.tariff);
  } else if (input.view === 2) {
    const options = axisOf(filtered, cDim);
    const pi = resolveCabin(options, f.cabin, filtered);
    const pin = options[pi];
    const sub = pin ? filtered.filter((o) => matchesCabin(o, pin.key)) : [];
    if (pin) vm.pinned = { dim: 'cabin', key: pin.key, label: pin.label, options };
    vm.rowDim = 'transport';
    vm.colDim = 'tariff';
    vm.pivot = buildPivot(sub, 'transport', 'tariff');
    vm.row = idx(vm.pivot.rows, f.transport);
    vm.col = idx(vm.pivot.cols, f.tariff);
  } else if (input.view === 3) {
    const options = axisOf(filtered, 'tariff');
    const pin = options[idx(options, f.tariff)];
    const sub = pin ? filtered.filter((o) => o.tariffCode === pin.key) : [];
    if (pin) vm.pinned = { dim: 'tariff', key: pin.key, label: pin.label, options };
    vm.rowDim = 'transport';
    vm.colDim = cDim;
    vm.pivot = buildPivot(sub, 'transport', cDim);
    vm.row = idx(vm.pivot.rows, f.transport);
    vm.col = resolveCabin(vm.pivot.cols, f.cabin, sub);
  } else {
    let list = filtered;
    const d = input.drill;
    if (d) {
      if (d.cabin) list = list.filter((o) => matchesCabin(o, d.cabin!));
      if (d.tariff) list = list.filter((o) => o.tariffCode === d.tariff);
      if (d.transport) list = list.filter((o) => transportKey(o) === d.transport);
    }
    vm.list = sortOffers(list, input.sortField, input.sortDesc);
    vm.listIndex = Math.max(0, Math.min(input.listIndex, vm.list.length - 1));
    vm.selected = vm.list[vm.listIndex];
  }

  if (vm.pivot) {
    // Ohne gespeicherte Auswahl beim günstigsten Angebot starten.
    const focusKeyOf = (d: Dim | undefined) =>
      d === 'tariff' ? f.tariff : d === 'transport' ? f.transport : d ? f.cabin : undefined;
    const unset = focusKeyOf(vm.rowDim) === undefined && focusKeyOf(vm.colDim) === undefined;
    if (unset) {
      let best: Offer | undefined;
      for (const o of vm.pivot.cells.values()) if (!best || o.total < best.total) best = o;
      if (best) {
        const ri = vm.pivot.rows.findIndex((r) => r.key === dimKey(best!, vm.rowDim!));
        const ci = vm.pivot.cols.findIndex((c) => c.key === dimKey(best!, vm.colDim!));
        if (ri >= 0) vm.row = ri;
        if (ci >= 0) vm.col = ci;
      }
    }
    vm.row = Math.min(vm.row, Math.max(0, vm.pivot.rows.length - 1));
    vm.col = Math.min(vm.col, Math.max(0, vm.pivot.cols.length - 1));
    const r = vm.pivot.rows[vm.row];
    const c = vm.pivot.cols[vm.col];
    if (r && c) vm.selected = vm.pivot.cells.get(cellKey(r.key, c.key));
  }
  return vm;
}

/** Übersetzt eine Cursor-Position einer Pivot-Ansicht in den gemeinsamen Fokus. */
export function focusFromCell(vm: ViewModel, view: ViewId, row: number, col: number, prev: Focus): Focus {
  const p = vm.pivot;
  if (!p) return prev;
  const r = p.rows[row]?.key;
  const c = p.cols[col]?.key;
  const next: Focus = { ...prev };
  const set = (d: Dim | undefined, key: string | undefined) => {
    if (!d || key === undefined) return;
    if (d === 'cabin' || d === 'cabinGroup') next.cabin = key;
    else if (d === 'tariff') next.tariff = key;
    else next.transport = key;
  };
  set(vm.rowDim, r);
  set(vm.colDim, c);
  if (view === 2 && vm.pinned) next.cabin = vm.pinned.key;
  if (view === 3 && vm.pinned) next.tariff = vm.pinned.key;
  return next;
}

/** Drilldown von einer Pivot-Zelle in die Angebotsliste. */
export function drillFromCell(vm: ViewModel, view: ViewId): Drill | null {
  const p = vm.pivot;
  if (!p) return null;
  const r = p.rows[vm.row]?.key;
  const c = p.cols[vm.col]?.key;
  if (r === undefined || c === undefined) return null;
  const d: Drill = { fromView: view };
  const set = (dim: Dim | undefined, key: string) => {
    if (dim === 'cabin' || dim === 'cabinGroup') d.cabin = key;
    else if (dim === 'tariff') d.tariff = key;
    else if (dim === 'transport') d.transport = key;
  };
  set(vm.rowDim, r);
  set(vm.colDim, c);
  if (vm.pinned?.dim === 'cabin') d.cabin = vm.pinned.key;
  if (vm.pinned?.dim === 'tariff') d.tariff = vm.pinned.key;
  return d;
}

export { dimKey };
