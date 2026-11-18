import React from 'react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { render } from 'ink';
import { AidaClient } from './api/client.js';
import { ApiError, describeError } from './api/errors.js';
import type { Transport } from './api/transport.js';
import { findFirefox } from './bridge/browsers.js';
import { ChainTransport, type TransportFactory } from './bridge/chain.js';
import { DirectTransport } from './bridge/direct.js';
import { FirefoxTransport } from './bridge/firefox.js';
import { BridgeTransport, DEFAULT_PORT } from './bridge/server.js';
import { FixtureTransport } from './bridge/transport.js';
import { applyFilters, DEFAULT_FILTERS, shortCabinName, sortOffers, transportLabel } from './domain/compare.js';
import { paxSummary, validatePax } from './domain/pax.js';
import { tariffInfo } from './domain/tariffs.js';
import type { Pax } from './domain/types.js';
import { Cache, defaultCacheDir } from './store/cache.js';
import { loadFavorites } from './store/favorites.js';
import { loadSettings } from './store/settings.js';
import { defaultConfigDir, legacyConfigDir, loadState } from './store/state.js';
import { MOUSE_OFF } from './ui/mouse/parse.js';
import { paint, paintChunk, PAINT_RESET, schemeFromColorFgBg, schemeFromOsc11 } from './ui/paint.js';
import { defaultExportDir, queryTerminalBackground } from './ui/system.js';
import { App } from './ui/App.js';
import { fit, fitRight, num } from './ui/format.js';
import { runInstaller } from './update.js';
import { VERSION } from './version.js';

// src/cli.tsx, dist/cli.js und im Release-Archiv app/findmyaida.mjs liegen eine Ebene unter dem Wurzelordner.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Im Projekt liegen die Beispieldaten unter tests/fixtures, im Release-Archiv unter fixtures.
const FIXTURES = [path.join(ROOT, 'tests', 'fixtures'), path.join(ROOT, 'fixtures')].find((d) => fs.existsSync(d)) ?? '';
// Der Installer legt die Erweiterung an einen festen Ort, damit Chrome sie nach Updates weiter findet.
const EXTENSION = process.env.FINDMYAIDA_EXTENSION_DIR || path.join(ROOT, 'extension');

const VIA = ['auto', 'direct', 'firefox', 'extension'] as const;
type Via = (typeof VIA)[number];

const HELP = `FindMyAIDA ${VERSION} – alle Buchungsoptionen einer AIDA-Reise im Terminal vergleichen

Aufruf:
  findmyaida                     interaktive Oberfläche, kurz: fma
  findmyaida --demo              Oberfläche mit aufgezeichneten Beispieldaten
  findmyaida prices <REISE-ID>   Preise einer Reise ausgeben, z. B. PR07261128
  findmyaida update              auf die neueste Version aktualisieren
  findmyaida uninstall           FindMyAIDA entfernen (Einstellungen und Favoriten bleiben)

Optionen:
  -a, --adults <n>     Erwachsene (Standard 2)      --juveniles <n>  Jugendliche (16–24 J.)
  -c, --children <n>   Kinder (2–15 J.)             --babies <n>     Babys (unter 2 J.)
      --json           Ausgabe als JSON (prices)    --all            alle Anreisearten (prices)
      --via <weg>      Zugriffsweg festlegen: direct, firefox oder extension (sonst aus den Einstellungen)
      --port <n>       Port der Browser-Brücke (sonst aus den Einstellungen, Standard ${DEFAULT_PORT})
      --no-cache       Cache nicht verwenden
      --no-mouse       Mausbedienung ausschalten (Text lässt sich dann normal markieren)
  -v, --version        Version ausgeben
  -h, --help           diese Hilfe

Zugriff auf aida.de (auto): zuerst direkt, ohne Browser. Lehnt aida.de das ab, startet FindMyAIDA
Firefox ohne Fenster. Geht auch das nicht, übernimmt Chrome mit der Erweiterung.

Einrichtung der Erweiterung (nur für den dritten Weg, einmalig):
  chrome://extensions → Entwicklermodus → „Entpackte Erweiterung laden“ → ${EXTENSION}
  Danach aida.de in Chrome geöffnet lassen.`;

