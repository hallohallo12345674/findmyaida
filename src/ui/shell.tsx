import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { Text } from 'ink';
import type { AidaClient } from '../api/client.js';
import type { AccessPath, TransportState } from '../api/transport.js';
import type { Favorite, FavoriteTrip } from '../domain/favorites.js';
import type { Offer, PriceMatrix } from '../domain/types.js';
import type { Settings } from '../store/settings.js';
import type { PersistedState } from '../store/state.js';
import type { CatalogState } from './hooks/data.js';
import type { CheckStatus } from './hooks/favorites.js';
import type { SettingsAction } from './settings.js';
import type { Scheme } from './theme.js';
import { Clickable } from './components/ui.js';
import { theme } from './theme.js';

export type Screen = 'home' | 'trips' | 'compare' | 'settings';

/** Umgebung der Sitzung, festgelegt beim Start in cli.tsx. */
export interface AppEnv {
  /** erkannter Terminal-Hintergrund, null = unbekannt */
  terminalScheme: Scheme | null;
  /** darf die App den Mausmodus schalten? (echtes Terminal, kein --no-mouse) */
  mouse: boolean;
  /** Maus per --no-mouse aus */
  mouseForcedOff: boolean;
  /** per --via erzwungener Zugriffsweg */
  cliVia: string | null;
  configDir: string;
  cacheDir: string;
  /** Ziel für exportierte Favoriten */
  exportDir: string;
  home: string;
}

/** Umgebung ohne echtes Terminal (Tests, Snapshots): kein Mausmodus, Exporte ins Temp-Verzeichnis. */
export const TEST_ENV: AppEnv = {
  terminalScheme: null,
  mouse: false,
  mouseForcedOff: false,
  cliVia: null,
  configDir: path.join(os.tmpdir(), 'findmyaida-config'),
  cacheDir: path.join(os.tmpdir(), 'findmyaida-cache'),
  exportDir: os.tmpdir(),
  home: os.homedir(),
};
export type Tone = 'info' | 'warn' | 'bad';

/** Gemeinsamer Kontext, den alle Bildschirme vom App-Rahmen bekommen. */
export interface Shell {
  client: AidaClient;
  s: PersistedState;
  update: (patch: Partial<PersistedState>) => void;
  cols: number;
  rows: number;
  bridge: TransportState;
  /** Weg, über den gerade abgefragt wird */
  via: AccessPath;
  catalog: CatalogState;
  demo: boolean;
  extensionDir: string;
  /** Spruch für das Suchfeld der Startseite, einmal pro Start gewählt */
  saying: string;
  /** false, solange ein globaler Dialog (Hilfe) offen ist */
  active: boolean;
  message: { text: string; tone: Tone } | null;
  notify: (text: string, tone?: Tone) => void;
  go: (screen: Screen) => void;
  openTrip: (journeyId: string) => void;
  showHelp: () => void;
  exit: () => void;
  // Favoriten: eigener gespeicherter Bereich (favorites.json), nur über diese Funktionen ändern.
  favorites: Favorite[];
  /** Stand der Preisprüfung beim Start, je Reise + Belegung (`checkGroupKey`) */
  favoriteChecks: Map<string, CheckStatus>;
  /** Neu geladene Preise aktualisieren die passenden Favoriten */
  observePrices: (m: PriceMatrix) => void;
  /** Ist die angezeigte Konfiguration dieses Angebots (bei aktueller Belegung und Kabinenansicht) gemerkt? */
  isFavorite: (o: Offer) => boolean;
  /** Merkt die Konfiguration des Angebots bzw. entfernt sie; gibt den neuen Favoriten zurück, sonst null. */
  toggleFavorite: (o: Offer, offers: Offer[], trip: FavoriteTrip) => Favorite | null;
  removeFavorite: (id: string) => void;
  restoreFavorite: (f: Favorite) => void;
  /** Öffnet den Vergleich mit Belegung, Kabinenansicht und Auswahl des Favoriten */
  openFavorite: (f: Favorite) => void;
  // Einstellungen: eigener gespeicherter Bereich (settings.json), nur über updateSettings ändern.
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  env: AppEnv;
  /** Einstellungsseite öffnen; Esc führt dorthin zurück, wo man herkam */
  openSettings: () => void;
  closeSettings: () => void;
  /** Aktionen der Einstellungsseite; liefert die Meldung für den Nutzer */
  runAction: (a: SettingsAction) => { text: string; tone: Tone };
  importFavorites: (file: string) => { text: string; tone: Tone };
}

export const CONNECTED_LABEL: Record<AccessPath, string> = {
  direct: 'aida.de direkt',
  firefox: 'Firefox ohne Fenster',
  bridge: 'Chrome verbunden',
  fixture: 'Demo-Daten',
};

export function BridgeStatus({ bridge, via, extra }: { bridge: TransportState; via: AccessPath; extra?: string | null }) {
  return (
    <Text>
      {bridge === 'demo' ? (
        <Text color={theme.warn}>● Demo-Daten</Text>
      ) : bridge === 'connected' ? (
        <Text color={theme.good}>● {CONNECTED_LABEL[via]}</Text>
      ) : via === 'bridge' ? (
        <Text color={theme.bad}>○ warte auf Chrome</Text>
      ) : (
        <Text color={theme.warn}>○ Firefox startet …</Text>
      )}
      {extra ? <Text color={theme.muted}>{`  ·  ${extra}`}</Text> : null}
    </Text>
  );
}

/** Zahnrad in der Kopf- bzw. Fußzeile: öffnet die Einstellungen. */
export function SettingsLink({ shell }: { shell: Shell }) {
  return (
    <Clickable onClick={() => shell.openSettings()} flexShrink={0}>
      <Text color={theme.muted}>⚙  </Text>
    </Clickable>
  );
}

/** Hinweis, solange noch kein Weg bereit ist: Firefox startet gerade, oder die Erweiterung muss verbunden werden. */
export function SetupHint({ via, extensionDir }: { via: AccessPath; extensionDir: string }) {
  if (via !== 'bridge') {
    return (
      <Text color={theme.muted} wrap="wrap">
        aida.de hat den direkten Abruf abgelehnt. Firefox wird ohne Fenster gestartet …
      </Text>
    );
  }
  return (
    <Text color={theme.muted} wrap="wrap">
      Chrome-Erweiterung einmalig laden: chrome://extensions → Entwicklermodus → „Entpackte Erweiterung laden“ →{' '}
      <Text color={theme.accent}>{extensionDir}</Text>, dann aida.de öffnen.
    </Text>
  );
}
