/**
 * Lädt Schulferien und Feiertage für alle 16 Bundesländer von der OpenHolidays API
 * (https://openholidaysapi.org, Open Data) und schreibt einen normalisierten Schnappschuss
 * nach src/data/school-holidays.json. Zur Laufzeit braucht FindMyAIDA keine Netzverbindung dafür.
 *
 *   npx tsx scripts/update-holidays.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'school-holidays.json');
const API = 'https://openholidaysapi.org';
// Die API erlaubt höchstens 1.095 Tage pro Abfrage.
const RANGES: [string, string][] = [
  ['2025-09-01', '2027-12-31'],
  ['2028-01-01', '2029-12-31'],
];

interface ApiHoliday {
  id: string;
  startDate: string;
  endDate: string;
  name: { language: string; text: string }[];
  nationwide: boolean;
  subdivisions?: { shortName: string }[];
  groups?: { shortName: string }[];
  tags?: string[];
  comment?: { language: string; text: string }[];
}

type HolidayType = 'winter' | 'ostern' | 'pfingsten' | 'sommer' | 'herbst' | 'weihnachten';

async function fetchAll(kind: 'SchoolHolidays' | 'PublicHolidays'): Promise<ApiHoliday[]> {
  const seen = new Map<string, ApiHoliday>();
  for (const [from, to] of RANGES) {
    const url = `${API}/${kind}?countryIsoCode=DE&languageIsoCode=DE&validFrom=${from}&validTo=${to}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    for (const h of (await res.json()) as ApiHoliday[]) seen.set(h.id, h);
  }
  return [...seen.values()];
}

const nameOf = (h: ApiHoliday) => (h.name.find((n) => n.language === 'DE') ?? h.name[0])!.text;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

/** Zuordnung nach Name und Datum (gleiche Namen bedeuten je Land Verschiedenes). */
function typeOf(name: string, start: string, len: number): HolidayType | null {
  if (len < 2) return null; // einzelne Tage (z. B. Pfingstdienstag) sind nur „frei“
  switch (name) {
    case 'Sommerferien':
      return 'sommer';
    case 'Herbstferien':
      return 'herbst';
    case 'Weihnachtsferien':
      return 'weihnachten';
    case 'Osterferien':
      return 'ostern';
    case 'Pfingstferien':
      return 'pfingsten';
    case 'Winterferien':
    case 'Fastnachtsferien':
    case 'Halbjahresferien':
      return 'winter';
    case 'Frühjahrsferien':
      return Number(start.slice(5, 7)) <= 2 ? 'winter' : 'ostern';
    default:
      return null;
  }
}

async function main() {
  const school = await fetchAll('SchoolHolidays');
  const pub = await fetchAll('PublicHolidays');
  const periods: { state: string; type: HolidayType; name: string; start: string; end: string }[] = [];
  const free: { state: string; name: string; start: string; end: string }[] = [];
  const notes: Record<string, string> = {};

  for (const h of school) {
    const states = (h.subdivisions ?? []).map((s) => s.shortName);
    if (h.tags?.includes('Exception')) {
      const c = h.comment?.find((x) => x.language === 'DE')?.text;
      for (const st of states) if (c) notes[st] = `Abweichende Termine: ${c}`;
      continue;
    }
    // MV: nur allgemeinbildende Schulen (nicht berufliche Schulen)
    if (h.groups?.length && !h.groups.some((g) => g.shortName === 'MV-ABS')) continue;
    const name = nameOf(h);
    const type = typeOf(name, h.startDate, days(h.startDate, h.endDate));
    for (const state of states) {
      if (type) periods.push({ state, type, name, start: h.startDate, end: h.endDate });
      else free.push({ state, name, start: h.startDate, end: h.endDate });
    }
  }
  for (const h of pub) {
    // Nur landesweite Feiertage; lokale (z. B. Friedensfest nur in Augsburg, Kürzel „BY-AU“) zählen nicht.
    const states = h.nationwide ? ['DE'] : (h.subdivisions ?? []).map((s) => s.shortName).filter((s) => !s.includes('-'));
    for (const state of new Set(states)) free.push({ state, name: nameOf(h), start: h.startDate, end: h.endDate });
  }

  const byKey = (a: { state: string; start: string }, b: { state: string; start: string }) =>
    a.state.localeCompare(b.state) || a.start.localeCompare(b.start);
  periods.sort(byKey);
  free.sort(byKey);
  const dedupe = <T,>(list: T[]) => [...new Map(list.map((x) => [JSON.stringify(x), x])).values()];

  const out = {
    source: 'OpenHolidays API (https://openholidaysapi.org), Open Data',
    fetchedAt: new Date().toISOString().slice(0, 10),
    range: [RANGES[0]![0], RANGES[RANGES.length - 1]![1]],
    notes,
    periods: dedupe(periods),
    free: dedupe(free),
  };
  // Eine Zeile je Eintrag – lesbare Diffs bei Aktualisierungen.
  const lines = [
    '{',
    `  "source": ${JSON.stringify(out.source)},`,
    `  "fetchedAt": ${JSON.stringify(out.fetchedAt)},`,
    `  "range": ${JSON.stringify(out.range)},`,
    `  "notes": ${JSON.stringify(out.notes)},`,
    '  "periods": [',
    out.periods.map((p) => `    ${JSON.stringify(p)}`).join(',\n'),
    '  ],',
    '  "free": [',
    out.free.map((p) => `    ${JSON.stringify(p)}`).join(',\n'),
    '  ]',
    '}',
  ];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`${out.periods.length} Ferienperioden, ${out.free.length} freie Tage/Feiertage → ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
