/**
 * Erzeugt die Programmsymbole aus dem AIDA-Schriftzug der Startseite (src/ui/components/Logo.tsx), ohne
 * Grafikwerkzeuge: dunkle, abgerundete Fläche, Blockbuchstaben in den AIDA-Farben, Schattenlinien gedämpft.
 *
 *   npx tsx scripts/make-icons.ts   → install/assets/icon.png (512), icon.icns (macOS), icon.ico (Windows)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/png.js';
import { glyphRects, LOGO_COLS, LOGO_ROWS, logoCell } from './lib/retro.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'install', 'assets');

const BG: RGB = [13, 17, 23];
const COLORS: RGB[] = [hex('#196FC3'), hex('#CC3300'), hex('#FFCC00'), hex('#018000')];

type RGB = [number, number, number];
function hex(h: string): RGB {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

/** Deckung eines Zeichens an der Stelle (u, v) innerhalb seiner Zelle (0–1), Geometrie aus scripts/lib/retro.ts. */
function coverage(ch: string, u: number, v: number): { a: number; shade: boolean } {
  const g = glyphRects(ch);
  const hit = g.rects.some(([x, y, w, h]) => u >= x && u < x + w && v >= y && v < y + h);
  return { a: hit ? 1 : 0, shade: g.shade };
}

/** Rendert das Symbol in size×size Pixeln (RGBA), mit 4×4-Überabtastung für glatte Kanten. */
function render(size: number): Buffer {
  const px = Buffer.alloc(size * size * 4);
  const rows = LOGO_ROWS;
  const cols = LOGO_COLS;
  // Zellen sind wie im Terminal doppelt so hoch wie breit.
  const pad = size * 0.12;
  const cw = (size - 2 * pad) / cols;
  const ch = cw * 2;
  const top = (size - rows * ch) / 2;
  const radius = size * 0.22;
  const S = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const fx = x + (sx + 0.5) / S;
          const fy = y + (sy + 0.5) / S;
          // abgerundetes Quadrat
          const dx = Math.max(radius - fx, fx - (size - radius), 0);
          const dy = Math.max(radius - fy, fy - (size - radius), 0);
          if (dx * dx + dy * dy > radius * radius) continue;
          let c: RGB = BG;
          const col = Math.floor((fx - pad) / cw);
          const row = Math.floor((fy - top) / ch);
          if (col >= 0 && col < cols && row >= 0 && row < rows) {
            const { ch: glyph, letter } = logoCell(col, row);
            const cov = coverage(glyph, (fx - pad) / cw - col, (fy - top) / ch - row);
            if (cov.a) {
              const base = COLORS[letter]!;
              c = cov.shade ? (base.map((v, i) => Math.round(v * 0.45 + BG[i]! * 0.55)) as RGB) : base;
            }
          }
          r += c[0];
          g += c[1];
          b += c[2];
          alpha += 1;
        }
      }
      const o = (y * size + x) * 4;
      if (alpha) {
        px[o] = Math.round(r / alpha);
        px[o + 1] = Math.round(g / alpha);
        px[o + 2] = Math.round(b / alpha);
      }
      px[o + 3] = Math.round((alpha / (S * S)) * 255);
    }
  }
  return px;
}

function png(size: number): Buffer {
  return encodePng(size, size, render(size));
}

// ---------------------------------------------------------------- ICNS / ICO

/** macOS-Symbol: PNG-Einträge für 128, 256 und 512 Pixel. */
function icns(): Buffer {
  const entries = (
    [
      ['ic07', 128],
      ['ic08', 256],
      ['ic09', 512],
    ] as const
  ).map(([type, size]) => {
    const data = png(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(entries);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

/** Windows-Symbol: PNG-Einträge für 32, 48 und 256 Pixel (PNG in ICO ab Windows Vista). */
function ico(): Buffer {
  const sizes = [32, 48, 256];
  const images = sizes.map(png);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const dir = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s;
    e[1] = s >= 256 ? 0 : s;
    e.writeUInt16LE(1, 4); // Ebenen
    e.writeUInt16LE(32, 6); // Bit je Pixel
    e.writeUInt32LE(images[i]!.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i]!.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...images]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.png'), png(512));
fs.writeFileSync(path.join(OUT, 'icon.icns'), icns());
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico());
console.log(`Symbole geschrieben nach ${path.relative(ROOT, OUT)}/`);
