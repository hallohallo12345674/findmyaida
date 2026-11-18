import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { filterPath, playerPath } from '../src/api/endpoints.js';
import { FirefoxTransport, type Launcher } from '../src/bridge/firefox.js';

interface Command {
  method: string;
  params: { expression?: string; url?: string; context?: string; wait?: string; target?: { context: string }; awaitPromise?: boolean };
}

type Evaluate = (expression: string) => { value: string } | 'exception' | 'silent';

let servers: WebSocketServer[] = [];
let transports: FirefoxTransport[] = [];

afterEach(async () => {
  for (const t of transports) await t.close().catch(() => undefined);
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
  servers = [];
  transports = [];
});

const profileBase = () => fs.mkdtempSync(path.join(os.tmpdir(), 'findmyaida-ff-'));

/** Nachgebildeter Firefox: spricht gerade so viel WebDriver BiDi, wie FirefoxTransport braucht. */
async function fakeFirefox(evaluate: Evaluate = () => ({ value: JSON.stringify({ status: 200, text: '{}' }) })) {
  const commands: Command[] = [];
  const state = { killed: 0, launchedWith: null as { executable: string; profileDir: string } | null, socket: null as WebSocket | null, path: '' };
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  servers.push(wss);
  await new Promise<void>((r) => wss.once('listening', () => r()));
  wss.on('connection', (ws, req) => {
    state.socket = ws;
    state.path = req.url ?? '';
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as Command & { id: number };
      commands.push({ method: msg.method, params: msg.params });
      const ok = (result: unknown) => ws.send(JSON.stringify({ type: 'success', id: msg.id, result }));
      if (msg.method === 'session.new') ok({ sessionId: 's1', capabilities: {} });
      else if (msg.method === 'browsingContext.getTree') ok({ contexts: [{ context: 'ctx-1', url: 'about:blank', children: [] }] });
      else if (msg.method === 'browsingContext.navigate') ok({ navigation: 'n1', url: msg.params.url });
      else if (msg.method === 'script.evaluate') {
        const r = evaluate(msg.params.expression ?? '');
        if (r === 'silent') return;
        ok(r === 'exception' ? { type: 'exception', exceptionDetails: { text: 'NetworkError' } } : { type: 'success', result: { type: 'string', value: r.value } });
      } else if (msg.method === 'browser.close') {
        ok({});
        ws.close();
      } else ws.send(JSON.stringify({ type: 'error', id: msg.id, error: 'unknown command', message: msg.method }));
    });
  });
  const launch: Launcher = async (executable, profileDir) => {
    state.launchedWith = { executable, profileDir };
    return { endpoint: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`, pid: 4242, kill: () => void state.killed++ };
  };
  return { launch, commands, state };
}

async function start(fake: Awaited<ReturnType<typeof fakeFirefox>>, base = profileBase(), timeoutMs?: number) {
  const t = await FirefoxTransport.start({ executable: '/fake/firefox', profileBase: base, launch: fake.launch, ...(timeoutMs ? { timeoutMs } : {}) });
  transports.push(t);
  return t;
}

describe('FirefoxTransport', () => {
  it('startet mit eigenem Wegwerf-Profil und lädt die aida.de-Seite', async () => {
    const fake = await fakeFirefox();
    const base = profileBase();
    const t = await start(fake, base);
    expect(t.kind).toBe('firefox');
    expect(t.getState()).toBe('connected');
    expect(fake.state.launchedWith!.executable).toBe('/fake/firefox');
    expect(path.dirname(fake.state.launchedWith!.profileDir)).toBe(base);
    expect(fake.state.path).toBe('/session');
    expect(fake.commands.map((c) => c.method)).toEqual(['session.new', 'browsingContext.getTree', 'browsingContext.navigate']);
    expect(fake.commands[2]!.params).toMatchObject({ context: 'ctx-1', url: 'https://aida.de/finden', wait: 'complete' });
  });

  it('führt die Anfrage in der Seite aus, same-origin und ohne Cookies wie die Erweiterung', async () => {
    const fake = await fakeFirefox(() => ({ value: JSON.stringify({ status: 200, text: '{"cruise":[]}' }) }));
    const t = await start(fake);
    expect(await t.request({ method: 'GET', path: filterPath() })).toEqual({ status: 200, text: '{"cruise":[]}' });
    const call = fake.commands.at(-1)!;
    expect(call.method).toBe('script.evaluate');
    expect(call.params).toMatchObject({ target: { context: 'ctx-1' }, awaitPromise: true });
    expect(call.params.expression).toContain(JSON.stringify(filterPath()));
    expect(call.params.expression).toContain("credentials: 'omit'");
    // Nichts in der Seite wird verändert, um die Fernsteuerung zu verbergen.
    expect(call.params.expression).not.toMatch(/webdriver|userAgent|navigator/);
  });

  it('gibt bei POST den Inhalt mit und reicht eine Ablehnung unverändert durch', async () => {
    const fake = await fakeFirefox(() => ({ value: JSON.stringify({ status: 403, text: '<html>waf@aida.de</html>' }) }));
    const t = await start(fake);
    const res = await t.request({ method: 'POST', path: playerPath('prices'), body: '{"a":1}' });
    expect(res.status).toBe(403);
    expect(fake.commands.at(-1)!.params.expression).toContain(JSON.stringify('{"a":1}'));
  });

  it('lehnt nicht erlaubte Pfade ab, bevor der Browser etwas sieht', async () => {
    const fake = await fakeFirefox();
    const t = await start(fake);
    await expect(t.request({ method: 'GET', path: '/meine-reisen/profil' })).rejects.toThrow(/nicht erlaubt/);
    expect(fake.commands.some((c) => c.method === 'script.evaluate')).toBe(false);
  });

  it('meldet einen gescheiterten Abruf in der Seite und eine Zeitüberschreitung als eigene Fehlerarten', async () => {
    const failing = await start(await fakeFirefox(() => 'exception'));
    await expect(failing.request({ method: 'GET', path: filterPath() })).rejects.toMatchObject({ kind: 'unreachable' });
    const silent = await start(await fakeFirefox(() => 'silent'), profileBase(), 40);
    await expect(silent.request({ method: 'GET', path: filterPath() })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('meldet einen unerwartet beendeten Browser, statt zu hängen', async () => {
    const fake = await fakeFirefox();
    const t = await start(fake);
    fake.state.socket!.close();
    await new Promise((r) => setTimeout(r, 50));
    await expect(t.request({ method: 'GET', path: filterPath() })).rejects.toMatchObject({ kind: 'unreachable' });
  });

  it('beendet beim Schließen den Browser und entfernt das Profil', async () => {
    const fake = await fakeFirefox();
    const base = profileBase();
    const listeners = process.listenerCount('exit');
    const t = await start(fake, base);
    expect(fs.readdirSync(base)).toHaveLength(1);
    expect(process.listenerCount('exit')).toBe(listeners + 1);
    await t.close();
    expect(fake.commands.at(-1)!.method).toBe('browser.close');
    expect(fake.state.killed).toBe(1);
    expect(fs.readdirSync(base)).toEqual([]);
    expect(process.listenerCount('exit')).toBe(listeners);
  });

  it('räumt auf und meldet es klar, wenn der Browser nicht startet', async () => {
    const base = profileBase();
    const launch: Launcher = async () => {
      throw new Error('Firefox hat sich beendet (Code 1)');
    };
    await expect(FirefoxTransport.start({ executable: '/fake/firefox', profileBase: base, launch })).rejects.toMatchObject({
      kind: 'unreachable',
      message: expect.stringContaining('Firefox ließ sich nicht'),
    });
    expect(fs.readdirSync(base)).toEqual([]);
  });

  it('entfernt verwaiste Profile früherer Läufe, lässt aber die einer laufenden Instanz stehen', async () => {
    const base = profileBase();
    const orphan = path.join(base, 'ff-verwaist');
    const running = path.join(base, 'ff-laeuft');
    const foreign = path.join(base, 'anderes');
    for (const d of [orphan, running, foreign]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(orphan, 'findmyaida.pid'), '999999 0');
    fs.writeFileSync(path.join(running, 'findmyaida.pid'), `${process.pid} 0`);
    await start(await fakeFirefox(), base);
    const left = fs.readdirSync(base);
    expect(left).not.toContain('ff-verwaist');
    expect(left).toContain('ff-laeuft');
    expect(left).toContain('anderes');
  });
});
