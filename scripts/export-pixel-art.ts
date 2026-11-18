/**
 * Exportiert die Pixelgrafiken der README und des Programmsymbols als PNG im Maßstab 1:1 – ein Bildpunkt ist ein
 * Pixel, ohne Kantenglättung –, zum Nachbearbeiten in Aseprite. Dazu eine Palette (GIMP-Format, lädt Aseprite).
 *
 *   npm run pixel-art   → design/pixel-art/
 *
 * Der Schriftzug ist hier auf ein festes Raster gelegt: eine Terminalzelle = 5 × 10 Pixel, Schattenlinien 3 Pixel
 * breit (in den SVG-Grafiken ist er frei skaliert).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paletteFor, type Palette } from '../src/ui/theme.js';
import { Canvas } from './lib/png.js';
import { discPixels, FONT_CHARS, glyph, ICONS, LOGO_COLS, LOGO_ROWS, logoCell, mix, seeded, SHIP, SUN, SUN_COLORS } from './lib/retro.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'design', 'pixel-art');
const DARK = paletteFor('dark', 'normal');
const LIGHT = paletteFor('light', 'normal');
type Mode = 'dark' | 'light';
const pal = (m: Mode): Palette => (m === 'dark' ? DARK : LIGHT);
const SKY: Record<Mode, [string, string]> = { dark: ['#0a0e13', '#10213a'], light: ['#ffffff', '#e3eefb'] };

const written: { file: string; canvas: Canvas }[] = [];
function save(file: string, c: Canvas) {
  const full = path.join(OUT, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, c.png());
  written.push({ file, canvas: c });
}

// ---------------------------------------------------------------- Schriftzug

const CELL_W = 5;
const CELL_H = 10;
export const LOGO_W = LOGO_COLS * CELL_W;
export const LOGO_H = LOGO_ROWS * CELL_H;

/** Flächen eines Schriftzug-Zeichens in ganzen Pixeln innerhalb einer 5 × 10-Zelle. */
function cellRects(ch: string): { rects: [number, number, number, number][]; shade: boolean } {
  const H: [number, number, number, number] = [0, 4, 5, 3];
  const V: [number, number, number, number] = [1, 0, 3, 10];
  const left: [number, number, number, number] = [0, 4, 4, 3];
  const right: [number, number, number, number] = [1, 4, 4, 3];
  const up: [number, number, number, number] = [1, 0, 3, 7];
  const down: [number, number, number, number] = [1, 4, 3, 6];
  const map: Record<string, [number, number, number, number][]> = {
    '█': [[0, 0, CELL_W, CELL_H]],
    '═': [H],
    '║': [V],
    '╗': [left, down],
    '╔': [right, down],
    '╝': [left, up],
    '╚': [right, up],
  };
  return { rects: map[ch] ?? [], shade: ch !== '█' };
}

/** Schriftzug auf die Fläche; Schattenlinien mit dem Hintergrund gemischt wie in der App. */
function drawLogo(c: Canvas, x0: number, y0: number, letters: readonly string[], bg: string) {
  for (let row = 0; row < LOGO_ROWS; row++) {
    for (let col = 0; col < LOGO_COLS; col++) {
      const { ch, letter } = logoCell(col, row);
      const g = cellRects(ch);
      const color = g.shade ? mix(letters[letter]!, bg, 0.45) : letters[letter]!;
      for (const [x, y, w, h] of g.rects) c.fill(x0 + col * CELL_W + x, y0 + row * CELL_H + y, w, h, color);
    }
  }
}

function drawText(c: Canvas, text: string, x: number, y: number, color: string) {
  [...text].forEach((ch, i) => {
    glyph(ch).forEach((line, j) => {
      [...line].forEach((p, k) => p === '#' && c.set(x + i * 6 + k, y + j, color));
    });
  });
}

const FIND_MY = 'f i n d   m y';
const FIND_MY_W = FIND_MY.length * 6 - 1;

// ---------------------------------------------------------------- Formen

/** Abgerundetes Rechteck: Fläche je Zeile über fill(y), 1-Pixel-Rand, außen transparent. */
function roundedRect(c: Canvas, r: number, fill: (y: number) => string, border?: string) {
  const inside = (x: number, y: number) => {
    const dx = x < r ? r - x - 0.5 : x >= c.w - r ? x + 0.5 - (c.w - r) : 0;
    const dy = y < r ? r - y - 0.5 : y >= c.h - r ? y + 0.5 - (c.h - r) : 0;
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1) || x === 0 || y === 0 || x === c.w - 1 || y === c.h - 1;
      c.set(x, y, border && edge ? border : fill(y));
    }
  }
}