/**
 * Öffnet den Zugriffsweg. „auto“ ist die Kette direkt → Firefox ohne Fenster → Chrome mit Erweiterung; die
 * späteren Wege werden erst geöffnet, wenn aida.de den vorherigen ablehnt.
 */
async function openTransport(via: Via, port: number, waitForExtension: boolean): Promise<Transport> {
  const firefox: TransportFactory = () => {
    const executable = findFirefox();
    if (!executable) throw new ApiError('unreachable', 'Firefox ist nicht installiert (oder FINDMYAIDA_FIREFOX zeigt ins Leere).');
    return FirefoxTransport.start({ executable, profileBase: path.join(defaultCacheDir(), 'browser') });
  };
  const extension: TransportFactory = async () => {
    const bridge = await BridgeTransport.start(port);
    // Ohne Oberfläche gibt es keinen Hinweis auf dem Bildschirm; deshalb hier warten.
    if (waitForExtension && via === 'auto') {
      process.stderr.write('Direkter Abruf und Firefox stehen nicht zur Verfügung. Warte auf Chrome mit der Erweiterung …\n');
      await bridge.waitForConnection(60_000);
    }
    return bridge;
  };
  if (via === 'direct') return new DirectTransport();
  if (via === 'firefox') return firefox();
  if (via === 'extension') return extension();
  return ChainTransport.start([() => new DirectTransport(), firefox, extension]);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      demo: { type: 'boolean' },
      json: { type: 'boolean' },
      all: { type: 'boolean' },
      adults: { type: 'string', short: 'a' },
      juveniles: { type: 'string' },
      children: { type: 'string', short: 'c' },
      babies: { type: 'string' },
      port: { type: 'string' },
      via: { type: 'string' },
      'no-cache': { type: 'boolean' },
      'no-mouse': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.version) {
    console.log(VERSION);
    return;
  }
  if (positionals[0] === 'update' || positionals[0] === 'uninstall') {
    process.exitCode = await runInstaller(positionals[0]);
    return;
  }
  const demo = !!values.demo;
  // Einstellungen der Settings-Seite; Schalter auf der Kommandozeile haben Vorrang.
  const settingsFile = path.join(defaultConfigDir(), 'settings.json');
  const loaded = loadSettings(settingsFile);
  const settings = loaded.settings;
  const port = values.port ? Number(values.port) : settings.port;
  if (settings.firefoxPath && !process.env.FINDMYAIDA_FIREFOX) process.env.FINDMYAIDA_FIREFOX = settings.firefoxPath;
  const cache = new Cache(values['no-cache'] ? null : defaultCacheDir());

  const [cmd, arg] = positionals;
  const via = (values.via ?? settings.access) as Via;
  if (!VIA.includes(via)) {
    console.error(`Unbekannter Zugriffsweg: ${values.via}. Möglich sind: ${VIA.join(', ')}.`);
    process.exitCode = 1;
    return;
  }

  let transport: Transport;
  if (demo) transport = new FixtureTransport(FIXTURES, 150);
  else {
    try {
      transport = await openTransport(via, port, cmd === 'prices');
    } catch (e) {
      console.error(describeError(e));
      process.exitCode = 1;
      return;
    }
  }
  const client = new AidaClient(transport, cache);

  if (cmd === 'prices') {
    // Über process.exit laufen die Aufräumschritte der Wege (ein gestarteter Firefox wird beendet).
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(sig, () => process.exit(130));
    await pricesCommand(client, transport, arg, values);
    await transport.close();
    return;
  }
  if (cmd) {
    console.error(`Unbekannter Befehl: ${cmd}\n\n${HELP}`);
    process.exitCode = 1;
    await transport.close();
    return;
  }

  const stateName = demo ? 'state-demo.json' : 'state.json';
  const stateFile = path.join(defaultConfigDir(), stateName);
  const initialState = loadState(stateFile, path.join(legacyConfigDir(), stateName));
  const favoritesFile = path.join(defaultConfigDir(), demo ? 'favorites-demo.json' : 'favorites.json');
  const fav = loadFavorites(favoritesFile);

  // Vollbild (alternativer Bildschirmpuffer) wie bei anderen TUIs
  const out = process.stdout;
  const fullscreen = out.isTTY;
  const mouse = fullscreen && !values['no-mouse'];
  const terminalScheme = schemeFromOsc11(await queryTerminalBackground()) ?? schemeFromColorFgBg(process.env.COLORFGBG);
  if (fullscreen) {
    out.write('\x1b[?1049h\x1b[?25l\x1b[H');
    // Hell/Dunkel unabhängig vom Terminal: Rücksprünge auf die Terminalfarben durch die Palette ersetzen.
    const write = out.write.bind(out) as (chunk: unknown, ...rest: unknown[]) => boolean;
    out.write = ((chunk: unknown, ...rest: unknown[]) =>
      write(typeof chunk === 'string' ? paintChunk(chunk, paint.fg, paint.bg) : chunk, ...rest)) as typeof out.write;
  }
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    paint.fg = null;
    paint.bg = null;
    if (mouse) out.write(MOUSE_OFF);
    if (fullscreen) out.write(`${PAINT_RESET}\x1b[?25h\x1b[?1049l`);
  };
  process.on('exit', restore);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      restore();
      process.exit(0);
    });
  }

  const app = render(
    <App
      client={client}
      initialState={initialState}
      stateFile={stateFile}
      favorites={{ initial: fav.favorites, file: favoritesFile, corrupt: fav.corrupt }}
      settings={{ initial: settings, file: settingsFile, corrupt: loaded.corrupt }}
      env={{
        terminalScheme,
        mouse,
        mouseForcedOff: !!values['no-mouse'],
        cliVia: values.via ?? null,
        configDir: defaultConfigDir(),
        cacheDir: defaultCacheDir(),
        exportDir: defaultExportDir(os.homedir()),
        home: os.homedir(),
      }}
      extensionDir={EXTENSION}
      demo={demo}
    />,
    { exitOnCtrlC: false },
  );
  await app.waitUntilExit();
  await transport.close();
  restore();
  process.exit(0);
}

