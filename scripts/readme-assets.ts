/**
 * Erzeugt die Grafiken der README nach .github/readme/: Banner (dunkel/hell), Buttons, Badges, Sprachumschalter,
 * Feature-Kacheln und Bildschirmfotos der App. Farben aus src/ui/theme.ts, Schriftzug aus
 * src/ui/components/Logo.tsx – damit README, App und Programmsymbol gleich aussehen.
 *
 *   npm run readme              alles
 *   npm run readme -- graphics  nur Grafiken (ohne Bildschirmfotos)
 */
// Zuerst: Farbtiefe für chalk setzen, bevor irgendein Import Ink lädt.
import './lib/force-color.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paletteFor } from '../src/ui/theme.js';
import { VERSION } from '../src/version.js';
import { demoFavorites } from '../tests/helpers.js';
import { ansiToSvg } from './lib/ansi-svg.js';
import { renderFrame, type FrameOptions } from './lib/harness.js';
import { discPixels, FONT_H, iconSvg, logoSvg, LOGO_COLS, mix, pixelText, rect, seeded, SHIP, SUN, SUN_COLORS, svgDoc, textWidth } from './lib/retro.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, '.github', 'readme');

const DARK = paletteFor('dark', 'normal');
const LIGHT = paletteFor('light', 'normal');

function write(name: string, svg: string) {
  fs.writeFileSync(path.join(OUT, name), svg);
}

/** Pixelkreis (Mond, Sonne) aus Quadraten der Größe px. */
function pixelDisc(cx: number, cy: number, r: number, px: number, color: string, cut?: { dx: number; dy: number }): string {
  return discPixels(r, cut)
    .map(([x, y]) => rect(cx + x * px, cy + y * px, px, px, color))
    .join('');
}

function bitmap(rows: string[], x: number, y: number, px: number, colors: Record<string, string>): string {
  const out: string[] = [];
  rows.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) {
      const k = line[c]!;
      if (k === '.') continue;
      let end = c;
      while (line[end + 1] === k) end++;
      out.push(rect(x + c * px, y + r * px, (end - c + 1) * px, px, colors[k]!));
      c = end;
    }
  });
  return out.join('');
}