/** Himmel in wenigen Farbstufen statt eines weichen Verlaufs – leichter nachzubearbeiten. */
function skyAt(m: Mode, y: number, h: number, steps = 6): string {
  const [a, b] = SKY[m];
  const t = Math.min(steps - 1, Math.floor((y / h) * steps)) / (steps - 1);
  return mix(b, a, t);
}

const ICON_COLORS = (p: Palette) => ({ w: p.fg, a: p.accent, y: DARK.aidaLetters[2], b: p.accent, g: p.good, r: DARK.aidaLetters[1] });

// ---------------------------------------------------------------- Exporte

function logos() {
  for (const m of ['dark', 'light'] as const) {
    const p = pal(m);
    const logo = new Canvas(LOGO_W, LOGO_H);
    drawLogo(logo, 0, 0, p.aidaLetters, p.bg);
    save(`logo-aida-${m}.png`, logo);
    const lockup = new Canvas(LOGO_W, 7 + 6 + LOGO_H);
    drawText(lockup, FIND_MY, Math.floor((LOGO_W - FIND_MY_W) / 2), 0, p.muted);
    drawLogo(lockup, 0, 13, p.aidaLetters, p.bg);
    save(`logo-find-my-aida-${m}.png`, lockup);
  }
}

function font() {
  const perRow = 16;
  const rows = Math.ceil(FONT_CHARS.length / perRow);
  const c = new Canvas(perRow * 6, rows * 8);
  FONT_CHARS.forEach((ch, i) => drawText(c, ch, (i % perRow) * 6, Math.floor(i / perRow) * 8, '#ffffff'));
  save('font-5x7.png', c);
  fs.writeFileSync(
    path.join(OUT, 'font-5x7.txt'),
    `5×7-Pixelschrift, Raster 6 × 8 Pixel je Zeichen, ${perRow} Zeichen je Zeile, in dieser Reihenfolge:\n` +
      `${FONT_CHARS.map((ch) => (ch === ' ' ? '␠' : ch)).join(' ')}\n`,
  );
}

function icons() {
  const names = Object.keys(ICONS);
  const sheet = new Canvas(names.length * 16, 16);
  names.forEach((name, i) => {
    const c = new Canvas(16, 16);
    c.bitmap(ICONS[name]!, 0, 0, ICON_COLORS(DARK));
    save(`icons/${name}.png`, c);
    sheet.bitmap(ICONS[name]!, i * 16, 0, ICON_COLORS(DARK));
  });
  save('icons-sheet.png', sheet);
  fs.writeFileSync(path.join(OUT, 'icons-sheet.txt'), `16 × 16 je Symbol, von links: ${names.join(', ')}\n`);
}

function shipColors(m: Mode) {
  const p = pal(m);
  return { w: m === 'dark' ? '#c9d1d9' : '#30363d', y: p.favorite, r: p.aidaLetters[1], b: m === 'dark' ? '#1c3350' : '#0969da' };
}

function sceneParts() {
  for (const m of ['dark', 'light'] as const) {
    const c = new Canvas(SHIP[0]!.length, SHIP.length);
    c.bitmap(SHIP, 0, 0, shipColors(m));
    save(`ship-${m}.png`, c);
  }
  const moon = new Canvas(15, 15);
  for (const [x, y] of discPixels(7, { dx: 3, dy: -2 })) moon.set(7 + x, 7 + y, mix(DARK.fg, SKY.dark[0], 0.85));
  save('moon.png', moon);
  const sun = new Canvas(25, 25);
  drawSun(sun, 12, 12);
  save('sun.png', sun);
}

/** Sonne mit Mitte bei (cx, cy). */
function drawSun(c: Canvas, cx: number, cy: number) {
  c.bitmap(SUN, cx - 12, cy - 12, SUN_COLORS);
}

