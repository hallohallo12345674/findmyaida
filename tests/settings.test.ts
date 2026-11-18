import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from '../src/domain/compare.js';
import { Cache } from '../src/store/cache.js';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from '../src/store/settings.js';
import { DEFAULT_STATE } from '../src/store/state.js';
import { deltaTone, formatDelta, homeLists, sortFavorites } from '../src/ui/favorites.js';
import { needsPaint, paintChunk, schemeFromColorFgBg, schemeFromOsc11 } from '../src/ui/paint.js';
import {
  baseQuery,
  settingsSections,
  startScreenFor,
  startupState,
  userDefaultFilters,
  withDefaultState,
  type SettingsContext,
} from '../src/ui/settings.js';
import { applyPalette, paletteFor, theme } from '../src/ui/theme.js';
import { demoFavorites } from './helpers.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'findmyaida-settings-'));

describe('Einstellungsdatei', () => {
  it('prüft jedes Feld einzeln und fällt nur für Ungültiges auf den Standard zurück', () => {
    const r = parseSettings({ theme: 'light', recentCount: 9, homeAirports: ['HAM', 'xx'], port: 50000, unbekannt: 1 });
    expect(r.settings.theme).toBe('light');
    expect(r.settings.port).toBe(50000);
    expect(r.settings.recentCount).toBe(DEFAULT_SETTINGS.recentCount);
    expect(r.settings.homeAirports).toEqual([]);
    expect(r.invalid.sort()).toEqual(['homeAirports', 'recentCount']);
    expect(parseSettings({ defaultPax: { adults: 0, juveniles: 0, children: 1, babies: 0 } }).settings.defaultPax).toBeNull();
  });

  it('Schreiben und Lesen; fehlende Datei = Standard; kaputte Datei wird als .bak gesichert', () => {
    const dir = tmp();
    const file = path.join(dir, 'settings.json');
    expect(loadSettings(file)).toEqual({ settings: DEFAULT_SETTINGS, corrupt: false });
    const s = { ...DEFAULT_SETTINGS, theme: 'dark' as const, homeAirports: ['BER', 'HAM'], defaultState: 'BY' };
    saveSettings(file, s);
    expect(loadSettings(file)).toEqual({ settings: s, corrupt: false });
    fs.writeFileSync(file, '{ kaputt');
    const broken = loadSettings(file);
    expect(broken).toEqual({ settings: DEFAULT_SETTINGS, corrupt: true });
    saveSettings(file, s, broken.corrupt);
    expect(fs.readFileSync(`${file}.bak`, 'utf8')).toBe('{ kaputt');
    expect(fs.readdirSync(dir).sort()).toEqual(['settings.json', 'settings.json.bak']);
  });
});

describe('Farbschema', () => {
  it('Paletten für Hell, Dunkel, hohen Kontrast und Grundfarben', () => {
    expect(paletteFor('dark', 'normal').accent).toBe('#4aa3ff');
    expect(paletteFor('light', 'normal').bg).toBe('#ffffff');
    expect(paletteFor('dark', 'high').muted).not.toBe(paletteFor('dark', 'normal').muted);
    expect(paletteFor('light', 'basic').accent).toBe('blue');
    const before = theme.accent;
    applyPalette(paletteFor('light', 'normal'));
    expect(theme.accent).toBe('#0969da');
    applyPalette(paletteFor('dark', 'normal'));
    expect(theme.accent).toBe(before);
  });

  it('erkennt den Terminal-Hintergrund aus OSC 11 bzw. COLORFGBG', () => {
    expect(schemeFromOsc11('\x1b]11;rgb:1e1e/1e1e/1e1e\x1b\\\x1b[?62;22c')).toBe('dark');
    expect(schemeFromOsc11('\x1b]11;rgb:ffff/ffff/ffff\x07')).toBe('light');
    expect(schemeFromOsc11('\x1b[?1;2c')).toBeNull();
    expect(schemeFromColorFgBg('15;0')).toBe('dark');
    expect(schemeFromColorFgBg('0;15')).toBe('light');
    expect(schemeFromColorFgBg(undefined)).toBeNull();
  });

  it('übermalt nur bei fester Wahl, die nicht zum Terminal passt', () => {
    expect(needsPaint('auto', 'light')).toBe(false);
    expect(needsPaint('dark', null)).toBe(false);
    expect(needsPaint('light', null)).toBe(true);
    expect(needsPaint('dark', 'light')).toBe(true);
    const out = paintChunk('A\x1b[31mB\x1b[39mC\x1b[0m', '#ffffff', '#000000');
    expect(out.startsWith('\x1b[38;2;255;255;255m\x1b[48;2;0;0;0m')).toBe(true);
    expect(out).not.toContain('\x1b[39m');
    expect(out).toContain('\x1b[0m\x1b[38;2;255;255;255m\x1b[48;2;0;0;0m');
    expect(paintChunk('x\x1b[39m', null, null)).toBe('x\x1b[39m');
  });
});

