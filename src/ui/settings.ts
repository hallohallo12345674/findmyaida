import { DEFAULT_FILTERS } from '../domain/compare.js';
import { stateInfo } from '../domain/holidays.js';
import { paxSummary } from '../domain/pax.js';
import { EMPTY_QUERY, type TripQuery } from '../domain/tripQuery.js';
import type { Filters, TransportKind } from '../domain/types.js';
import type { PersistedState } from '../store/state.js';
import { DELTA_THRESHOLDS, RECENT_MAX, type Settings } from '../store/settings.js';
import { bytes } from './format.js';
import type { Scheme } from './theme.js';

/*
 * Logik der Einstellungen ohne Ink: wie Einstellungen auf Zustand, Filter und Suche wirken, und der Aufbau der
 * Settings-Seite als Daten (Abschnitte, Zeilen, Bedienelemente). Die Seite selbst zeichnet nur.
 */

// ---------------------------------------------------------------- Wirkung

/** Standardfilter aus den Einstellungen: Anreiseart und Heimatflughäfen (für Hin- und Rückflug). */
export function userDefaultFilters(s: Settings): Filters {
  return {
    ...DEFAULT_FILTERS,
    transports: [...s.transports],
    depAirports: [...s.homeAirports],
    arrAirports: [...s.homeAirports],
  };
}

/** Ausgangspunkt jeder neuen Suche: leer oder mit dem Standard-Bundesland als Chip. */
export function baseQuery(s: Settings): TripQuery {
  if (!s.defaultState) return EMPTY_QUERY;
  const info = stateInfo(s.defaultState);
  return { chips: [{ kind: 'state', value: info.code, label: info.code, long: info.name }], text: '' };
}

/** Neue Suche: ohne Bundesland-Chip kommt das Standard-Bundesland dazu. */
export function withDefaultState(q: TripQuery, s: Settings): TripQuery {
  if (!s.defaultState || q.chips.some((c) => c.kind === 'state')) return q;
  return { ...q, chips: [...baseQuery(s).chips, ...q.chips] };
}

/** Ansicht und Unterkategorien beim Öffnen einer Reise. */
export function openTripPatch(s: Settings): Partial<PersistedState> {
  return {
    ...(s.startView ? { view: s.startView } : {}),
    ...(s.subcategories !== 'last' ? { expand: s.subcategories === 'on' } : {}),
  };
}

/** Zustand beim Start: feste Belegung, Ansicht, Unterkategorien und Standard-Bundesland. */
export function startupState(state: PersistedState, s: Settings): PersistedState {
  const next: PersistedState = { ...state, ...openTripPatch(s) };
  if (s.defaultPax) next.pax = { ...s.defaultPax };
  next.tripQuery = withDefaultState(state.tripQuery, s);
  return next;
}

export function startScreenFor(s: Settings, state: PersistedState): 'home' | 'trips' | 'compare' {
  if (s.startScreen === 'trips') return 'trips';
  if (s.startScreen === 'last' && state.journeyId) return 'compare';
  return 'home';
}

// ---------------------------------------------------------------- Seite

export type SettingsDialog = 'pax' | 'airports' | 'state' | 'firefoxPath' | 'port' | 'import';
export type SettingsAction = 'clearRecent' | 'clearCache' | 'exportFavorites' | 'resetSettings';

export type Control =
  | { kind: 'switch'; value: boolean; set: (v: boolean) => Partial<Settings> }
  | { kind: 'choice'; value: string; options: { value: string; label: string }[]; set: (v: string) => Partial<Settings> }
  | { kind: 'stepper'; value: number; text: string; min: number; max: number; set: (v: number) => Partial<Settings> }
  | { kind: 'open'; text: string; dialog: SettingsDialog }
  | { kind: 'action'; label: string; action: SettingsAction; confirm?: string; danger?: boolean }
  | { kind: 'info'; text: string };

export interface Row {
  id: string;
  label: string;
  hint?: string;
  control: Control;
  disabled?: boolean;
}

export interface Section {
  id: string;
  icon: string;
  title: string;
  rows: Row[];
}

export interface SettingsContext {
  terminalScheme: Scheme | null;
  /** Maus per --no-mouse für diese Sitzung aus */
  mouseForcedOff: boolean;
  /** per --via erzwungener Weg, falls gesetzt */
  cliVia: string | null;
  viaLabel: string;
  version: string;
  cacheBytes: number;
  recentCount: number;
  favoritesCount: number;
  configDir: string;
  cacheDir: string;
  exportDir: string;
}

