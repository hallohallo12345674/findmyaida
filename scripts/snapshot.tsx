/**
 * Rendert die TUI mit Demo-Daten in ein simuliertes Terminal und gibt nach einer
 * Tastenfolge den Bildschirm aus. Nützlich für Screenshots und schnelle UI-Checks.
 *
 *   npx tsx scripts/snapshot.tsx "2" "<right>" "<enter>"   (Größe: COLS=120 ROWS=34)
 *   SCREEN=home|trips|compare|settings (Standard compare) · FAVS=1: Beispiel-Favoriten · Maus: "<click:x,y>" "<dblclick:x,y>" "<wheel:down,x,y>" "<hover:x,y>" (0-basiert)
 */
import type { Screen } from '../src/ui/shell.js';
import { demoFavorites } from '../tests/helpers.js';
import { renderFrame } from './lib/harness.js';

const frame = await renderFrame({
  screen: (process.env.SCREEN as Screen | undefined) ?? 'compare',
  cols: Number(process.env.COLS ?? 120),
  rows: Number(process.env.ROWS ?? 34),
  ...(process.env.JID ? { journeyId: process.env.JID } : {}),
  favorites: process.env.FAVS ? demoFavorites() : [],
  keys: process.argv.slice(2),
});
process.stdout.write(frame.replace(/\x1b\[[0-9;]*m/g, '') + '\n');
process.exit(0);
