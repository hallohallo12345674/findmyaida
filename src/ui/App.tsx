import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import path from 'node:path';
import { Box, useApp, useStdout } from 'ink';
import type { AidaClient } from '../api/client.js';
import {
  configOf,
  createFavorite,
  evaluateFavorite,
  favoriteId,
  relaxFilters,
  type Favorite,
  type FavoriteTrip,
} from '../domain/favorites.js';
import { samePax } from '../domain/pax.js';
import type { Offer, PriceMatrix } from '../domain/types.js';
import { loadFavorites, saveFavorites } from '../store/favorites.js';
import { DEFAULT_SETTINGS, saveSettings, type Settings } from '../store/settings.js';
import { pushRecent, saveState, type PersistedState } from '../store/state.js';
import { HelpDialog } from './components/dialogs.js';
import { useAccessPath, useBridgeState, useCatalog, useTerminalSize } from './hooks/data.js';
import { useFavoriteChecks } from './hooks/favorites.js';
import { localDay } from './favorites.js';
import { priceDisplay } from './format.js';
import { useKeys } from './input.js';
import { MouseProvider } from './mouse/MouseProvider.js';
import { HOVER_OFF, HOVER_ON, MOUSE_CLICKS_ON, MOUSE_OFF } from './mouse/parse.js';
import { needsPaint, paint } from './paint.js';
import { CompareScreen } from './screens/CompareScreen.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { pickSaying, SAYINGS } from './sayings.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { TripsScreen } from './screens/TripsScreen.js';
import { openTripPatch, startScreenFor, startupState, userDefaultFilters, type SettingsAction } from './settings.js';
import { TEST_ENV, type AppEnv, type Screen, type Shell, type Tone } from './shell.js';
import { applyPalette, paletteFor, theme } from './theme.js';

export interface AppProps {
  client: AidaClient;
  initialState: PersistedState;
  stateFile: string;
  /** Favoriten mit eigener Datei; ohne Datei (Tests) nur im Speicher */
  favorites?: { initial: Favorite[]; file?: string; corrupt?: boolean };
  /** Einstellungen mit eigener Datei; ohne Datei (Tests) nur im Speicher */
  settings?: { initial: Settings; file?: string; corrupt?: boolean };
  /** Umgebung der Sitzung; Tests nutzen TEST_ENV */
  env?: AppEnv;
  extensionDir: string;
  demo: boolean;
  initialScreen?: Screen;
}

export function App(props: AppProps) {
  return (
    <MouseProvider>
      <AppInner {...props} />
    </MouseProvider>
  );
}

