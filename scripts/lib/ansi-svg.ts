/**
 * Wandelt ein Terminalbild mit ANSI-Farben (wie Ink es schreibt) in ein SVG-Terminalfenster. Jede Zelle sitzt auf
 * einem festen Raster: Texte bekommen textLength, Rahmen- und Blockzeichen werden als Flächen gezeichnet, damit sie
 * unabhängig von der Schriftart lückenlos und scharf sind.
 */
import { esc, glyphRects, rect } from './retro.js';

interface Cell {
  ch: string;
  fg: string | null;
  bg: string | null;
  bold: boolean;
}

const BASIC: Record<number, string> = {
  30: '#484f58', 31: '#ff7b72', 32: '#3fb950', 33: '#d29922', 34: '#58a6ff', 35: '#bc8cff', 36: '#39c5cf', 37: '#b1bac4',
  90: '#6e7681', 91: '#ffa198', 92: '#56d364', 93: '#e3b341', 94: '#79c0ff', 95: '#d2a8ff', 96: '#56d4dd', 97: '#ffffff',
};

/** Zerlegt das Bild in Zeilen aus Zellen mit Farbe und Fettdruck. */
export function parseAnsi(frame: string, cols: number): Cell[][] {
  const rows: Cell[][] = [];
  let fg: string | null = null;
  let bg: string | null = null;
  let bold = false;
  for (const line of frame.split('\n')) {
    const row: Cell[] = [];
    const re = /\x1b\[([0-9;]*)m|([^\x1b])/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m[2] !== undefined) {
        row.push({ ch: m[2], fg, bg, bold });
        continue;
      }
      const codes = (m[1] || '0').split(';').map(Number);
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i]!;
        if (c === 0) [fg, bg, bold] = [null, null, false];
        else if (c === 1) bold = true;
        else if (c === 22) bold = false;
        else if (c === 39) fg = null;
        else if (c === 49) bg = null;
        else if ((c === 38 || c === 48) && codes[i + 1] === 2) {
          const hex = `#${codes.slice(i + 2, i + 5).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
          if (c === 38) fg = hex;
          else bg = hex;
          i += 4;
        } else if (BASIC[c]) fg = BASIC[c]!;
        else if (BASIC[c - 10]) bg = BASIC[c - 10]!;
      }
    }
    while (row.length < cols) row.push({ ch: ' ', fg: null, bg: null, bold: false });
    rows.push(row.slice(0, cols));
  }
  return rows;
}

/** Zeichen, die als Fläche statt als Text gezeichnet werden, mit Rechtecken in Zellkoordinaten (0–1). */
function shapes(ch: string, cw: number, chh: number): [number, number, number, number][] | null {
  const t = 1.2 / cw; // dünne Linie (1,2 px) relativ zur Zellbreite
  const tv = 1.2 / chh;
  const T = 2.4 / cw; // dicke Linie
  const Tv = 2.4 / chh;
  switch (ch) {
    case '─':
      return [[0, 0.5 - tv / 2, 1, tv]];
    case '━':
      return [[0, 0.5 - Tv / 2, 1, Tv]];
    case '│':
      return [[0.5 - t / 2, 0, t, 1]];
    case '▌':
      return [[0, 0, 0.5, 1]];
    case '▏':
      return [[0, 0.1, T, 0.8]];
    case '█':
      return [[0, 0, 1, 1]];
    default: {
      // Doppellinien des Schriftzugs (╗ ║ ═ …) wie im Programmsymbol als einfache, kräftige Linien
      const g = glyphRects(ch);
      return g.rects.length ? g.rects : null;
    }
  }
}

/** Abgerundete Rahmenecken als Pfad (Viertelkreis), damit sie an die Linien anschließen. */
function corner(ch: string, x: number, y: number, cw: number, chh: number): string | null {
  const cx = x + cw / 2;
  const cy = y + chh / 2;
  const r = cw / 2;
  switch (ch) {
    case '╭':
      return `M${cx} ${y + chh}V${cy + r}A${r} ${r} 0 0 1 ${cx + r} ${cy}H${x + cw}`;
    case '╮':
      return `M${x} ${cy}H${cx - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}V${y + chh}`;
    case '╰':
      return `M${cx} ${y}V${cy - r}A${r} ${r} 0 0 0 ${cx + r} ${cy}H${x + cw}`;
    case '╯':
      return `M${x} ${cy}H${cx - r}A${r} ${r} 0 0 0 ${cx} ${cy - r}V${y}`;
    default:
      return null;
  }
}

export interface WindowOptions {
  cols: number;
  rows: number;
  fg: string;
  bg: string;
  /** Farbe der Fensterleiste und des Rahmens */
  chrome: string;
  border: string;
  muted: string;
  title: string;
}

const CW = 8.4; // Zellbreite in px (0,6 em bei 14 px)
const CH = 18; // Zellhöhe
const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/** Terminalfenster mit Titelleiste und dem Bild als SVG-Inhalt. */
export function ansiToSvg(frame: string, o: WindowOptions): string {
  const grid = parseAnsi(frame, o.cols).slice(0, o.rows);
  const pad = 14;
  const bar = 34;
  const W = Math.round(o.cols * CW + 2 * pad);
  const H = Math.round(o.rows * CH + bar + pad);
  const ox = pad;
  const oy = bar;
  const out: string[] = [];
  out.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${o.bg}" stroke="${o.border}"/>`);
  out.push(`<path d="M0.5 ${bar}V12.5A12 12 0 0 1 12.5 0.5H${W - 12.5}A12 12 0 0 1 ${W - 0.5} 12.5V${bar}Z" fill="${o.chrome}"/>`);
  out.push(rect(0.5, bar, W - 1, 1, o.border));
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => out.push(`<circle cx="${20 + i * 18}" cy="${bar / 2}" r="5.5" fill="${c}"/>`));
  out.push(
    `<text x="${W / 2}" y="${bar / 2 + 4.5}" fill="${o.muted}" font-family="${FONT}" font-size="12.5" text-anchor="middle">${esc(o.title)}</text>`,
  );

  // Hintergründe zeilenweise zusammenfassen
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const bg = row[c]!.bg;
      if (!bg) continue;
      let end = c;
      while (end + 1 < row.length && row[end + 1]!.bg === bg) end++;
      out.push(rect(ox + c * CW, oy + r * CH, (end - c + 1) * CW, CH, bg));
      c = end;
    }
  });

  // Vordergrund: Flächenzeichen einzeln, Text in Läufen gleicher Farbe
  const text: string[] = [];
  grid.forEach((row, r) => {
    const y = oy + r * CH;
    const baseline = y + CH * 0.72;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      const color = cell.fg ?? o.fg;
      const x = ox + c * CW;
      if (cell.ch === ' ') continue;
      const s = shapes(cell.ch, CW, CH);
      if (s) {
        for (const [rx, ry, rw, rh] of s) out.push(rect(x + rx * CW, y + ry * CH, rw * CW, rh * CH, color));
        continue;
      }
      const d = corner(cell.ch, x, y, CW, CH);
      if (d) {
        out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2"/>`);
        continue;
      }
      // Nicht-ASCII-Zeichen (Symbole) einzeln und mittig, damit abweichende Glyphenbreiten das Raster nicht stören.
      if (cell.ch.charCodeAt(0) > 0x7e) {
        text.push(
          `<text x="${(x + CW / 2).toFixed(1)}" y="${baseline.toFixed(1)}" fill="${color}"${cell.bold ? ' font-weight="700"' : ''} text-anchor="middle">${esc(cell.ch)}</text>`,
        );
        continue;
      }
      let end = c;
      while (
        end + 1 < row.length &&
        row[end + 1]!.ch.charCodeAt(0) <= 0x7e &&
        (row[end + 1]!.fg ?? o.fg) === color &&
        row[end + 1]!.bold === cell.bold
      )
        end++;
      const run = row.slice(c, end + 1).map((x) => x.ch).join('').replace(/\s+$/, '');
      const n = [...run].length;
      text.push(
        `<text x="${x.toFixed(1)}" y="${baseline.toFixed(1)}" fill="${color}"${cell.bold ? ' font-weight="700"' : ''} ` +
          `textLength="${(n * CW).toFixed(1)}" lengthAdjust="spacing" xml:space="preserve">${esc(run)}</text>`,
      );
      c = end;
    }
  });
  out.push(`<g font-family="${FONT}" font-size="14">${text.join('')}</g>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}" shape-rendering="crispEdges">\n` +
    `<title>${esc(o.title)}</title>\n${out.join('\n')}\n</svg>\n`
  );
}
