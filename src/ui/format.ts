const int = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1998 → "1.998" */
export function num(n: number): string {
  return int.format(Math.round(n));
}

/** 1998 → "1.998 €" */
export function euro(n: number): string {
  return `${int.format(Math.round(n))} €`;
}

/** 897.2 → "897,20 €" (ganze Beträge ohne Nachkommastellen) */
export function euroExact(n: number): string {
  return Number.isInteger(n) ? euro(n) : `${dec.format(n)} €`;
}

export function signedEuro(n: number): string {
  if (n === 0) return '±0 €';
  return `${n > 0 ? '+' : '−'}${int.format(Math.abs(Math.round(n)))} €`;
}

/** Einstellung „Preise mit Cent“; gilt für Angebotsdetails und Favoriten, Tabellen bleiben gerundet. */
export const priceDisplay = { cents: false };

/** Preis für Detailansichten: mit Cent, wenn eingestellt, sonst gerundet. */
export function euroDetail(n: number): string {
  return priceDisplay.cents ? euroExact(Math.round(n * 100) / 100) : euro(n);
}

/** Vorzeichenbehaftet wie `signedEuro`, mit Cent, wenn eingestellt. */
export function signedEuroDetail(n: number): string {
  if (!priceDisplay.cents || Number.isInteger(n)) return signedEuro(n);
  const abs = euroExact(Math.round(Math.abs(n) * 100) / 100);
  return `${n > 0 ? '+' : '−'}${abs}`;
}

const pct = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 0.047 → "+4,7 %" */
export function signedPercent(ratio: number): string {
  const v = Math.round(ratio * 1000) / 10;
  if (v === 0) return '±0 %';
  return `${v > 0 ? '+' : '−'}${pct.format(Math.abs(v))} %`;
}

/** Bricht Text an Wortgrenzen auf Zeilen der Breite `w` um; überlange Wörter werden hart geteilt. */
export function wrapText(text: string, w: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while ([...rest].length > w) {
      if (line) {
        out.push(line);
        line = '';
      }
      out.push([...rest].slice(0, w).join(''));
      rest = [...rest].slice(w).join('');
    }
    if (!line) line = rest;
    else if ([...line].length + 1 + [...rest].length <= w) line += ` ${rest}`;
    else {
      out.push(line);
      line = rest;
    }
  }
  if (line) out.push(line);
  return out;
}

/** 3_700_000 → "3,5 MB" */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${pct.format(n / 1024)} KB`;
  return `${pct.format(n / 1024 / 1024)} MB`;
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function parts(iso: string): [string, string, string] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? [m[1]!, m[2]!, m[3]!] : null;
}

/** "2026-11-28" → "28.11.2026" */
export function dateDE(iso: string): string {
  const p = parts(iso);
  return p ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

/** "2026-11-28" → "28.11." */
export function dateShort(iso: string): string {
  const p = parts(iso);
  return p ? `${p[2]}.${p[1]}.` : iso;
}

/** "2026-11-28" → "Sa 28.11." */
export function dateWeekday(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return `${WD[d.getDay()]} ${p[2]}.${p[1]}.`;
}

export function timeOf(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const MONTHS = [
  'januar',
  'februar',
  'märz',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'dezember',
];

/** Kürzt auf Breite w (mit …) und füllt rechts mit Leerzeichen auf. */
export function fit(s: string, w: number): string {
  if (w <= 0) return '';
  const chars = [...s];
  if (chars.length > w) return w === 1 ? '…' : chars.slice(0, w - 1).join('') + '…';
  return s + ' '.repeat(w - chars.length);
}

/** Rechtsbündig auf Breite w. Zu langer Text wird ohne „…“ abgeschnitten. */
export function fitRight(s: string, w: number): string {
  const chars = [...s];
  if (chars.length > w) return chars.slice(0, w).join('');
  return ' '.repeat(w - chars.length) + s;
}

/** Breite in Zeichen (Codepoints), nicht in UTF-16-Einheiten. */
export function width(s: string): number {
  return [...s].length;
}
