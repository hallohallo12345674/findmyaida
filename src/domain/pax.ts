import type { Pax } from './types.js';

/** Alter, mit denen auch das AIDA-Buchungs-SPA die Reisenden an die Preis-API übergibt. */
export const PAX_AGES: Record<keyof Pax, number> = {
  adults: 40,
  juveniles: 20,
  children: 10,
  babies: 1,
};

export const PAX_LABELS: Record<keyof Pax, { one: string; many: string; short: string; ages: string }> = {
  adults: { one: 'Erwachsener', many: 'Erwachsene', short: 'Erw.', ages: 'ab 25 J.' },
  juveniles: { one: 'Jugendlicher', many: 'Jugendliche', short: 'Jgl.', ages: '16–24 J.' },
  children: { one: 'Kind', many: 'Kinder', short: 'Kind', ages: '2–15 J.' },
  babies: { one: 'Baby', many: 'Babys', short: 'Baby', ages: 'unter 2 J.' },
};

export const PAX_KEYS: (keyof Pax)[] = ['adults', 'juveniles', 'children', 'babies'];

export const DEFAULT_PAX: Pax = { adults: 2, juveniles: 0, children: 0, babies: 0 };

export const MAX_PAX_PER_CABIN = 4;

export function paxCount(p: Pax): number {
  return p.adults + p.juveniles + p.children + p.babies;
}

export function validatePax(p: Pax): string | null {
  for (const k of PAX_KEYS) {
    if (!Number.isInteger(p[k]) || p[k] < 0) return 'Ungültige Anzahl';
  }
  if (p.adults < 1) return 'Mindestens 1 Erwachsener pro Kabine';
  if (paxCount(p) > MAX_PAX_PER_CABIN) return `Maximal ${MAX_PAX_PER_CABIN} Personen pro Kabine`;
  return null;
}

/** Reisende in der Reihenfolge, in der sie auch an die API gehen (id 1..n). */
export function paxList(p: Pax): { id: number; age: number; type: keyof Pax }[] {
  const out: { id: number; age: number; type: keyof Pax }[] = [];
  for (const k of PAX_KEYS) {
    for (let i = 0; i < p[k]; i++) out.push({ id: out.length + 1, age: PAX_AGES[k], type: k });
  }
  return out;
}

export function paxKey(p: Pax): string {
  return `${p.adults}-${p.juveniles}-${p.children}-${p.babies}`;
}

export function samePax(a: Pax, b: Pax): boolean {
  return paxKey(a) === paxKey(b);
}

export function paxSummary(p: Pax): string {
  const parts: string[] = [];
  for (const k of PAX_KEYS) {
    if (p[k] > 0) parts.push(`${p[k]} ${PAX_LABELS[k].short}`);
  }
  return parts.join(' + ') || '—';
}
