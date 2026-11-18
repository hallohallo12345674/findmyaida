import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';
import { AidaClient } from '../src/api/client.js';
import type { Transport } from '../src/api/transport.js';
import { FixtureTransport } from '../src/bridge/transport.js';
import type { Favorite } from '../src/domain/favorites.js';
import { DEFAULT_SETTINGS, type Settings } from '../src/store/settings.js';
import { Cache } from '../src/store/cache.js';
import { DEFAULT_STATE } from '../src/store/state.js';
import { App } from '../src/ui/App.js';
import type { Screen } from '../src/ui/shell.js';
import { FIXTURES } from './helpers.js';

/** Gemeinsame Helfer für Tests, die die ganze App über ink-testing-library bedienen. */

export const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
export const plain = (s: string | undefined) => (s ?? '').replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Lässt React die Effekte abarbeiten, die nach dem letzten Zeichnen noch ausstehen. Ink meldet Tasten-Handler erst
 * in einem solchen Effekt an. Eine Taste, die direkt nach dem neuen Bild kommt, träfe sonst noch den Handler des
 * vorigen Stands (oder den eines schon ersetzten Bildschirms). Ein Mensch tippt nie so schnell, ein Test schon.
 * React plant diese Effekte in Node per setImmediate; drei Runden decken auch Effekte ab, die neu zeichnen.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
}

/** Wartet, bis das Bild (ohne Farbcodes) die Bedingung erfüllt und die App für die nächste Eingabe bereit ist. */
export async function until(get: () => string | undefined, pred: (s: string) => boolean, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = plain(get());
    if (pred(f)) {
      await settle();
      return f;
    }
    await tick(30);
  }
  throw new Error(`Timeout. Letzter Frame:\n${plain(get())}`);
}

export interface SetupOptions {
  /** Favoriten beim Start (ohne Datei, nur im Speicher) */
  favorites?: Favorite[];
  /** zuletzt angesehene Reisen statt nur `journeyId` */
  recent?: string[];
  /** eigener Transport, z. B. um Anfragen zu zählen */
  transport?: Transport;
  /** abweichende Einstellungen */
  settings?: Partial<Settings>;
  /** Startbildschirm aus den Einstellungen statt `screen` */
  fromSettings?: boolean;
}

/** Rendert die App mit Demo-Daten, ohne Platten-Cache und mit eigener Zustandsdatei. */
export function setup(screen: Screen, journeyId?: string, opts: SetupOptions = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'findmyaida-test-'));
  const client = new AidaClient(opts.transport ?? new FixtureTransport(FIXTURES), new Cache(null), 0);
  const state = {
    ...DEFAULT_STATE,
    ...(journeyId ? { journeyId, recent: [journeyId] } : {}),
    ...(opts.recent ? { recent: opts.recent } : {}),
  };
  return render(
    <App
      client={client}
      initialState={state}
      {...(opts.fromSettings ? {} : { initialScreen: screen })}
      settings={{ initial: { ...DEFAULT_SETTINGS, ...opts.settings } }}
      stateFile={path.join(dir, 's.json')}
      favorites={{ initial: opts.favorites ?? [] }}
      extensionDir="/ext"
      demo
    />,
  );
}

export type TestApp = ReturnType<typeof setup>;

/** Position (Spalte, Zeile) eines Textes im aktuellen Bild. */
export function find(frame: string, text: string, nth = 0): { x: number; y: number } {
  const lines = frame.split('\n');
  let seen = 0;
  for (let y = 0; y < lines.length; y++) {
    let from = 0;
    for (;;) {
      const x = lines[y]!.indexOf(text, from);
      if (x < 0) break;
      if (seen++ === nth) return { x, y };
      from = x + 1;
    }
  }
  throw new Error(`„${text}“ nicht gefunden in:\n${frame}`);
}

// SGR-Mausfolgen, Koordinaten 0-basiert wie in find().
const click = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`;
const release = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}m`;
export const wheelDown = (x: number, y: number) => `\x1b[<65;${x + 1};${y + 1}M`;
export const hover = (x: number, y: number) => `\x1b[<35;${x + 1};${y + 1}M`;

export async function clickAt(app: TestApp, x: number, y: number) {
  app.stdin.write(click(x, y));
  await tick(20);
  app.stdin.write(release(x, y));
  await tick(80);
}

export async function type(app: TestApp, text: string) {
  for (const ch of text) {
    app.stdin.write(ch);
    await tick(15);
  }
  await tick(80);
}
