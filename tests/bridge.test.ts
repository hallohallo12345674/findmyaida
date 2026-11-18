import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ALLOWLIST, catalogPath, detailPath, filterPath, isAllowed, playerPath } from '../src/api/endpoints.js';
import { BridgeTransport, DEFAULT_PORT } from '../src/bridge/server.js';
import { VERSION } from '../src/version.js';
import { FIXTURES, pax } from './helpers.js';

const PORT = 47931;
let bridge: BridgeTransport | null = null;
let client: WebSocket | null = null;

afterEach(async () => {
  client?.close();
  await bridge?.close();
  bridge = null;
  client = null;
});

function fakeExtension(origin: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

describe('BridgeTransport', () => {
  it('forwards allowed requests to the extension and returns the response', async () => {
    bridge = await BridgeTransport.start(PORT);
    expect(bridge.getState()).toBe('waiting');
    client = await fakeExtension('chrome-extension://abcdef');
    client.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'request') {
        client!.send(JSON.stringify({ type: 'response', id: msg.id, status: 200, text: `{"echo":"${msg.method}"}` }));
      }
    });
    expect(await bridge.waitForConnection(2000)).toBe(true);
    const res = await bridge.request({ method: 'POST', path: playerPath(), body: '{}' });
    expect(res).toEqual({ status: 200, text: '{"echo":"POST"}' });
  });

  it('rejects connections from web pages', async () => {
    bridge = await BridgeTransport.start(PORT);
    client = await fakeExtension('https://evil.example');
    const code = await new Promise<number>((r) => client!.on('close', (c) => r(c)));
    expect(code).toBe(1008);
    expect(bridge.getState()).toBe('waiting');
  });

  it('answers the extension liveness probe with a plain HTTP response', async () => {
    bridge = await BridgeTransport.start(PORT);
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    expect(res.status).toBe(426);
  });

  it('refuses paths outside the allowlist', async () => {
    bridge = await BridgeTransport.start(PORT);
    await expect(bridge.request({ method: 'GET', path: '/meine-reisen/profil' })).rejects.toThrow(/nicht erlaubt/);
  });
});

describe('allowlist', () => {
  it('allows exactly the endpoints the tool uses', () => {
    expect(isAllowed('GET', filterPath())).toBe(true);
    expect(isAllowed('GET', catalogPath({ page: 3, region: 'VRKA' }))).toBe(true);
    expect(isAllowed('GET', detailPath('PR07261128', pax(2)))).toBe(true);
    expect(isAllowed('POST', playerPath('prices'))).toBe(true);
    expect(isAllowed('GET', playerPath())).toBe(false);
    expect(isAllowed('POST', '/content/aida-search-and-booking/requests/booking.proxy.json?x')).toBe(false);
  });

  it('is identical in the Chrome extension', () => {
    const src = fs.readFileSync(path.join(FIXTURES, '..', '..', 'extension', 'background.js'), 'utf8');
    for (const a of ALLOWLIST) {
      expect(src).toContain(`{ method: '${a.method}', pattern: ${a.pattern.toString()} }`);
    }
  });
});

describe('extension parity', () => {
  const root = path.join(FIXTURES, '..', '..');
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

  it('connects to the port the app listens on', () => {
    expect(read('extension/background.js')).toContain(`const PORT = ${DEFAULT_PORT};`);
  });

  it('carries the same version as package.json and the app', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const manifest = JSON.parse(read('extension/manifest.json')) as { version: string };
    expect(manifest.version).toBe(pkg.version);
    expect(VERSION).toBe(pkg.version);
  });
});
