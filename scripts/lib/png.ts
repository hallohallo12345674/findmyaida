/**
 * PNG ohne Abhängigkeiten: RGBA-Puffer schreiben und eine kleine Zeichenfläche für Pixelgrafik (ein Bildpunkt je
 * Pixel, ohne Kantenglättung).
 */
import zlib from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** RGBA-Puffer (w·h·4 Byte) als PNG. */
export function encodePng(w: number, h: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Zeichenfläche: jeder Aufruf setzt ganze Pixel in voller Deckung, Farben als #rrggbb. */
export class Canvas {
  readonly px: Buffer;
  /** alle benutzten Farben, für die Palette */
  readonly colors = new Set<string>();

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = Buffer.alloc(w * h * 4);
  }

  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (Math.round(y) * this.w + Math.round(x)) * 4;
    const c = color.toLowerCase();
    this.px[o] = parseInt(c.slice(1, 3), 16);
    this.px[o + 1] = parseInt(c.slice(3, 5), 16);
    this.px[o + 2] = parseInt(c.slice(5, 7), 16);
    this.px[o + 3] = 255;
    this.colors.add(c);
  }

  clear(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4);
  }

  fill(x: number, y: number, w: number, h: number, color: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  /** Bitmap aus Zeilen; jedes Zeichen ist ein Schlüssel in colors, „.“ bleibt frei. */
  bitmap(rows: string[], x: number, y: number, colors: Record<string, string>): void {
    rows.forEach((line, j) => {
      [...line].forEach((k, i) => {
        if (k === '.') return;
        const c = colors[k];
        if (!c) throw new Error(`Farbe für „${k}“ fehlt`);
        this.set(x + i, y + j, c);
      });
    });
  }

  png(): Buffer {
    return encodePng(this.w, this.h, this.px);
  }

  /** Vergrößerte Vorschau (Nearest Neighbour) – nur zum Ansehen, nicht zum Bearbeiten. */
  scaled(f: number): Canvas {
    const c = new Canvas(this.w * f, this.h * f);
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const s = (Math.floor(y / f) * this.w + Math.floor(x / f)) * 4;
        this.px.copy(c.px, (y * c.w + x) * 4, s, s + 4);
      }
    }
    return c;
  }
}