function AppInner({
  client,
  initialState,
  stateFile,
  extensionDir,
  demo,
  initialScreen,
  favorites: favInit,
  settings: setInit,
  env = TEST_ENV,
}: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { cols, rows } = useTerminalSize();
  const [settings, setSettings] = useState<Settings>(() => setInit?.initial ?? DEFAULT_SETTINGS);
  // Spruch einmal pro Start wählen und merken, damit er beim nächsten Start nicht wiederkommt.
  const [sayingIdx] = useState(() => pickSaying(initialState.lastSaying));
  const [s, setS] = useState<PersistedState>(() => startupState({ ...initialState, lastSaying: sayingIdx }, settings));
  const [screen, setScreen] = useState<Screen>(() => initialScreen ?? startScreenFor(settings, initialState));
  const settingsReturn = useRef<Screen>('home');
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState<Shell['message']>(null);
  const bridge = useBridgeState(client);
  const via = useAccessPath(client);
  const catalog = useCatalog(client, bridge);

  const update = useCallback((patch: Partial<PersistedState>) => setS((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => {
    const t = setTimeout(() => saveState(stateFile, s), 300);
    return () => clearTimeout(t);
  }, [s, stateFile]);

  // ---------------------------------------------------------------- Favoriten
  const [favorites, setFavorites] = useState<Favorite[]>(() => favInit?.initial ?? []);
  const favFile = favInit?.file;
  const backupPending = useRef(!!favInit?.corrupt);
  const favLoaded = useRef(true);
  useEffect(() => {
    // Erst schreiben, wenn sich etwas geändert hat: eine kaputte Datei bleibt sonst unangetastet liegen.
    if (favLoaded.current) {
      favLoaded.current = false;
      return;
    }
    if (!favFile) return;
    const t = setTimeout(() => {
      saveFavorites(favFile, favorites, backupPending.current);
      backupPending.current = false;
    }, 300);
    return () => clearTimeout(t);
  }, [favorites, favFile]);

  /** Neu geladene Preise für Reise + Belegung bewerten alle betroffenen Favoriten (ohne Zusatzabfrage). */
  const observePrices = useCallback((m: PriceMatrix) => {
    const at = new Date(m.fetchedAt || Date.now()).toISOString();
    setFavorites((prev) => {
      let changed = false;
      const next = prev.map((f) => {
        if (f.journeyId !== m.journeyId || !samePax(f.pax, m.pax)) return f;
        const last = evaluateFavorite(f, m.offers, at);
        if (f.last && JSON.stringify(f.last) === JSON.stringify(last)) return f;
        changed = true;
        return { ...f, last };
      });
      return changed ? next : prev;
    });
  }, []);
  const favoriteChecks = useFavoriteChecks(
    client,
    settings.checkFavorites ? favorites : [],
    bridge,
    screen !== 'home',
    observePrices,
  );

  // ---------------------------------------------------------------- Einstellungen
  const setFile = setInit?.file;
  const setBackup = useRef(!!setInit?.corrupt);
  const setLoaded = useRef(true);
  useEffect(() => {
    if (setLoaded.current) {
      setLoaded.current = false;
      return;
    }
    if (!setFile) return;
    const t = setTimeout(() => {
      saveSettings(setFile, settings, setBackup.current);
      setBackup.current = false;
    }, 300);
    return () => clearTimeout(t);
  }, [settings, setFile]);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })), []);
  // Neue Standardfilter gelten sofort, damit die Wirkung im Vergleich sichtbar ist.
  const filterKey = `${settings.homeAirports.join()}|${settings.transports.join()}`;
  const firstFilterKey = useRef(filterKey);
  useEffect(() => {
    if (filterKey === firstFilterKey.current) return;
    firstFilterKey.current = filterKey;
    setS((st) => ({ ...st, filters: userDefaultFilters(settings) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Farben und Preisformat vor dem Zeichnen der Bildschirme setzen (sie lesen beim Zeichnen).
  const scheme = settings.theme === 'auto' ? (env.terminalScheme ?? 'dark') : settings.theme;
  const palette = useMemo(() => paletteFor(scheme, settings.contrast), [scheme, settings.contrast]);
  applyPalette(palette);
  const painting = needsPaint(settings.theme, env.terminalScheme);
  paint.fg = painting ? palette.fg : null;
  paint.bg = painting ? palette.bg : null;
  priceDisplay.cents = settings.cents;

  // Mausmodus nach Einstellung schalten (Klicks/Scrollen und, getrennt, Bewegungen für Hover).
  useEffect(() => {
    if (!env.mouse) return;
    stdout.write(settings.mouse ? MOUSE_CLICKS_ON + (settings.hover ? HOVER_ON : HOVER_OFF) : MOUSE_OFF);
  }, [env.mouse, settings.mouse, settings.hover, stdout]);

  const runAction = (a: SettingsAction): { text: string; tone: Tone } => {
    switch (a) {
      case 'clearRecent':
        setS((prev) => ({ ...prev, recent: [] }));
        return { text: 'Verlauf gelöscht.', tone: 'info' };
      case 'clearCache':
        client.clearCache();
        return { text: 'Cache geleert.', tone: 'info' };
      case 'resetSettings':
        setSettings(DEFAULT_SETTINGS);
        return { text: 'Einstellungen zurückgesetzt.', tone: 'info' };
      case 'exportFavorites': {
        const file = path.join(env.exportDir, `findmyaida-favoriten-${localDay(new Date())}.json`);
        try {
          saveFavorites(file, favorites, false, true);
          return { text: `${favorites.length} Favoriten exportiert: ${file}`, tone: 'info' };
        } catch (e) {
          return { text: `Export fehlgeschlagen: ${(e as Error).message}`, tone: 'bad' };
        }
      }
    }
  };

  const importFavorites = (file: string): { text: string; tone: Tone } => {
    const r = loadFavorites(file);
    if (r.corrupt) return { text: 'Datei ist keine FindMyAIDA-Favoritenliste.', tone: 'bad' };
    if (!r.favorites.length && !r.skipped) return { text: 'Datei nicht gefunden oder leer.', tone: 'warn' };
    const known = new Set(favorites.map((f) => f.id));
    const fresh = r.favorites.filter((f) => !known.has(f.id));
    setFavorites((prev) => [...prev, ...fresh.filter((f) => !prev.some((p) => p.id === f.id))]);
    const parts = [`${fresh.length} importiert`];
    if (r.favorites.length - fresh.length) parts.push(`${r.favorites.length - fresh.length} schon vorhanden`);
    if (r.skipped) parts.push(`${r.skipped} ungültig`);
    return { text: `Favoriten: ${parts.join(', ')}.`, tone: r.skipped ? 'warn' : 'info' };
  };

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  // Ctrl+C beendet immer, auch bei offenen Dialogen.
  useKeys((input, key) => {
    if (key.ctrl && input === 'c') exit();
  });

  const shell: Shell = useMemo(
    () => ({
      client,
      s,
      update,
      cols,
      rows,
      bridge,
      via,
      catalog,
      demo,
      extensionDir,
      saying: SAYINGS[sayingIdx]!,
      active: !help,
      message,
      notify: (text: string, tone: Tone = 'info') => setMessage({ text, tone }),
      go: setScreen,
      openTrip: (journeyId: string) => {
        setS((prev) => ({ ...prev, ...openTripPatch(settings), journeyId, recent: pushRecent(prev.recent, journeyId) }));
        setScreen('compare');
      },
      showHelp: () => setHelp(true),
      exit,
      favorites,
      favoriteChecks,
      observePrices,
      isFavorite: (o: Offer) => favorites.some((f) => f.id === favoriteId(configOf(o, s.pax, s.expand))),
      toggleFavorite: (o: Offer, offers: Offer[], trip: FavoriteTrip) => {
        const config = configOf(o, s.pax, s.expand);
        const id = favoriteId(config);
        if (favorites.some((f) => f.id === id)) {
          setFavorites((prev) => prev.filter((f) => f.id !== id));
          return null;
        }
        const fav = createFavorite(config, offers, trip, new Date());
        if (fav) setFavorites((prev) => [...prev.filter((f) => f.id !== id), fav]);
        return fav;
      },
      removeFavorite: (id: string) => setFavorites((prev) => prev.filter((f) => f.id !== id)),
      restoreFavorite: (fav: Favorite) =>
        setFavorites((prev) => (prev.some((f) => f.id === fav.id) ? prev : [...prev, fav])),
      openFavorite: (fav: Favorite) => {
        const filters = relaxFilters(s.filters, fav);
        setS((prev) => ({
          ...prev,
          journeyId: fav.journeyId,
          pax: fav.pax,
          expand: fav.cabin.level === 'sub',
          // Ansicht „Anreise × Tarif“: nur dort sind Kabine, Tarif und Anreise zugleich festgelegt.
          view: 2,
          focus: { cabin: fav.cabin.code, tariff: fav.tariff.code, transport: fav.transport.key },
          filters,
          recent: pushRecent(prev.recent, fav.journeyId),
        }));
        setScreen('compare');
        if (filters !== s.filters) setMessage({ text: 'Filter angepasst, damit der Favorit sichtbar ist.', tone: 'info' });
      },
      settings,
      updateSettings,
      env,
      openSettings: () => {
        if (screen !== 'settings') settingsReturn.current = screen;
        setScreen('settings');
      },
      closeSettings: () => setScreen(settingsReturn.current),
      runAction,
      importFavorites,
    }),
    [
      client,
      s,
      update,
      cols,
      rows,
      bridge,
      via,
      catalog,
      demo,
      extensionDir,
      help,
      message,
      exit,
      favorites,
      favoriteChecks,
      observePrices,
      settings,
      updateSettings,
      env,
      screen,
    ],
  );

  return (
    <Box width={cols} height={rows} flexDirection="column" {...(painting ? { backgroundColor: theme.bg } : {})}>
      {screen === 'home' ? <HomeScreen shell={shell} /> : null}
      {screen === 'settings' ? <SettingsScreen shell={shell} /> : null}
      {screen === 'trips' ? <TripsScreen shell={shell} /> : null}
      {screen === 'compare' ? <CompareScreen shell={shell} /> : null}
      {help ? <HelpDialog cols={cols} rows={rows} onClose={() => setHelp(false)} /> : null}
    </Box>
  );
}