function readPax(values: Record<string, unknown>): Pax {
  const n = (v: unknown, d: number) => (v === undefined ? d : Number(v));
  return {
    adults: n(values.adults, 2),
    juveniles: n(values.juveniles, 0),
    children: n(values.children, 0),
    babies: n(values.babies, 0),
  };
}

async function pricesCommand(
  client: AidaClient,
  transport: Transport,
  journeyId: string | undefined,
  values: Record<string, unknown>,
) {
  if (!journeyId) {
    console.error('Bitte eine Reise-ID angeben, z. B.: findmyaida prices PR07261128');
    process.exitCode = 1;
    return;
  }
  const pax = readPax(values);
  const err = validatePax(pax);
  if (err) {
    console.error(err);
    process.exitCode = 1;
    return;
  }
  if (transport instanceof BridgeTransport) {
    process.stderr.write('Warte auf Browser-Verbindung (aida.de in Chrome mit Erweiterung öffnen) …\n');
    if (!(await transport.waitForConnection(60_000))) {
      console.error('Keine Verbindung zur Chrome-Erweiterung innerhalb von 60 s.');
      process.exitCode = 1;
      return;
    }
  }
  try {
    const m = await client.getPrices(journeyId.toUpperCase(), pax, !!values['no-cache']);
    if (values.json) {
      console.log(JSON.stringify(m, null, 2));
      return;
    }
    const offers = values.all ? m.offers : applyFilters(m.offers, DEFAULT_FILTERS).offers;
    console.log(
      `${m.cruise?.routeName ?? journeyId} · ${m.cruise?.shipName ?? ''} · ${m.cruise?.startDate ?? ''} · ${paxSummary(pax)}`,
    );
    console.log(`${m.offers.length} Angebote (${offers.length} angezeigt), nicht verfügbar: ${m.unavailable}\n`);
    for (const o of sortOffers(offers, 'price', false)) {
      console.log(
        `${fit(tariffInfo(o.tariffCode).name, 16)} ${fit(`${shortCabinName(o.cabinName)} ${o.cabinCode}`, 26)} ` +
          `${fit(transportLabel(o), 18)} ${fitRight(num(o.total), 7)} €  ${fitRight(num(o.perPerson), 6)} € p.P.`,
      );
    }
  } catch (e) {
    console.error(describeError(e));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  process.stdout.write(MOUSE_OFF + '\x1b[?25h\x1b[?1049l');
  console.error(e);
  process.exit(1);
});
