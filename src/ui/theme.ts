/**
 * Ruhige Palette mit einem Blau-Akzent, in einer dunklen und einer hellen Fassung (GitHub-Farbwelt). Grün und Rot
 * sparsam: Grün für das Beste oder Erfüllte (günstigstes Angebot, Ersparnis, Verbindung steht), Rot für Fehler,
 * Konflikte und verpasste Schultage. Gelb (`favorite`) nur für den Favoriten-Stern – bewusst nicht `warn`, damit
 * er nicht wie eine Warnung wirkt.
 *
 * `theme` ist ein veränderliches Objekt: Komponenten lesen die Farben beim Zeichnen, `applyPalette` tauscht sie
 * aus, wenn sich die Einstellung ändert. So muss keine Komponente die Palette durchreichen.
 */
export interface Palette {
  /** Vorder- und Hintergrund, falls die App die Terminalfarben übermalt (siehe src/ui/paint.ts) */
  fg: string;
  bg: string;
  accent: string;
  accentBg: string;
  good: string;
  warn: string;
  favorite: string;
  bad: string;
  muted: string;
  faint: string;
  border: string;
  borderFocus: string;
  surface: string;
  chipBg: string;
  selBg: string;
  selFg: string;
  /** Farben der Logo-Buchstaben A, I, D, A (von aida.de). */
  aidaLetters: readonly [string, string, string, string];
}

export type Scheme = 'dark' | 'light';
export type Contrast = 'normal' | 'high' | 'basic';

const AIDA = ['#196FC3', '#CC3300', '#FFCC00', '#018000'] as const;

const DARK: Palette = {
  fg: '#e6edf3',
  bg: '#0d1117',
  accent: '#4aa3ff',
  accentBg: '#1c3350',
  good: '#3fb950',
  warn: '#d29922',
  favorite: '#e3b341',
  bad: '#f85149',
  muted: '#8b949e',
  faint: '#545d68',
  border: '#30363d',
  borderFocus: '#4aa3ff',
  surface: '#161b22',
  chipBg: '#21262d',
  selBg: '#4aa3ff',
  selFg: '#0b0e14',
  aidaLetters: AIDA,
};

const LIGHT: Palette = {
  fg: '#1f2328',
  bg: '#ffffff',
  accent: '#0969da',
  accentBg: '#ddf4ff',
  good: '#1a7f37',
  warn: '#9a6700',
  favorite: '#bf8700',
  bad: '#cf222e',
  muted: '#59636e',
  faint: '#8c959f',
  border: '#d1d9e0',
  borderFocus: '#0969da',
  surface: '#f6f8fa',
  chipBg: '#eff2f5',
  selBg: '#0969da',
  selFg: '#ffffff',
  // Das AIDA-Gelb ist auf Weiß kaum lesbar; ein dunkleres Gelb derselben Familie.
  aidaLetters: ['#196FC3', '#CC3300', '#D4A200', '#018000'],
};

/** Hoher Kontrast: Nebentexte und Rahmen deutlich näher an der Schriftfarbe. */
const HIGH: Record<Scheme, Partial<Palette>> = {
  dark: { muted: '#c9d1d9', faint: '#8b949e', border: '#6e7681', accent: '#79c0ff', borderFocus: '#79c0ff', accentBg: '#1f4b80' },
  light: { muted: '#24292f', faint: '#57606a', border: '#8c959f', accent: '#0550ae', borderFocus: '#0550ae', accentBg: '#b6e3ff' },
};

/** Grundfarben: nur die 16 Farben des Terminals, die das Farbschema des Terminals übernehmen. */
const BASIC: Record<Scheme, Palette> = {
  dark: {
    fg: 'white',
    bg: 'black',
    accent: 'cyanBright',
    accentBg: 'blue',
    good: 'green',
    warn: 'yellow',
    favorite: 'yellowBright',
    bad: 'red',
    muted: 'gray',
    faint: 'gray',
    border: 'gray',
    borderFocus: 'cyan',
    surface: 'black',
    chipBg: 'blackBright',
    selBg: 'cyan',
    selFg: 'black',
    aidaLetters: ['blue', 'red', 'yellow', 'green'],
  },
  light: {
    fg: 'black',
    bg: 'white',
    accent: 'blue',
    accentBg: 'cyanBright',
    good: 'green',
    warn: 'yellow',
    favorite: 'yellow',
    bad: 'red',
    muted: 'blackBright',
    faint: 'gray',
    border: 'gray',
    borderFocus: 'blue',
    surface: 'white',
    chipBg: 'whiteBright',
    selBg: 'blue',
    selFg: 'white',
    aidaLetters: ['blue', 'red', 'yellow', 'green'],
  },
};

export function paletteFor(scheme: Scheme, contrast: Contrast): Palette {
  if (contrast === 'basic') return BASIC[scheme];
  const base = scheme === 'light' ? LIGHT : DARK;
  return contrast === 'high' ? { ...base, ...HIGH[scheme] } : base;
}

export const theme: Palette = { ...DARK };

/** Tauscht die Farben aus; wirkt beim nächsten Zeichnen. */
export function applyPalette(p: Palette): void {
  Object.assign(theme, p);
}
