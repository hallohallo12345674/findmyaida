import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { validatePax } from '../domain/pax.js';
import type { Pax, TransportKind, ViewId } from '../domain/types.js';

/*
 * Einstellungen der Settings-Seite. Eigene Datei neben state.json: state.json hält, was sich beim Benutzen von
 * selbst ergibt (letzte Ansicht, Filter, Suche); settings.json hält bewusst gewählte Vorgaben. Jedes Feld wird
 * einzeln geprüft – ein ungültiger Wert fällt auf den Standard zurück, ohne die übrigen zu verlieren.
 */

export type ThemeSetting = 'auto' | 'dark' | 'light';
export type ContrastSetting = 'normal' | 'high' | 'basic';
export type StartScreenSetting = 'home' | 'trips' | 'last';
export type AccessSetting = 'auto' | 'direct' | 'firefox' | 'extension';

export interface Settings {
  // Darstellung
  theme: ThemeSetting;
  contrast: ContrastSetting;
  bigLogo: boolean;
  sayings: boolean;
  cents: boolean;
  // Bedienung
  mouse: boolean;
  hover: boolean;
  startScreen: StartScreenSetting;
  recentCount: number;
  // Standardwerte
  /** null: zuletzt genutzte Belegung */
  defaultPax: Pax | null;
  homeAirports: string[];
  transports: TransportKind[];
  /** 0: zuletzt genutzte Ansicht */
  startView: 0 | ViewId;
  subcategories: 'last' | 'on' | 'off';
  /** Bundesland für Schulferien, das jede neue Suche mitbringt */
  defaultState: string | null;
  // Favoriten
  checkFavorites: boolean;
  deltaMode: 'euro' | 'percent';
  /** Änderungen ab diesem Betrag (in €) farbig */
  deltaThreshold: number;
  hideDeparted: boolean;
  favoriteSort: 'departure' | 'change' | 'saved';
  // Zugriff
  access: AccessSetting;
  /** leer: Firefox automatisch suchen */
  firefoxPath: string;
  port: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  contrast: 'normal',
  bigLogo: true,
  sayings: true,
  cents: false,
  mouse: true,
  hover: true,
  startScreen: 'home',
  recentCount: 3,
  defaultPax: null,
  homeAirports: [],
  transports: ['return', 'none'],
  startView: 0,
  subcategories: 'last',
  defaultState: null,
  checkFavorites: true,
  deltaMode: 'euro',
  deltaThreshold: 0,
  hideDeparted: false,
  favoriteSort: 'departure',
  access: 'auto',
  firefoxPath: '',
  port: 47831,
};

export const RECENT_MAX = 5;
export const DELTA_THRESHOLDS = [0, 10, 25, 50, 100, 250];

const Count = z.number().int().min(0);
const FIELDS: { [K in keyof Settings]: z.ZodType<Settings[K]> } = {
  theme: z.enum(['auto', 'dark', 'light']),
  contrast: z.enum(['normal', 'high', 'basic']),
  bigLogo: z.boolean(),
  sayings: z.boolean(),
  cents: z.boolean(),
  mouse: z.boolean(),
  hover: z.boolean(),
  startScreen: z.enum(['home', 'trips', 'last']),
  recentCount: z.number().int().min(0).max(RECENT_MAX),
  defaultPax: z
    .object({ adults: Count, juveniles: Count, children: Count, babies: Count })
    .nullable()
    .refine((p) => !p || !validatePax(p)),
  homeAirports: z.array(z.string().regex(/^[A-Z]{3}$/)).max(12),
  transports: z.array(z.enum(['return', 'openjaw', 'outbound', 'inbound', 'none'])),
  startView: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  subcategories: z.enum(['last', 'on', 'off']),
  defaultState: z.string().regex(/^[A-Z]{2}$/).nullable(),
  checkFavorites: z.boolean(),
  deltaMode: z.enum(['euro', 'percent']),
  deltaThreshold: z.number().int().min(0).max(10_000),
  hideDeparted: z.boolean(),
  favoriteSort: z.enum(['departure', 'change', 'saved']),
  access: z.enum(['auto', 'direct', 'firefox', 'extension']),
  firefoxPath: z.string().max(1024),
  port: z.number().int().min(1024).max(65535),
};

const FILE_VERSION = 1;

/** Prüft jedes Feld einzeln; Ungültiges oder Fehlendes kommt aus DEFAULT_SETTINGS. */
export function parseSettings(raw: unknown): { settings: Settings; invalid: (keyof Settings)[] } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const settings = { ...DEFAULT_SETTINGS } as Record<keyof Settings, unknown>;
  const invalid: (keyof Settings)[] = [];
  for (const key of Object.keys(FIELDS) as (keyof Settings)[]) {
    if (!(key in obj)) continue;
    const r = FIELDS[key].safeParse(obj[key]);
    if (r.success) settings[key] = r.data;
    else invalid.push(key);
  }
  return { settings: settings as unknown as Settings, invalid };
}

export interface SettingsLoad {
  settings: Settings;
  /** Datei vorhanden, aber nicht lesbar: vor dem ersten Schreiben als .bak sichern */
  corrupt: boolean;
}

export function loadSettings(file: string): SettingsLoad {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === 'ENOENT';
    return { settings: DEFAULT_SETTINGS, corrupt: !missing };
  }
  if ((raw as { version?: unknown } | null)?.version !== FILE_VERSION) return { settings: DEFAULT_SETTINGS, corrupt: true };
  return { settings: parseSettings(raw).settings, corrupt: false };
}

/** Schreibt atomar; eine zuvor unlesbare Datei wird erst als .bak gesichert. */
export function saveSettings(file: string, s: Settings, backupFirst = false): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (backupFirst && fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: FILE_VERSION, ...s }, null, 2));
    fs.renameSync(tmp, file);
  } catch {
    /* nicht kritisch */
  }
}
