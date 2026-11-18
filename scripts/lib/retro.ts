/**
 * Bausteine für die Retro-Grafiken (Programmsymbol, README): Geometrie des AIDA-Schriftzugs aus
 * src/ui/components/Logo.tsx, eine 5×7-Pixelschrift und Pixel-Symbole. Alles als SVG-Rechtecke, damit die
 * Grafiken ohne Web-Font auf jedem System gleich aussehen.
 */
import { LETTERS } from '../../src/ui/components/Logo.js';

/** Rechteck in Zellkoordinaten (0–1). */
export type CellRect = [x: number, y: number, w: number, h: number];

// ---------------------------------------------------------------- Schriftzug

/** Linienstärke der Schattenzeichen relativ zur Zellhöhe (Zelle ist halb so breit wie hoch). */
const LINE = 0.32;

/**
 * Flächen eines Zeichens aus dem Schriftzug innerhalb seiner Zelle. █ füllt die Zelle; die Schattenzeichen
 * (═ ║ ╗ ╔ ╝ ╚) sind Linien durch die Zellmitte.
 */
export function glyphRects(ch: string): { rects: CellRect[]; shade: boolean } {
  if (ch === '█') return { rects: [[0, 0, 1, 1]], shade: false };
  const t = LINE;
  const hy = 0.5 - t / 2; // waagerechte Linie
  const vw = t * 2; // senkrechte Linie, in Zellbreite (Zelle halb so breit)
  const vx = 0.5 - vw / 2;
  const H: CellRect = [0, hy, 1, t];
  const V: CellRect = [vx, 0, vw, 1];
  const left: CellRect = [0, hy, 0.5 + vw / 2, t];
  const right: CellRect = [vx, hy, 1 - vx, t];
  const up: CellRect = [vx, 0, vw, 0.5 + t / 2];
  const down: CellRect = [vx, hy, vw, 1 - hy];
  const map: Record<string, CellRect[]> = {
    '═': [H],
    '║': [V],
    '╗': [left, down],
    '╔': [right, down],
    '╝': [left, up],
    '╚': [right, up],
  };
  return { rects: map[ch] ?? [], shade: true };
}

export const LOGO_COLS = LETTERS.reduce((a, l) => a + l[0]!.length, 0);
export const LOGO_ROWS = LETTERS[0]!.length;

/** Zeichen und Buchstabenindex (0–3: A I D A) an einer Rasterstelle des Schriftzugs. */
export function logoCell(col: number, row: number): { ch: string; letter: number } {
  let x = col;
  for (let i = 0; i < LETTERS.length; i++) {
    const w = LETTERS[i]![0]!.length;
    if (x < w) return { ch: [...LETTERS[i]![row]!][x] ?? ' ', letter: i };
    x -= w;
  }
  return { ch: ' ', letter: 0 };
}

/** Mischt eine Farbe mit dem Hintergrund (für die gedämpften Schattenlinien). */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v * t + y[i]! * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}

