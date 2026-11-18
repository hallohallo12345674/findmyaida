// Zuerst laden: setzt die Farbtiefe, bevor Ink importiert wird.
import { renderFrame } from '../scripts/lib/harness.js';
import { describe, expect, it } from 'vitest';
import { parseAnsi } from '../scripts/lib/ansi-svg.js';
import { paletteFor } from '../src/ui/theme.js';

const LIGHT = paletteFor('light', 'normal');

/** Zelle an der ersten Fundstelle eines Textes. */
function cellAt(frame: string, text: string, offset = 0) {
  const grid = parseAnsi(frame, 120);
  for (const row of grid) {
    const line = row.map((c) => c.ch).join('');
    const x = line.indexOf(text);
    if (x >= 0) return row[x + offset]!;
  }
  throw new Error(`„${text}“ nicht gefunden`);
}

describe('Farben beim Übermalen (helles Schema auf dunklem Terminal)', () => {
  it('verschachtelter Text behält den Hintergrund seines Textes (aktiver Tab, Chip)', async () => {
    const frame = await renderFrame({ screen: 'compare', settings: { theme: 'light' } });
    // Ziffer im aktiven Tab: weiß auf Akzent, nicht weiß auf dem übermalten Seitenhintergrund
    expect(cellAt(frame, '1 Kabine × Tarif').bg).toBe(LIGHT.accent);
    // Pfeil im Chip „Tarif alle ▾“
    expect(cellAt(frame, 'Tarif alle ▾', 11).bg).toBe(LIGHT.chipBg);
  });
});