describe('Wirkung der Einstellungen', () => {
  const s = { ...DEFAULT_SETTINGS, homeAirports: ['HAM'], transports: ['return' as const], defaultState: 'BY' };

  it('Heimatflughäfen und Anreiseart bilden die Standardfilter', () => {
    expect(userDefaultFilters(DEFAULT_SETTINGS)).toEqual(DEFAULT_FILTERS);
    expect(userDefaultFilters(s)).toEqual({ ...DEFAULT_FILTERS, transports: ['return'], depAirports: ['HAM'], arrAirports: ['HAM'] });
  });

  it('Standard-Bundesland kommt als Chip in jede neue Suche', () => {
    expect(baseQuery(DEFAULT_SETTINGS)).toEqual({ chips: [], text: '' });
    expect(baseQuery(s).chips).toEqual([{ kind: 'state', value: 'BY', label: 'BY', long: 'Bayern' }]);
    const q = { chips: [{ kind: 'state' as const, value: 'NW', label: 'NW' }], text: '' };
    expect(withDefaultState(q, s)).toBe(q);
    expect(withDefaultState({ chips: [], text: 'kiel' }, s).chips[0]?.value).toBe('BY');
  });

  it('Startzustand: feste Belegung, Ansicht, Unterkategorien und Startbildschirm', () => {
    const st = startupState(
      { ...DEFAULT_STATE, view: 3, expand: true },
      { ...s, defaultPax: { adults: 2, juveniles: 0, children: 1, babies: 0 }, startView: 2, subcategories: 'off' },
    );
    expect(st.pax).toEqual({ adults: 2, juveniles: 0, children: 1, babies: 0 });
    expect(st.view).toBe(2);
    expect(st.expand).toBe(false);
    expect(st.tripQuery.chips.map((c) => c.value)).toEqual(['BY']);
    expect(startupState({ ...DEFAULT_STATE, view: 3 }, DEFAULT_SETTINGS).view).toBe(3);
    expect(startScreenFor({ ...DEFAULT_SETTINGS, startScreen: 'last' }, DEFAULT_STATE)).toBe('home');
    expect(startScreenFor({ ...DEFAULT_SETTINGS, startScreen: 'last' }, { ...DEFAULT_STATE, journeyId: 'X' })).toBe('compare');
    expect(startScreenFor({ ...DEFAULT_SETTINGS, startScreen: 'trips' }, DEFAULT_STATE)).toBe('trips');
  });

  it('Preisänderung als Euro oder Prozent, farbig erst ab der Schwelle', () => {
    expect(formatDelta(-120, 2400, 'euro')).toBe('−120 €');
    expect(formatDelta(-120, 2400, 'percent')).toBe('−5,0 %');
    expect(formatDelta(0, 2400, 'percent')).toBe('±0 %');
    expect(deltaTone(-20, 50)).toBe('flat');
    expect(deltaTone(-60, 50)).toBe('down');
    expect(deltaTone(5, 0)).toBe('up');
  });

  it('Favoriten sortieren: Abfahrt, Änderung (größte Senkung zuerst) oder zuletzt gemerkt', () => {
    const items = demoFavorites(true).map((fav) => ({ fav }));
    const priced = items.map((x, i) => ({
      fav: { ...x.fav, savedAt: `2026-11-1${i}T00:00:00Z`, last: i < 2 ? ({ at: '', status: 'ok', total: x.fav.saved.total + (i ? 40 : -90), perPerson: 0 } as const) : undefined },
    }));
    const today = '2026-11-16';
    const byChange = sortFavorites(priced, 'change', today).map((x) => x.fav.journeyId);
    expect(byChange.slice(0, 2)).toEqual(['PR07261128', 'BL07261122']);
    const bySaved = sortFavorites(priced, 'saved', today);
    // abgefahrene immer zuletzt, sonst neueste zuerst
    expect(bySaved.at(-1)!.fav.trip.startDate < today).toBe(true);
    expect(bySaved[0]!.fav.savedAt > bySaved[1]!.fav.savedAt).toBe(true);
  });

  it('„Zuletzt angesehen“ folgt der eingestellten Anzahl', () => {
    expect(homeLists(20, 0, 5, 5).recent).toBe(5);
    expect(homeLists(20, 0, 5, 0).recent).toBe(0);
  });
});