const TRANSPORT_PRESETS: { value: string; label: string; kinds: TransportKind[] }[] = [
  { value: 'return,none', label: 'Flug + eigene', kinds: ['return', 'none'] },
  { value: 'return', label: 'Nur Flug', kinds: ['return'] },
  { value: 'none', label: 'Nur eigene', kinds: ['none'] },
  { value: '', label: 'Alle Arten', kinds: [] },
];

const VIEW_OPTIONS = [
  { value: '0', label: 'Zuletzt genutzt' },
  { value: '1', label: 'Kabine × Tarif' },
  { value: '2', label: 'Anreise × Tarif' },
  { value: '3', label: 'Anreise × Kabine' },
  { value: '4', label: 'Alle Angebote' },
];

const ACCESS_HINT: Record<Settings['access'], string> = {
  auto: 'Direkt, bei Ablehnung Firefox ohne Fenster, dann Chrome mit Erweiterung.',
  direct: 'Nur direkt, ohne Browser.',
  firefox: 'Immer über ein Firefox ohne Fenster.',
  extension: 'Immer über Chrome mit der FindMyAIDA-Erweiterung.',
};

/** „/Users/x/.config/findmyaida“ → „~/.config/findmyaida“ */
export function tildePath(p: string, home: string): string {
  return home && p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}