/** Schriftzug als SVG: Zellbreite cw, Zellen doppelt so hoch wie breit. */
export function logoSvg(x0: number, y0: number, cw: number, colors: readonly string[], bg: string): string {
  const ch = cw * 2;
  const out: string[] = [];
  for (let row = 0; row < LOGO_ROWS; row++) {
    for (let col = 0; col < LOGO_COLS; col++) {
      const { ch: c, letter } = logoCell(col, row);
      const g = glyphRects(c);
      const color = g.shade ? mix(colors[letter]!, bg, 0.45) : colors[letter]!;
      for (const [rx, ry, rw, rh] of g.rects) {
        out.push(rect(x0 + (col + rx) * cw, y0 + (row + ry) * ch, rw * cw, rh * ch, color));
      }
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------- Pixelschrift

/** 5×7-Pixelschrift: je Zeichen sieben Zeilen aus „#“ und „.“. */
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  f: ['..##.', '.#...', '.#...', '###..', '.#...', '.#...', '.#...'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  y: ['.....', '.....', '#...#', '#...#', '.####', '....#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

export const FONT_H = 7;

/** Alle Zeichen der Pixelschrift in Tabellenreihenfolge. */
export const FONT_CHARS = Object.keys(FONT);

/** Zeilen eines Zeichens der Pixelschrift. */
export function glyph(c: string): string[] {
  const g = FONT[c];
  if (!g) throw new Error(`Pixelschrift: Zeichen „${c}“ fehlt`);
  return g;
}

/** Breite eines Textes in Pixelschrift: 5 Pixel je Zeichen plus 1 Pixel Abstand. */
export function textWidth(text: string, px: number): number {
  return [...text].length * 6 * px - px;
}

/** Text in Pixelschrift ab (x, y) mit Pixelgröße px. Waagerecht zusammenhängende Pixel werden zusammengefasst. */
export function pixelText(text: string, x: number, y: number, px: number, color: string): string {
  const out: string[] = [];
  [...text].forEach((c, i) => {
    const g = FONT[c];
    if (!g) throw new Error(`Pixelschrift: Zeichen „${c}“ fehlt`);
    g.forEach((line, row) => {
      for (let col = 0; col < 5; col++) {
        if (line[col] !== '#') continue;
        let end = col;
        while (line[end + 1] === '#') end++;
        out.push(rect(x + (i * 6 + col) * px, y + row * px, (end - col + 1) * px, px, color));
        col = end;
      }
    });
  });
  return out.join('');
}

// ---------------------------------------------------------------- Pixel-Symbole

/**
 * Pixel-Symbole als Zeilen; jedes Zeichen steht für eine Farbe aus der übergebenen Zuordnung, „.“ ist leer.
 * Format 16×16, damit sie in Kacheln, Buttons und Banner gleich groß wirken.
 */
export const ICONS: Record<string, string[]> = {
  download: [
    '................',
    '.......aa.......',
    '.......aa.......',
    '.......aa.......',
    '.......aa.......',
    '.......aa.......',
    '...aa..aa..aa...',
    '....aa.aa.aa....',
    '.....aaaaaa.....',
    '......aaaa......',
    '.......aa.......',
    '................',
    '..ww........ww..',
    '..ww........ww..',
    '..wwwwwwwwwwww..',
    '................',
  ],
  book: [
    '................',
    '................',
    '..wwwwww.wwwwww.',
    '..w....w.w....w.',
    '..w.aa.w.w.aa.w.',
    '..w....w.w....w.',
    '..w.aa.w.w.aa.w.',
    '..w....w.w....w.',
    '..w.aa.w.w.aa.w.',
    '..w....w.w....w.',
    '..w.aa.w.w.aa.w.',
    '..w....w.w....w.',
    '..wwwwww.wwwwww.',
    '.......www......',
    '................',
    '................',
  ],
  package: [
    '................',
    '......wwww......',
    '....ww....ww....',
    '..ww........ww..',
    '..wwww....wwww..',
    '..w..wwwwww..w..',
    '..w....ww....w..',
    '..w....ww....w..',
    '..w....ww....w..',
    '..w....ww....w..',
    '..ww...ww...ww..',
    '....ww.ww.ww....',
    '......wwww......',
    '................',
    '................',
    '................',
  ],
  grid: [
    '................',
    '.wwwwwwwwwwwwww.',
    '.w...w....w...w.',
    '.w.b.w.yy.w.b.w.',
    '.w...w....w...w.',
    '.wwwwwwwwwwwwww.',
    '.w...w....w...w.',
    '.w.y.w.bb.w.y.w.',
    '.w...w....w...w.',
    '.wwwwwwwwwwwwww.',
    '.w...w....w...w.',
    '.w.b.w.gg.w.b.w.',
    '.w...w....w...w.',
    '.wwwwwwwwwwwwww.',
    '................',
    '................',
  ],
  bolt: [
    '................',
    '................',
    '.........yyy....',
    '........yyy.....',
    '.......yyy......',
    '......yyy.......',
    '.....yyyyyyy....',
    '....yyyyyyy.....',
    '.......yyy......',
    '......yyy.......',
    '.....yyy........',
    '....yy..........',
    '...yy...........',
    '................',
    '................',
    '................',
  ],
  star: [
    '................',
    '................',
    '.......yy.......',
    '.......yy.......',
    '......yyyy......',
    '......yyyy......',
    '.yyyyyyyyyyyyyy.',
    '..yyyyyyyyyyyy..',
    '....yyyyyyyy....',
    '.....yyyyyy.....',
    '.....yyyyyy.....',
    '....yyy..yyy....',
    '....yy....yy....',
    '...yy......yy...',
    '................',
    '................',
  ],
  calendar: [
    '................',
    '...w.......w....',
    '..rrrrrrrrrrrr..',
    '..rrrrrrrrrrrr..',
    '..wwwwwwwwwwww..',
    '..w..........w..',
    '..w.ww.ww.ww.w..',
    '..w..........w..',
    '..w.ww.gg.ww.w..',
    '..w..........w..',
    '..w.ww.ww.ww.w..',
    '..w..........w..',
    '..wwwwwwwwwwww..',
    '................',
    '................',
    '................',
  ],
  cursor: [
    '................',
    '................',
    '.....w..........',
    '.....ww.........',
    '.....waw........',
    '.....waaw.......',
    '.....waaaw......',
    '.....waaaaw.....',
    '.....waaaaaw....',
    '.....waaaaaaw...',
    '.....waaawww....',
    '.....waww.......',
    '.....ww.........',
    '................',
    '................',
    '................',
  ],
  prompt: [
    '................',
    '................',
    '.wwwwwwwwwwwwww.',
    '.w............w.',
    '.w.g..........w.',
    '.w..g.........w.',
    '.w...g........w.',
    '.w..g.........w.',
    '.w.g...gggg...w.',
    '.w............w.',
    '.w............w.',
    '.w............w.',
    '.wwwwwwwwwwwwww.',
    '................',
    '................',
    '................',
  ],
};

/** Pixel-Symbol als SVG. colors ordnet den Buchstaben der Vorlage Farben zu. */
export function iconSvg(name: string, x: number, y: number, px: number, colors: Record<string, string>): string {
  const rows = ICONS[name];
  if (!rows) throw new Error(`Symbol „${name}“ fehlt`);
  const out: string[] = [];
  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const k = line[col]!;
      if (k === '.') continue;
      let end = col;
      while (line[end + 1] === k) end++;
      const color = colors[k];
      if (!color) throw new Error(`Symbol „${name}“: Farbe „${k}“ fehlt`);
      out.push(rect(x + col * px, y + row * px, (end - col + 1) * px, px, color));
      col = end;
    }
  });
  return out.join('');
}

// ---------------------------------------------------------------- Szene

/** Kreuzfahrtschiff: w Rumpf/Aufbauten, y beleuchtete Fenster, r Schornstein, b Unterwasserschiff. */
export const SHIP = [
  '..................rr..............',
  '..................rr..............',
  '.............wwwwwwwwww...........',
  '...........wwwwwwwwwwwwww.........',
  '........wwwwywywywywywywwwww......',
  '.....wwwwwwwwwwwwwwwwwwwwwwwwww...',
  '...wwwwywywywywywywywywywywwwwww..',
  '..wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  '...bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.',
  '....bbbbbbbbbbbbbbbbbbbbbbbbbbbb..',
  '......bbbbbbbbbbbbbbbbbbbbbbbb....',
];

/** Sonne im hellen Banner, 25 × 25, Mitte bei (12, 12): s Scheibe, y Strahlen. */
export const SUN = [
  '............y............',
  '.y..........y..........y.',
  '..y.........y.........y..',
  '...y........y........y...',
  '....y...............y....',
  '.....y....sssss....y.....',
  '........sssssssss........',
  '.......sssssssssss.......',
  '......sssssssssssss......',
  '......sssssssssssss......',
  '.....sssssssssssssss.....',
  '.....sssssssssssssss.....',
  'yyyy.sssssssssssssss.yyyy',
  '.....sssssssssssssss.....',
  '.....sssssssssssssss.....',
  '......sssssssssssss......',
  '......sssssssssssss......',
  '.......sssssssssss.......',
  '........sssssssss........',
  '.....y....sssss....y.....',
  '....y...............y....',
  '...y........y........y...',
  '..y.........y.........y..',
  '.y..........y..........y.',
  '............y............',
];

/** Farben der Sonne. */
export const SUN_COLORS = { s: '#f5c542', y: '#ffcc00' };

/** Pixel einer Scheibe mit Radius r um (0, 0); cut schneidet eine versetzte Scheibe heraus (Mondsichel). */
export function discPixels(r: number, cut?: { dx: number; dy: number }): [number, number][] {
  const out: [number, number][] = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + r * 0.6) continue;
      if (cut && (x - cut.dx) ** 2 + (y - cut.dy) ** 2 <= r * r) continue;
      out.push([x, y]);
    }
  }
  return out;
}

/** Fester Zufall, damit Sterne bei jedem Lauf an derselben Stelle stehen. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- SVG

const r2 = (n: number) => Math.round(n * 100) / 100;

export function rect(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** SVG-Dokument mit Titel (Barrierefreiheit, Tests lesen ihn) und festem viewBox. */
export function svgDoc(w: number, h: number, title: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" ` +
    `aria-label="${esc(title)}" shape-rendering="crispEdges">\n<title>${esc(title)}</title>\n${body}\n</svg>\n`
  );
}
