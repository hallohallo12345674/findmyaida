export interface CabinGroupInfo {
  code: string;
  label: string;
}

/**
 * Kabinengruppen wie auf aida.de (I, M, V, K, P, D, J, S).
 * Die Preis-API liefert je Unterkategorie einen cabinType, der hier zugeordnet wird.
 */
export const CABIN_GROUPS: CabinGroupInfo[] = [
  { code: 'I', label: 'Innen' },
  { code: 'M', label: 'Meerblick' },
  { code: 'V', label: 'Balkon/Veranda' },
  { code: 'K', label: 'Veranda Komfort' },
  { code: 'P', label: 'Patio' },
  { code: 'D', label: 'Veranda Deluxe' },
  { code: 'J', label: 'Junior-Suite' },
  { code: 'S', label: 'Suite' },
];

const TYPE_TO_GROUP: Record<string, string> = {
  interior: 'I',
  inside: 'I',
  outside: 'M',
  oceanview: 'M',
  balcony: 'V',
  veranda: 'V',
  verandasuite: 'K',
  comfort: 'K',
  patio: 'P',
  patiosuite: 'P',
  deluxesuite: 'D',
  deluxe: 'D',
  juniorsuite: 'J',
  suite: 'S',
};

export function cabinGroupOf(cabinType: string | undefined, cabinTypeCode: string | undefined): string {
  const t = (cabinType ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (TYPE_TO_GROUP[t]) return TYPE_TO_GROUP[t];
  if (t.includes('patio')) return 'P';
  if (t.includes('junior')) return 'J';
  if (t.includes('suite')) return 'S';
  return (cabinTypeCode ?? cabinType ?? '?').toUpperCase();
}

export function cabinGroupLabel(code: string): string {
  return CABIN_GROUPS.find((g) => g.code === code)?.label ?? code;
}

export function cabinGroupOrder(code: string): number {
  const i = CABIN_GROUPS.findIndex((g) => g.code === code);
  return i === -1 ? 99 : i;
}