/** Alle Abschnitte der Settings-Seite mit den aktuellen Werten. */
export function settingsSections(s: Settings, ctx: SettingsContext): Section[] {
  const set =
    <K extends keyof Settings>(key: K) =>
    (v: Settings[K]): Partial<Settings> => ({ [key]: v }) as Partial<Settings>;
  const transportPreset = TRANSPORT_PRESETS.find((p) => p.kinds.join(',') === s.transports.join(','));
  const restart = ' Gilt ab dem nächsten Start.';
  return [
    {
      id: 'appearance',
      icon: '◐',
      title: 'Darstellung',
      rows: [
        {
          id: 'theme',
          label: 'Farbschema',
          hint:
            s.theme !== 'auto'
              ? 'Passt das Terminal nicht dazu, übermalt die App dessen Farben.'
              : ctx.terminalScheme
                ? `Richtet sich nach dem Terminal, erkannt: ${ctx.terminalScheme === 'light' ? 'hell' : 'dunkel'}.`
                : 'Richtet sich nach dem Terminal; Hintergrund nicht erkannt, daher dunkel.',
          control: {
            kind: 'choice',
            value: s.theme,
            options: [
              { value: 'auto', label: 'Automatisch' },
              { value: 'dark', label: 'Dunkel' },
              { value: 'light', label: 'Hell' },
            ],
            set: (v) => ({ theme: v as Settings['theme'] }),
          },
        },
        {
          id: 'contrast',
          label: 'Kontrast',
          hint: s.contrast === 'basic' ? 'Nur die 16 Farben des Terminals.' : undefined,
          control: {
            kind: 'choice',
            value: s.contrast,
            options: [
              { value: 'normal', label: 'Standard' },
              { value: 'high', label: 'Hoch' },
              { value: 'basic', label: 'Grundfarben' },
            ],
            set: (v) => ({ contrast: v as Settings['contrast'] }),
          },
        },
        {
          id: 'bigLogo',
          label: 'Großes Logo',
          hint: 'Ohne Logo passen mehr Favoriten auf die Startseite.',
          control: { kind: 'switch', value: s.bigLogo, set: set('bigLogo') },
        },
        { id: 'sayings', label: 'Sprüche im Suchfeld', control: { kind: 'switch', value: s.sayings, set: set('sayings') } },
        {
          id: 'cents',
          label: 'Preise mit Cent',
          hint: 'In Angebotsdetails und Favoriten; Tabellen bleiben gerundet.',
          control: { kind: 'switch', value: s.cents, set: set('cents') },
        },
      ],
    },
    {
      id: 'controls',
      icon: '⌖',
      title: 'Bedienung',
      rows: [
        {
          id: 'mouse',
          label: 'Maus',
          hint: ctx.mouseForcedOff ? 'Für diese Sitzung mit --no-mouse ausgeschaltet.' : 'Klicken und Scrollen mit der Maus.',
          disabled: ctx.mouseForcedOff,
          control: { kind: 'switch', value: s.mouse && !ctx.mouseForcedOff, set: set('mouse') },
        },
        {
          id: 'hover',
          label: 'Infos beim Überfahren',
          hint: 'Tooltips wie bei den Schulferien. Über SSH lieber aus.',
          disabled: !s.mouse || ctx.mouseForcedOff,
          control: { kind: 'switch', value: s.hover && s.mouse && !ctx.mouseForcedOff, set: set('hover') },
        },
        {
          id: 'startScreen',
          label: 'Beim Start öffnen',
          control: {
            kind: 'choice',
            value: s.startScreen,
            options: [
              { value: 'home', label: 'Startseite' },
              { value: 'trips', label: 'Reisen' },
              { value: 'last', label: 'Letzte Reise' },
            ],
            set: (v) => ({ startScreen: v as Settings['startScreen'] }),
          },
        },
        {
          id: 'recentCount',
          label: 'Zuletzt angesehen',
          hint: 'Einträge auf der Startseite.',
          control: {
            kind: 'stepper',
            value: s.recentCount,
            text: s.recentCount ? `${s.recentCount}` : 'aus',
            min: 0,
            max: RECENT_MAX,
            set: set('recentCount'),
          },
        },
      ],
    },
    {
      id: 'defaults',
      icon: '⚙',
      title: 'Standardwerte',
      rows: [
        {
          id: 'paxMode',
          label: 'Belegung beim Start',
          control: {
            kind: 'choice',
            value: s.defaultPax ? 'fixed' : 'last',
            options: [
              { value: 'last', label: 'Zuletzt genutzt' },
              { value: 'fixed', label: 'Fest' },
            ],
            set: (v) => ({ defaultPax: v === 'fixed' ? (s.defaultPax ?? { adults: 2, juveniles: 0, children: 0, babies: 0 }) : null }),
          },
        },
        ...(s.defaultPax
          ? [{ id: 'pax', label: 'Feste Belegung', control: { kind: 'open', text: paxSummary(s.defaultPax), dialog: 'pax' } } satisfies Row]
          : []),
        {
          id: 'airports',
          label: 'Heimatflughäfen',
          hint: 'Vorauswahl für Hin- und Rückflug; x im Vergleich setzt darauf zurück.',
          control: { kind: 'open', text: s.homeAirports.length ? s.homeAirports.join(', ') : 'alle', dialog: 'airports' },
        },
        {
          id: 'transports',
          label: 'Anreise',
          control: {
            kind: 'choice',
            value: transportPreset?.value ?? 'return,none',
            options: TRANSPORT_PRESETS.map(({ value, label }) => ({ value, label })),
            set: (v) => ({ transports: TRANSPORT_PRESETS.find((p) => p.value === v)?.kinds ?? ['return', 'none'] }),
          },
        },
        {
          id: 'startView',
          label: 'Ansicht beim Öffnen',
          control: {
            kind: 'choice',
            value: String(s.startView),
            options: VIEW_OPTIONS,
            set: (v) => ({ startView: Number(v) as Settings['startView'] }),
          },
        },
        {
          id: 'subcategories',
          label: 'Kabinen-Unterkategorien',
          control: {
            kind: 'choice',
            value: s.subcategories,
            options: [
              { value: 'last', label: 'Zuletzt' },
              { value: 'on', label: 'Ein' },
              { value: 'off', label: 'Aus' },
            ],
            set: (v) => ({ subcategories: v as Settings['subcategories'] }),
          },
        },
        {
          id: 'defaultState',
          label: 'Bundesland für Schulferien',
          hint: 'Jede neue Suche bringt es als Chip mit.',
          control: {
            kind: 'open',
            text: s.defaultState ? `${stateInfo(s.defaultState).name} (${s.defaultState})` : 'keins',
            dialog: 'state',
          },
        },
      ],
    },
    {
      id: 'favorites',
      icon: '★',
      title: 'Favoriten',
      rows: [
        {
          id: 'checkFavorites',
          label: 'Preise beim Start prüfen',
          hint: 'Eine Abfrage je Reise und Belegung, nacheinander. Aus: letzter Stand.',
          control: { kind: 'switch', value: s.checkFavorites, set: set('checkFavorites') },
        },
        {
          id: 'deltaMode',
          label: 'Preisänderung als',
          control: {
            kind: 'choice',
            value: s.deltaMode,
            options: [
              { value: 'euro', label: 'Euro' },
              { value: 'percent', label: 'Prozent' },
            ],
            set: (v) => ({ deltaMode: v as Settings['deltaMode'] }),
          },
        },
        {
          id: 'deltaThreshold',
          label: 'Farbig ab',
          hint: 'Kleinere Änderungen bleiben grau.',
          control: {
            kind: 'stepper',
            value: Math.max(0, DELTA_THRESHOLDS.indexOf(s.deltaThreshold)),
            text: s.deltaThreshold ? `${s.deltaThreshold} €` : 'jeder Änderung',
            min: 0,
            max: DELTA_THRESHOLDS.length - 1,
            set: (i) => ({ deltaThreshold: DELTA_THRESHOLDS[i] ?? 0 }),
          },
        },
        { id: 'hideDeparted', label: 'Abgefahrene ausblenden', control: { kind: 'switch', value: s.hideDeparted, set: set('hideDeparted') } },
        {
          id: 'favoriteSort',
          label: 'Sortieren nach',
          control: {
            kind: 'choice',
            value: s.favoriteSort,
            options: [
              { value: 'departure', label: 'Abfahrt' },
              { value: 'change', label: 'Änderung' },
              { value: 'saved', label: 'Gemerkt' },
            ],
            set: (v) => ({ favoriteSort: v as Settings['favoriteSort'] }),
          },
        },
      ],
    },
    {
      id: 'access',
      icon: '⇄',
      title: 'Zugriff',
      rows: [
        {
          id: 'access',
          label: 'Zugriffsweg',
          hint: ctx.cliVia
            ? `Für diese Sitzung mit --via ${ctx.cliVia} festgelegt.${restart}`
            : `${ACCESS_HINT[s.access]}${restart}`,
          control: {
            kind: 'choice',
            value: s.access,
            options: [
              { value: 'auto', label: 'Automatisch' },
              { value: 'direct', label: 'Direkt' },
              { value: 'firefox', label: 'Firefox' },
              { value: 'extension', label: 'Chrome' },
            ],
            set: (v) => ({ access: v as Settings['access'] }),
          },
        },
        {
          id: 'firefoxPath',
          label: 'Firefox-Programm',
          hint: `Leer: automatisch suchen.${restart}`,
          control: { kind: 'open', text: s.firefoxPath || 'automatisch', dialog: 'firefoxPath' },
        },
        {
          id: 'port',
          label: 'Port der Chrome-Brücke',
          hint: `Muss zur Erweiterung passen (Standard 47831).${restart}`,
          control: { kind: 'open', text: String(s.port), dialog: 'port' },
        },
      ],
    },
    {
      id: 'data',
      icon: '▤',
      title: 'Daten',
      rows: [
        {
          id: 'cache',
          label: 'Cache',
          hint: `${bytes(ctx.cacheBytes)} in ${ctx.cacheDir}. Preise gelten 15 Minuten, der Katalog 6 Stunden.`,
          control: { kind: 'action', label: 'Leeren', action: 'clearCache', confirm: 'Cache wirklich leeren?' },
        },
        {
          id: 'recent',
          label: 'Verlauf',
          hint: ctx.recentCount ? `${ctx.recentCount} zuletzt angesehene Reisen.` : 'Keine zuletzt angesehenen Reisen.',
          disabled: !ctx.recentCount,
          control: { kind: 'action', label: 'Löschen', action: 'clearRecent', confirm: 'Verlauf wirklich löschen?' },
        },
        {
          id: 'export',
          label: 'Favoriten exportieren',
          hint: `${ctx.favoritesCount} Favoriten als JSON nach ${ctx.exportDir}.`,
          disabled: !ctx.favoritesCount,
          control: { kind: 'action', label: 'Exportieren', action: 'exportFavorites' },
        },
        {
          id: 'import',
          label: 'Favoriten importieren',
          hint: 'Aus einer exportierten Datei; vorhandene bleiben erhalten.',
          control: { kind: 'open', text: 'Datei wählen', dialog: 'import' },
        },
      ],
    },
    {
      id: 'info',
      icon: 'ⓘ',
      title: 'Info',
      rows: [
        { id: 'version', label: 'Version', control: { kind: 'info', text: ctx.version } },
        { id: 'via', label: 'Zugriff', control: { kind: 'info', text: ctx.viaLabel } },
        { id: 'configDir', label: 'Einstellungen und Favoriten', control: { kind: 'info', text: ctx.configDir } },
        {
          id: 'reset',
          label: 'Alle Einstellungen zurücksetzen',
          hint: 'Favoriten, Verlauf und Cache bleiben erhalten.',
          control: { kind: 'action', label: 'Zurücksetzen', action: 'resetSettings', confirm: 'Alle Einstellungen zurücksetzen?', danger: true },
        },
      ],
    },
  ];
}
