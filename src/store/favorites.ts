import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { favoriteId, type Favorite } from '../domain/favorites.js';
import { validatePax } from '../domain/pax.js';

/*
 * Favoriten liegen in einer eigenen Datei neben state.json. loadState verwirft bei einer kaputten Datei den ganzen
 * Zustand – für Ansichtseinstellungen in Ordnung, für gespeicherte Konfigurationen und Ursprungspreise nicht.
 */

const Count = z.number().int().min(0);
const Price = z.number().finite().nonnegative();

const FavoriteSchema = z.object({
  id: z.string(),
  journeyId: z.string().min(1),
  pax: z.object({ adults: Count, juveniles: Count, children: Count, babies: Count }),
  tariff: z.object({ code: z.string().min(1), name: z.string() }),
  cabin: z.object({
    level: z.enum(['group', 'sub']),
    code: z.string().min(1),
    group: z.string().min(1),
    name: z.string(),
  }),
  transport: z.object({
    key: z.string(),
    kind: z.enum(['return', 'openjaw', 'outbound', 'inbound', 'none']),
    from: z.string().optional(),
    to: z.string().optional(),
    label: z.string(),
  }),
  savedAt: z.string(),
  trip: z.object({
    title: z.string(),
    shipName: z.string(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string(),
    duration: z.number(),
  }),
  saved: z.object({ total: Price, perPerson: Price }),
  last: z
    .discriminatedUnion('status', [
      z.object({ at: z.string(), status: z.literal('ok'), total: Price, perPerson: Price }),
      z.object({ at: z.string(), status: z.literal('unavailable'), reason: z.string() }),
    ])
    .optional(),
});

const FILE_VERSION = 1;

export interface FavoritesLoad {
  favorites: Favorite[];
  /** Die Datei war vorhanden, aber nicht lesbar. Vor dem nächsten Schreiben wird sie gesichert. */
  corrupt: boolean;
  /** Einträge, die ungültig waren und übersprungen wurden. */
  skipped: number;
}

/** Liest die Favoriten. Ungültige Einträge werden einzeln übersprungen, gültige bleiben erhalten. */
export function loadFavorites(file: string): FavoritesLoad {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === 'ENOENT';
    return { favorites: [], corrupt: !missing, skipped: 0 };
  }
  const list = (raw as { version?: unknown; favorites?: unknown } | null)?.favorites;
  if ((raw as { version?: unknown } | null)?.version !== FILE_VERSION || !Array.isArray(list)) {
    return { favorites: [], corrupt: true, skipped: 0 };
  }
  const favorites: Favorite[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const item of list) {
    const r = FavoriteSchema.safeParse(item);
    // Die ID wird neu berechnet, damit eine von Hand geänderte Konfiguration nicht unter alter ID weiterlebt.
    const fav = r.success ? ({ ...r.data, id: favoriteId(r.data) } as Favorite) : null;
    if (!fav || validatePax(fav.pax) || seen.has(fav.id)) {
      skipped++;
      continue;
    }
    seen.add(fav.id);
    favorites.push(fav);
  }
  return { favorites, corrupt: false, skipped };
}

/**
 * Schreibt atomar (Temporärdatei + rename). Ist die vorhandene Datei laut `loadFavorites` kaputt, wird sie vorher
 * als `.bak` gesichert, statt sie zu überschreiben.
 */
export function saveFavorites(file: string, favorites: Favorite[], backupFirst = false, strict = false): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (backupFirst && fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: FILE_VERSION, favorites }, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    // Export (strict) meldet Fehler; das laufende Speichern versucht es beim nächsten Mal erneut.
    if (strict) throw e;
  }
}
