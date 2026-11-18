import type { Scheme } from './theme.js';

/*
 * Hell oder Dunkel unabhängig vom Terminal: Passt das gewählte Schema nicht zum Hintergrund des Terminals, übermalt
 * die App Vorder- und Hintergrund. Ink setzt nach jeder farbigen Stelle auf die Standardfarben des Terminals zurück
 * (SGR 39/49/0); `paintChunk` ersetzt diese Rücksprünge durch die Farben der Palette. cli.tsx schaltet das als
 * Filter vor process.stdout.write; ohne aktive Farben (fg/bg null) bleibt die Ausgabe unverändert.
 */

export const paint: { fg: string | null; bg: string | null } = { fg: null, bg: null };

const NAMED: Record<string, [number, number]> = {
  black: [30, 40],
  white: [37, 47],
  whiteBright: [97, 107],
  blackBright: [90, 100],
};

function sgr(color: string, layer: 'fg' | 'bg'): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (m) {
    const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16));
    return `\x1b[${layer === 'fg' ? 38 : 48};2;${r};${g};${b}m`;
  }
  const n = NAMED[color];
  return n ? `\x1b[${layer === 'fg' ? n[0] : n[1]}m` : '';
}

/** Ersetzt Rücksprünge auf die Terminal-Standardfarben durch die Palettenfarben. */
export function paintChunk(chunk: string, fg: string | null, bg: string | null): string {
  if (!fg && !bg) return chunk;
  const f = fg ? sgr(fg, 'fg') : '';
  const b = bg ? sgr(bg, 'bg') : '';
  let out = chunk;
  if (f) out = out.replace(/\x1b\[39m/g, f);
  if (b) out = out.replace(/\x1b\[49m/g, b);
  out = out.replace(/\x1b\[0?m/g, `\x1b[0m${f}${b}`);
  return f + b + out;
}

/** Abschluss beim Beenden: Farben zurück auf die des Terminals. */
export const PAINT_RESET = '\x1b[0m';

/**
 * Antwort auf die Abfrage der Hintergrundfarbe (OSC 11), z. B. `\x1b]11;rgb:1e1e/1e1e/1e1e\x07` → dunkel.
 * Gibt null zurück, wenn keine Farbe erkennbar ist.
 */
export function schemeFromOsc11(response: string): Scheme | null {
  const m = /\]11;rgba?:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i.exec(response);
  if (!m) return null;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16) / (16 ** h.length - 1));
  // relative Helligkeit nach sRGB-Gewichten
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.5 ? 'light' : 'dark';
}

/** COLORFGBG (z. B. „15;0“ = heller Text auf Schwarz) als Ersatz, wenn das Terminal nicht antwortet. */
export function schemeFromColorFgBg(value: string | undefined): Scheme | null {
  if (!value) return null;
  const bg = Number(value.split(';').pop());
  if (!Number.isInteger(bg)) return null;
  return bg === 7 || bg >= 9 ? 'light' : 'dark';
}

/** Soll übermalt werden? Nur bei fester Wahl, die nicht zum Terminal passt (unbekannt gilt als dunkel). */
export function needsPaint(choice: 'auto' | Scheme, terminal: Scheme | null): boolean {
  return choice !== 'auto' && choice !== (terminal ?? 'dark');
}