describe('Settings-Seite (Aufbau)', () => {
  const ctx: SettingsContext = {
    terminalScheme: 'dark',
    mouseForcedOff: false,
    cliVia: null,
    viaLabel: 'aida.de direkt',
    version: '0.3.0',
    cacheBytes: 0,
    recentCount: 0,
    favoritesCount: 0,
    configDir: '~/.config/findmyaida',
    cacheDir: '~/.cache/findmyaida',
    exportDir: '~/Downloads',
  };

  it('enthält alle Bereiche und jede Einstellung genau einmal', () => {
    const sections = settingsSections(DEFAULT_SETTINGS, ctx);
    expect(sections.map((s) => s.title)).toEqual(['Darstellung', 'Bedienung', 'Standardwerte', 'Favoriten', 'Zugriff', 'Daten', 'Info']);
    const ids = sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['theme', 'contrast', 'bigLogo', 'sayings', 'cents', 'mouse', 'hover', 'startScreen', 'recentCount', 'paxMode',
      'airports', 'transports', 'startView', 'subcategories', 'defaultState', 'checkFavorites', 'deltaMode', 'deltaThreshold',
      'hideDeparted', 'favoriteSort', 'access', 'firefoxPath', 'port', 'cache', 'recent', 'export', 'import', 'version', 'reset']) {
      expect(ids).toContain(id);
    }
  });

  it('Bedienelemente schreiben die passenden Felder', () => {
    const rows = settingsSections(DEFAULT_SETTINGS, ctx).flatMap((s) => s.rows);
    const ctl = (id: string) => rows.find((r) => r.id === id)!.control;
    const theme = ctl('theme');
    expect(theme.kind === 'choice' && theme.set('light')).toEqual({ theme: 'light' });
    const pax = ctl('paxMode');
    expect(pax.kind === 'choice' && pax.set('fixed')).toEqual({ defaultPax: { adults: 2, juveniles: 0, children: 0, babies: 0 } });
    const tr = ctl('transports');
    expect(tr.kind === 'choice' && tr.set('')).toEqual({ transports: [] });
    const th = ctl('deltaThreshold');
    expect(th.kind === 'stepper' && th.set(3)).toEqual({ deltaThreshold: 50 });
    // Ohne Maus ist „Infos beim Überfahren“ gesperrt
    const noMouse = settingsSections({ ...DEFAULT_SETTINGS, mouse: false }, ctx).flatMap((s) => s.rows);
    expect(noMouse.find((r) => r.id === 'hover')!.disabled).toBe(true);
  });
});

describe('Cache leeren', () => {
  it('löscht Cache-Dateien, aber nicht das Firefox-Profil im Unterordner', () => {
    const dir = tmp();
    const c = new Cache(dir);
    c.set('a', { x: 1 });
    c.set('b', { y: 2 });
    fs.mkdirSync(path.join(dir, 'browser'));
    fs.writeFileSync(path.join(dir, 'browser', 'prefs.js'), '//');
    expect(c.sizeBytes()).toBeGreaterThan(0);
    c.clear();
    expect(c.sizeBytes()).toBe(0);
    expect(c.get('a', 60_000)).toBeNull();
    expect(fs.existsSync(path.join(dir, 'browser', 'prefs.js'))).toBe(true);
  });
});