/** Banner wie in der README, im Maßstab 1:4 (1280 × 420 → 320 × 105), ein Bildpunkt je Pixel. */
function banners() {
  const W = 320;
  const H = 105;
  for (const m of ['dark', 'light'] as const) {
    const p = pal(m);
    const c = new Canvas(W, H);
    roundedRect(c, 7, (y) => skyAt(m, y, H), p.border);
    const sky = (y: number) => skyAt(m, y, H);
    const logoX = Math.floor((W - LOGO_W) / 2);
    const logoY = 21;
    if (m === 'dark') {
      const rnd = seeded(7);
      for (let i = 0; i < 34; i++) {
        const x = Math.round((30 + rnd() * (1280 - 60)) / 4);
        const y = Math.round((24 + rnd() * 290) / 4);
        if (x > logoX - 8 && x < logoX + LOGO_W + 8 && y > 7 && y < 83) {
          rnd();
          rnd();
          continue;
        }
        const big = rnd() < 0.25;
        const op = 0.35 + rnd() * 0.5;
        c.fill(x, y, big ? 2 : 1, big ? 2 : 1, mix(p.fg, sky(y), op));
      }
      for (const [x, y] of discPixels(7, { dx: 3, dy: -2 })) c.set(279 + x, 21 + y, mix(p.fg, SKY.dark[0], 0.85));
    } else {
      drawSun(c, 279, 21);
    }
    drawText(c, FIND_MY, Math.floor((W - FIND_MY_W) / 2), 10, p.muted);
    drawLogo(c, logoX, logoY, p.aidaLetters, SKY[m][0]);
    // Meer: Horizont, Wellen als Pixelstriche, Schiff mit Spiegelung
    const horizon = 85;
    for (let x = 6; x < W - 6; x++) c.set(x, horizon, mix(p.accent, sky(horizon), 0.35));
    for (let row = 0; row < 4; row++) {
      const y = horizon + 4 + row * 4;
      const len = 6 - row;
      for (let x = -10 + Math.round(((row * 23) % 64) / 4); x < W - 1; x += 16) {
        for (let i = 0; i < len; i++) if (x + i > 0) c.set(x + i, y, mix(p.accent, sky(y), 0.55 - row * 0.12));
      }
    }
    const shipX = 35;
    c.bitmap(SHIP, shipX, horizon - SHIP.length, shipColors(m));
    const hull = shipColors(m).w;
    for (let x = shipX + 4; x < shipX + 28; x++) c.set(x, horizon + 2, mix(hull, sky(horizon + 2), 0.25));
    // Ränder nach dem Zeichnen wiederherstellen (Wellen laufen bis an den Rand)
    roundedRectBorder(c, 7, p.border);
    save(`banner-${m}.png`, c);
  }
}

function roundedRectBorder(c: Canvas, r: number, border: string) {
  const tmp = new Canvas(c.w, c.h);
  roundedRect(tmp, r, () => '#000000', '#ffffff');
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const o = (y * c.w + x) * 4;
      if (tmp.px[o + 3] === 0) c.clear(x, y);
      else if (tmp.px[o] === 255) c.set(x, y, border);
    }
  }
}

/** Programmsymbol als Pixelgrafik: abgerundete dunkle Fläche, Schriftzug mittig. */
function appIcon() {
  const S = 160;
  const c = new Canvas(S, S);
  roundedRect(c, 35, () => DARK.bg);
  drawLogo(c, Math.floor((S - LOGO_W) / 2), Math.floor((S - LOGO_H) / 2), DARK.aidaLetters, DARK.bg);
  save('app-icon.png', c);
}

/** Alle Farben als GIMP-Palette (in Aseprite: Palette → Load Palette). */
function palette() {
  const colors = [...new Set(written.flatMap((w) => [...w.canvas.colors]))].sort();
  const lines = colors.map((hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${hex}`;
  });
  fs.writeFileSync(path.join(OUT, 'findmyaida.gpl'), `GIMP Palette\nName: FindMyAIDA\nColumns: 8\n#\n${lines.join('\n')}\n`);
  return colors.length;
}

/** Übersicht aller Grafiken, vierfach vergrößert – nur zum Ansehen. */
function preview() {
  const pick = (f: string) => written.find((w) => w.file === f)!.canvas;
  const items = [
    'banner-dark.png',
    'banner-light.png',
    'logo-find-my-aida-dark.png',
    'icons-sheet.png',
    'font-5x7.png',
    'ship-dark.png',
    'moon.png',
    'sun.png',
    'app-icon.png',
  ].map(pick);
  const W = 340;
  let y = 10;
  const pos: [Canvas, number, number][] = [];
  let x = 10;
  let rowH = 0;
  for (const it of items) {
    if (x + it.w > W - 10) {
      x = 10;
      y += rowH + 10;
      rowH = 0;
    }
    pos.push([it, x, y]);
    x += it.w + 10;
    rowH = Math.max(rowH, it.h);
  }
  const sheet = new Canvas(W, y + rowH + 10);
  sheet.fill(0, 0, sheet.w, sheet.h, '#161b22');
  for (const [it, px, py] of pos) {
    for (let j = 0; j < it.h; j++) {
      for (let i = 0; i < it.w; i++) {
        const o = (j * it.w + i) * 4;
        if (it.px[o + 3]) it.px.copy(sheet.px, ((py + j) * sheet.w + px + i) * 4, o, o + 4);
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'vorschau-x4.png'), sheet.scaled(4).png());
}

// Nur die eigenen Dateien überschreiben: im Ordner liegen auch die in Aseprite bearbeiteten Fassungen.
fs.mkdirSync(OUT, { recursive: true });
logos();
font();
icons();
sceneParts();
banners();
appIcon();
const n = palette();
preview();
console.log(`${written.length} Pixelgrafiken (1:1), Palette mit ${n} Farben → ${path.relative(ROOT, OUT)}/`);
