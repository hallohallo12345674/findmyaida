/**
 * Simuliertes Terminal für die TUI: rendert die App mit Demo-Daten, spielt Tasten und Mausgesten ab und liefert
 * das letzte Bild mit ANSI-Farben. Genutzt von scripts/snapshot.tsx (Text) und scripts/readme-assets.ts (SVG).
 */
import './force-color.js';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { render } from 'ink';
import { AidaClient } from '../../src/api/client.js';
import { FixtureTransport } from '../../src/bridge/transport.js';
import type { Favorite } from '../../src/domain/favorites.js';
import { Cache } from '../../src/store/cache.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/store/settings.js';
import { DEFAULT_STATE } from '../../src/store/state.js';
import { App } from '../../src/ui/App.js';
import type { Screen } from '../../src/ui/shell.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

class FakeStdout extends EventEmitter {
  isTTY = true;
  frame = '';
  constructor(
    public columns: number,
    public rows: number,
  ) {
    super();
  }
  write(s: string) {
    this.frame = s;
    return true;
  }
}

class FakeStdin extends EventEmitter {
  isTTY = true;
  private buf: string[] = [];
  setRawMode() {}
  setEncoding() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
  read() {
    return this.buf.shift() ?? null;
  }
  send(s: string) {
    this.buf.push(s);
    this.emit('readable');
    this.emit('data', s);
  }
}

const KEYS: Record<string, string> = {
  '<right>': '\u001b[C',
  '<left>': '\u001b[D',
  '<up>': '\u001b[A',
  '<down>': '\u001b[B',
  '<enter>': '\r',
  '<esc>': '\u001b',
  '<tab>': '\t',
  '<ctrl-t>': '\x14',
  '<bs>': '\x7f',
};

export interface FrameOptions {
  screen?: Screen;
  cols?: number;
  rows?: number;
  journeyId?: string;
  favorites?: Favorite[];
  settings?: Partial<Settings>;
  /** Tasten wie „<down>“, Text, oder Mausgesten „<click:x,y>“, „<dblclick:x,y>“, „<wheel:down,x,y>“, „<hover:x,y>“ */
  keys?: string[];
  /** Wartezeit vor den Eingaben (Katalog, Preise und Favoriten aus den Fixtures laden) */
  settleMs?: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sgr = (b: number, x: number, y: number, up = false) => `\x1b[<${b};${x + 1};${y + 1}${up ? 'm' : 'M'}`;

/** Rendert die App und gibt das letzte Bild mit ANSI-Farben zurück. */
export async function renderFrame(o: FrameOptions = {}): Promise<string> {
  const stdout = new FakeStdout(o.cols ?? 120, o.rows ?? 34);
  const stdin = new FakeStdin();
  const client = new AidaClient(new FixtureTransport(path.join(ROOT, 'tests', 'fixtures')), new Cache(null), 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aida-snap-'));
  const app = render(
    <App
      client={client}
      initialScreen={o.screen ?? 'compare'}
      initialState={{ ...DEFAULT_STATE, journeyId: o.journeyId ?? 'PR07261128', recent: ['PR07261128', 'BL07261122'] }}
      stateFile={path.join(dir, 's.json')}
      favorites={{ initial: o.favorites ?? [] }}
      settings={{ initial: { ...DEFAULT_SETTINGS, ...o.settings } }}
      extensionDir={path.join(ROOT, 'extension')}
      demo
    />,
    { stdout: stdout as never, stdin: stdin as never, debug: true, exitOnCtrlC: false, patchConsole: false },
  );
  await wait(o.settleMs ?? 400);
  for (const k of o.keys ?? []) {
    const m = /^<(click|dblclick|wheel|hover):(?:(up|down),)?(\d+),(\d+)>$/.exec(k);
    if (m) {
      const x = Number(m[3]);
      const y = Number(m[4]);
      if (m[1] === 'wheel') stdin.send(sgr(m[2] === 'up' ? 64 : 65, x, y));
      else if (m[1] === 'hover') stdin.send(sgr(35, x, y));
      else {
        for (let i = 0; i < (m[1] === 'dblclick' ? 2 : 1); i++) {
          stdin.send(sgr(0, x, y));
          await wait(20);
          stdin.send(sgr(0, x, y, true));
          await wait(40);
        }
      }
    } else stdin.send(KEYS[k] ?? k);
    await wait(150);
  }
  await wait(200);
  const frame = stdout.frame;
  app.unmount();
  return frame;
}