function banner(mode: 'dark' | 'light'): string {
  const p = mode === 'dark' ? DARK : LIGHT;
  const W = 1280;
  const H = 420;
  const sky = mode === 'dark' ? ['#0a0e13', '#10213a'] : ['#ffffff', '#e3eefb'];
  const parts: string[] = [];
  parts.push(
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/>` +
      `<stop offset="1" stop-color="${sky[1]}"/></linearGradient>` +
      `<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">${rect(0, 0, 4, 1, p.fg, `opacity="${mode === 'dark' ? 0.035 : 0.025}"`)}</pattern>` +
      `<clipPath id="panel"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="28"/></clipPath></defs>`,
  );
  parts.push(`<g clip-path="url(#panel)">`);
  parts.push(rect(0, 0, W, H, 'url(#sky)'));

  // Himmel: Sterne und Mond bzw. Sonne
  const rnd = seeded(7);
  const logoW = LOGO_COLS * 18;
  const logoX = (W - logoW) / 2;
  if (mode === 'dark') {
    for (let i = 0; i < 34; i++) {
      const x = Math.round(30 + rnd() * (W - 60));
      const y = Math.round(24 + rnd() * 290);
      if (x > logoX - 30 && x < logoX + logoW + 30 && y > 30 && y < 330) continue;
      const size = rnd() < 0.25 ? 4 : 3;
      const op = (0.35 + rnd() * 0.5).toFixed(2);
      const twinkle =
        i % 6 === 0 ? `><animate attributeName="opacity" values="${op};0.1;${op}" dur="${(2.5 + rnd() * 3).toFixed(1)}s" repeatCount="indefinite"/></rect>` : '/>';
      parts.push(rect(x, y, size, size, p.fg, `opacity="${op}"`).replace('/>', twinkle));
    }
    parts.push(pixelDisc(1118, 86, 7, 5, mix(p.fg, sky[0]!, 0.85), { dx: 3, dy: -2 }));
  } else {
    parts.push(bitmap(SUN, 1118 - 12 * 5, 86 - 12 * 5, 5, SUN_COLORS));
  }

  // Schriftzug wie auf der Startseite: „f i n d   m y“ klein, darunter AIDA in den Logofarben
  const small = 'f i n d   m y';
  parts.push(pixelText(small, (W - textWidth(small, 4)) / 2, 44, 4, p.muted));
  parts.push(logoSvg(logoX, 96, 18, p.aidaLetters, sky[0]!));

  // Meer: Horizont, Wellen in Pixelstrichen, Schiff mit Spiegelung
  const horizon = 340;
  parts.push(rect(24, horizon, W - 48, 2, p.accent, 'opacity="0.35"'));
  for (let row = 0; row < 4; row++) {
    const y = horizon + 14 + row * 15;
    const op = (0.55 - row * 0.12).toFixed(2);
    for (let x = -40 + ((row * 23) % 64); x < W; x += 64) parts.push(rect(x, y, 24 - row * 3, 4, p.accent, `opacity="${op}"`));
  }
  const shipPx = 4;
  const shipX = 140;
  const shipY = horizon - SHIP.length * shipPx;
  const hull = mode === 'dark' ? '#c9d1d9' : '#30363d';
  parts.push(bitmap(SHIP, shipX, shipY, shipPx, { w: hull, y: p.favorite, r: p.aidaLetters[1], b: mode === 'dark' ? '#1c3350' : '#0969da' }));
  parts.push(rect(shipX + 16, horizon + 6, 96, 3, hull, 'opacity="0.25"'));
  parts.push(rect(shipX + 36, horizon + 13, 60, 3, hull, 'opacity="0.15"'));

  parts.push(rect(0, 0, W, H, 'url(#scan)'));
  parts.push('</g>');
  parts.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="28" fill="none" stroke="${p.border}" stroke-width="2"/>`);
  return svgDoc(W, H, 'Find My AIDA', parts.join('\n'));
}

// ---------------------------------------------------------------- Buttons, Pillen, Badges, Kacheln

const BTN_W = 232;
const BTN_H = 56;

function button(label: string, icon: string, primary: boolean): string {
  const fill = primary ? DARK.accent : DARK.surface;
  const ink = primary ? DARK.selFg : DARK.fg;
  const iconColors = primary ? { a: DARK.selFg, w: DARK.selFg } : { a: DARK.accent, w: DARK.fg };
  const px = 3;
  const labelW = textWidth(label, px);
  const iconW = 32;
  const gap = 14;
  const x0 = (BTN_W - (iconW + gap + labelW)) / 2;
  const body =
    `<rect x="1" y="1" width="${BTN_W - 2}" height="${BTN_H - 2}" rx="12" fill="${fill}" stroke="${primary ? DARK.accent : DARK.border}" stroke-width="2"/>` +
    iconSvg(icon, x0, (BTN_H - iconW) / 2, 2, iconColors) +
    pixelText(label, x0 + iconW + gap, (BTN_H - FONT_H * px) / 2, px, ink);
  return svgDoc(BTN_W, BTN_H, label, body);
}

function pill(label: string, active: boolean): string {
  const W = 132;
  const H = 34;
  const px = 2;
  const body =
    `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="17" fill="${active ? DARK.accentBg : DARK.surface}" ` +
    `stroke="${active ? DARK.accent : DARK.border}" stroke-width="2"/>` +
    pixelText(label, (W - textWidth(label, px)) / 2, (H - FONT_H * px) / 2, px, active ? DARK.accent : DARK.muted);
  return svgDoc(W, H, label, body);
}

function badge(label: string, value: string, valueColor: string): string {
  const px = 2;
  const pad = 10;
  const lw = textWidth(label, px) + 2 * pad;
  const vw = textWidth(value, px) + 2 * pad;
  const H = 28;
  const W = lw + vw;
  const body =
    `<clipPath id="b"><rect width="${W}" height="${H}" rx="7"/></clipPath><g clip-path="url(#b)">` +
    rect(0, 0, lw, H, DARK.chipBg) +
    rect(lw, 0, vw, H, DARK.surface) +
    `</g><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="7" fill="none" stroke="${DARK.border}"/>` +
    pixelText(label, pad, (H - FONT_H * px) / 2, px, DARK.muted) +
    pixelText(value, lw + pad, (H - FONT_H * px) / 2, px, valueColor);
  return svgDoc(W, H, `${label} ${value}`, body);
}

function tile(icon: string, title: string): string {
  const S = 80;
  const colors = { w: DARK.fg, a: DARK.accent, y: DARK.aidaLetters[2], b: DARK.accent, g: DARK.good, r: DARK.aidaLetters[1] };
  const body =
    `<rect x="1" y="1" width="${S - 2}" height="${S - 2}" rx="18" fill="${DARK.surface}" stroke="${DARK.border}" stroke-width="2"/>` +
    iconSvg(icon, 16, 16, 3, colors);
  return svgDoc(S, S, title, body);
}

export const FEATURES = [
  ['compare', 'grid', 'Vergleich'],
  ['live', 'bolt', 'Live-Preise'],
  ['favorites', 'star', 'Favoriten'],
  ['holidays', 'calendar', 'Schulferien'],
  ['controls', 'cursor', 'Maus und Tastatur'],
  ['install', 'prompt', 'Ohne Einrichtung'],
] as const;

export function writeGraphics(): void {
  fs.mkdirSync(OUT, { recursive: true });
  write('banner-dark.svg', banner('dark'));
  write('banner-light.svg', banner('light'));
  write('btn-download.svg', button('DOWNLOAD', 'download', true));
  write('btn-handbuch.svg', button('HANDBUCH', 'book', false));
  write('btn-manual.svg', button('MANUAL', 'book', false));
  write('btn-releases.svg', button('RELEASES', 'package', false));
  write('lang-de.svg', pill('DEUTSCH', false));
  write('lang-de-active.svg', pill('DEUTSCH', true));
  write('lang-en.svg', pill('ENGLISH', false));
  write('lang-en-active.svg', pill('ENGLISH', true));
  write('badge-version.svg', badge('VERSION', VERSION, DARK.accent));
  write('badge-platforms.svg', badge('OS', 'MACOS · LINUX · WINDOWS', DARK.fg));
  write('badge-runtime.svg', badge('RUNTIME', 'NODE 24 LTS', DARK.good));
  for (const [id, icon, title] of FEATURES) write(`feature-${id}.svg`, tile(icon, title));
}

// ---------------------------------------------------------------- Bildschirmfotos

const COLS = 120;
const ROWS = 34;
const type = (text: string) => [...text];

/** Bildschirme mit Demo-Daten; die Eingaben zeigen die Funktion, um die es geht. */
export const SCREENS: { id: string; title: string; frame: FrameOptions }[] = [
  // Vergleich: Kabine × Tarif, Angebot rechts, gerade gemerkt (Stern)
  { id: 'compare', title: 'findmyaida · Vergleich', frame: { screen: 'compare', keys: ['m'] } },
  // Startseite mit Favoriten und Preisänderung
  // Ohne zufälligen Spruch im Suchfeld, damit das Bild bei jedem Lauf gleich bleibt
  {
    id: 'home',
    title: 'findmyaida · Startseite',
    frame: { screen: 'home', favorites: demoFavorites(), settleMs: 900, settings: { sayings: false } },
  },
  // Reiseübersicht mit Schulferien Bayern, Weihnachten
  { id: 'trips', title: 'findmyaida · Reisen', frame: { screen: 'trips', keys: type('land:by ferien:weih ') } },
  { id: 'settings', title: 'findmyaida · Einstellungen', frame: { screen: 'settings' } },
];

async function writeScreens(): Promise<void> {
  for (const s of SCREENS) {
    for (const mode of ['dark', 'light'] as const) {
      const p = mode === 'dark' ? DARK : LIGHT;
      const frame = await renderFrame({
        ...s.frame,
        cols: COLS,
        rows: ROWS,
        settings: { ...s.frame.settings, theme: mode },
      });
      const svg = ansiToSvg(frame, {
        cols: COLS,
        rows: ROWS,
        fg: p.fg,
        bg: p.bg,
        chrome: p.surface,
        border: p.border,
        muted: p.muted,
        title: s.title,
      });
      write(`screen-${s.id}-${mode}.svg`, svg);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeGraphics();
  if (process.argv[2] !== 'graphics') await writeScreens();
  console.log(`README-Grafiken geschrieben nach ${path.relative(ROOT, OUT)}/`);
  process.exit(0);
}
