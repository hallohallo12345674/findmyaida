import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AidaClient } from '../src/api/client.js';
import { filterPath, playerPath } from '../src/api/endpoints.js';
import { ApiError } from '../src/api/errors.js';
import type { AccessPath, Transport, TransportRequest, TransportResponse, TransportState } from '../src/api/transport.js';
import { findFirefox, type BrowserLookup } from '../src/bridge/browsers.js';
import { ChainTransport } from '../src/bridge/chain.js';
import { DirectTransport, USER_AGENT } from '../src/bridge/direct.js';
import { FixtureTransport } from '../src/bridge/transport.js';
import { Cache } from '../src/store/cache.js';
import { VERSION } from '../src/version.js';
import { FIXTURES } from './helpers.js';

// ------------------------------------------------------------------ Direkter Weg

interface Seen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

let server: http.Server | null = null;

afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

/** Nachgebildetes aida.de auf localhost; schreibt mit, was ankommt. */
async function fakeAida(answer: { status?: number; text?: string; delayMs?: number } = {}) {
  const seen: Seen[] = [];
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      setTimeout(() => {
        res.statusCode = answer.status ?? 200;
        res.end(answer.text ?? '{"ok":true}');
      }, answer.delayMs ?? 0);
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

describe('DirectTransport', () => {
  it('fragt mit eigenem Namen ab und reicht Status und Text durch', async () => {
    const aida = await fakeAida({ text: '{"cruise":[]}' });
    const res = await new DirectTransport({ origin: aida.origin }).request({ method: 'GET', path: filterPath() });
    expect(res).toEqual({ status: 200, text: '{"cruise":[]}' });
    expect(aida.seen).toHaveLength(1);
    expect(aida.seen[0]).toMatchObject({ method: 'GET', url: filterPath(), body: '' });
    expect(aida.seen[0]!.headers['user-agent']).toBe(USER_AGENT);
    expect(aida.seen[0]!.headers.accept).toBe('application/json');
    expect(aida.seen[0]!.headers['content-type']).toBeUndefined();
  });

  it('gibt sich nicht als Browser aus', () => {
    expect(USER_AGENT).toContain(`FindMyAIDA/${VERSION}`);
    expect(USER_AGENT).not.toMatch(/Mozilla|Chrome|Firefox|Safari/);
  });

  it('sendet bei POST den Inhalt als JSON', async () => {
    const aida = await fakeAida();
    await new DirectTransport({ origin: aida.origin }).request({ method: 'POST', path: playerPath('prices'), body: '{"a":1}' });
    expect(aida.seen[0]).toMatchObject({ method: 'POST', body: '{"a":1}' });
    expect(aida.seen[0]!.headers['content-type']).toBe('application/json');
  });

  it('lehnt nicht erlaubte Pfade ab, ohne etwas zu senden', async () => {
    const aida = await fakeAida();
    const direct = new DirectTransport({ origin: aida.origin });
    await expect(direct.request({ method: 'GET', path: '/meine-reisen/profil' })).rejects.toThrow(/nicht erlaubt/);
    await expect(direct.request({ method: 'POST', path: filterPath() })).rejects.toThrow(/nicht erlaubt/);
    expect(aida.seen).toHaveLength(0);
  });

  it('reicht eine Ablehnung durch, statt sie zu verbergen oder zu wiederholen', async () => {
    const aida = await fakeAida({ status: 403, text: '<html>waf@aida.de</html>' });
    const res = await new DirectTransport({ origin: aida.origin }).request({ method: 'GET', path: filterPath() });
    expect(res.status).toBe(403);
    expect(aida.seen).toHaveLength(1);
  });

  it('meldet Zeitüberschreitung und fehlende Verbindung als eigene Fehlerarten', async () => {
    const slow = await fakeAida({ delayMs: 400 });
    await expect(new DirectTransport({ origin: slow.origin, timeoutMs: 40 }).request({ method: 'GET', path: filterPath() })).rejects.toMatchObject({
      kind: 'timeout',
    });
    await expect(new DirectTransport({ origin: 'http://127.0.0.1:9' }).request({ method: 'GET', path: filterPath() })).rejects.toMatchObject({
      kind: 'unreachable',
    });
  });
});

// ------------------------------------------------------------------ Kette

type Answer = TransportResponse | Error;

/** Weg, der feste Antworten gibt und mitschreibt, wie oft er gefragt und ob er geschlossen wurde. */
function stub(kind: AccessPath, answer: Answer | (() => Answer), state: TransportState = 'connected') {
  const t = {
    kind,
    calls: 0,
    closed: false,
    async request(_req: TransportRequest): Promise<TransportResponse> {
      t.calls++;
      const a = typeof answer === 'function' ? answer() : answer;
      if (a instanceof Error) throw a;
      return a;
    },
    getState: () => state,
    onStateChange: () => () => undefined,
    async close() {
      t.closed = true;
    },
  };
  return t satisfies Transport;
}

const OK: TransportResponse = { status: 200, text: '{}' };
const BLOCKED: TransportResponse = { status: 403, text: '' };
const GET: TransportRequest = { method: 'GET', path: filterPath() };

describe('ChainTransport', () => {
  it('bleibt auf dem ersten Weg, solange er antwortet, und öffnet die übrigen nicht', async () => {
    const direct = stub('direct', OK);
    let opened = 0;
    const chain = await ChainTransport.start([() => direct, () => (opened++, stub('firefox', OK))]);
    expect(await chain.request(GET)).toEqual(OK);
    expect(await chain.request(GET)).toEqual(OK);
    expect(chain.kind).toBe('direct');
    expect(chain.getState()).toBe('connected');
    expect(opened).toBe(0);
  });

  it('wechselt bei Ablehnung auf den nächsten Weg und stellt die Anfrage dort einmal', async () => {
    const direct = stub('direct', BLOCKED);
    const firefox = stub('firefox', OK);
    const chain = await ChainTransport.start([() => direct, () => firefox]);
    expect(await chain.request(GET)).toEqual(OK);
    expect(direct.calls).toBe(1);
    expect(firefox.calls).toBe(1);
    expect(chain.kind).toBe('firefox');
    expect(direct.closed).toBe(true);
    // Der abgelehnte Weg wird für den Rest der Sitzung nicht mehr versucht.
    await chain.request(GET);
    expect(direct.calls).toBe(1);
    expect(firefox.calls).toBe(2);
  });

  it('erkennt auch die Sperrseite, die mit Status 200 kommt', async () => {
    const direct = stub('direct', { status: 200, text: '<!doctype html><p>Access Denied</p>' });
    const chain = await ChainTransport.start([() => direct, () => stub('firefox', OK)]);
    expect(await chain.request(GET)).toEqual(OK);
    expect(chain.kind).toBe('firefox');
  });

  it('geht durch alle drei Stufen und überspringt Wege, die sich nicht öffnen lassen', async () => {
    const bridge = stub('bridge', OK);
    const blockedTwice = await ChainTransport.start([() => stub('direct', BLOCKED), () => stub('firefox', BLOCKED), () => bridge]);
    expect(await blockedTwice.request(GET)).toEqual(OK);
    expect(blockedTwice.kind).toBe('bridge');

    const noFirefox = await ChainTransport.start([
      () => stub('direct', BLOCKED),
      () => {
        throw new ApiError('unreachable', 'Firefox ist nicht installiert');
      },
      () => stub('bridge', OK),
    ]);
    expect(await noFirefox.request(GET)).toEqual(OK);
    expect(noFirefox.kind).toBe('bridge');
  });

  it('gibt die Ablehnung weiter, wenn kein Weg mehr übrig ist', async () => {
    const chain = await ChainTransport.start([() => stub('direct', BLOCKED), () => stub('firefox', BLOCKED)]);
    expect(await chain.request(GET)).toEqual(BLOCKED);
    expect(chain.kind).toBe('firefox');
    await expect(new AidaClient(chain, new Cache(null), 0).getFilters()).rejects.toMatchObject({ kind: 'blocked' });
  });

  it('wechselt nicht bei Netzfehlern oder Zeitüberschreitung', async () => {
    let opened = 0;
    const next = () => (opened++, stub('firefox', OK));
    const offline = await ChainTransport.start([() => stub('direct', new ApiError('unreachable', 'kein Netz')), next]);
    await expect(offline.request(GET)).rejects.toMatchObject({ kind: 'unreachable' });
    const slow = await ChainTransport.start([() => stub('direct', new ApiError('timeout', 'zu langsam')), next]);
    await expect(slow.request(GET)).rejects.toMatchObject({ kind: 'timeout' });
    expect(opened).toBe(0);
    expect(offline.kind).toBe('direct');
  });

  it('meldet den Wechsel, damit die Oberfläche den neuen Weg anzeigt', async () => {
    const chain = await ChainTransport.start([() => stub('direct', BLOCKED), () => stub('firefox', OK)]);
    const seen: string[] = [];
    chain.onStateChange((s) => seen.push(`${s}:${chain.kind}`));
    await chain.request(GET);
    expect(seen).toEqual(['waiting:direct', 'connected:firefox']);
  });

  it('wechselt nur einmal, wenn zwei Anfragen gleichzeitig abgelehnt werden', async () => {
    let firefoxOpened = 0;
    let bridgeOpened = 0;
    const chain = await ChainTransport.start([
      () => stub('direct', BLOCKED),
      async () => {
        firefoxOpened++;
        await new Promise((r) => setTimeout(r, 20));
        return stub('firefox', OK);
      },
      () => (bridgeOpened++, stub('bridge', OK)),
    ]);
    expect(await Promise.all([chain.request(GET), chain.request(GET)])).toEqual([OK, OK]);
    expect(firefoxOpened).toBe(1);
    expect(bridgeOpened).toBe(0);
  });

  it('wechselt nicht noch einmal, wenn eine ältere Anfrage erst nach dem Wechsel abgelehnt wird', async () => {
    let bridgeOpened = 0;
    let n = 0;
    const direct = stub('direct', BLOCKED);
    // Die zweite Antwort des abgelehnten Wegs trifft erst ein, wenn schon auf Firefox gewechselt wurde.
    direct.request = async () => {
      if (n++ > 0) await new Promise((r) => setTimeout(r, 60));
      return BLOCKED;
    };
    const chain = await ChainTransport.start([() => direct, () => stub('firefox', OK), () => (bridgeOpened++, stub('bridge', OK))]);
    expect(await Promise.all([chain.request(GET), chain.request(GET)])).toEqual([OK, OK]);
    expect(chain.kind).toBe('firefox');
    expect(bridgeOpened).toBe(0);
  });

  it('startet mit dem ersten verfügbaren Weg und scheitert klar, wenn es keinen gibt', async () => {
    const fail = () => {
      throw new Error('geht nicht');
    };
    const chain = await ChainTransport.start([fail, () => stub('bridge', OK, 'waiting')]);
    expect(chain.kind).toBe('bridge');
    expect(chain.getState()).toBe('waiting');
    await expect(ChainTransport.start([fail, fail])).rejects.toMatchObject({ kind: 'unreachable' });
  });

  it('schließt den aktuellen Weg', async () => {
    const direct = stub('direct', OK);
    const chain = await ChainTransport.start([() => direct]);
    await chain.close();
    expect(direct.closed).toBe(true);
  });

  it('liefert dem Client nach dem Wechsel Daten, als wäre nichts gewesen', async () => {
    const chain = await ChainTransport.start([() => stub('direct', BLOCKED), () => new FixtureTransport(FIXTURES)]);
    const filters = await new AidaClient(chain, new Cache(null), 0).getFilters();
    expect(filters.cruise.length).toBeGreaterThan(0);
    expect(chain.kind).toBe('fixture');
  });
});

// ------------------------------------------------------------------ Browsersuche

function lookup(platform: NodeJS.Platform, files: string[], env: Record<string, string> = {}): BrowserLookup {
  return { platform, env, home: '/Users/test', exists: (f) => files.includes(f) };
}

describe('findFirefox', () => {
  const MAC = '/Applications/Firefox.app/Contents/MacOS/firefox';
  const MAC_HOME = '/Users/test/Applications/Firefox.app/Contents/MacOS/firefox';

  it('findet Firefox auf macOS systemweit und im Benutzerordner', () => {
    expect(findFirefox(lookup('darwin', [MAC, MAC_HOME]))).toBe(MAC);
    expect(findFirefox(lookup('darwin', [MAC_HOME]))).toBe(MAC_HOME);
    expect(findFirefox(lookup('darwin', []))).toBeNull();
  });

  it('sucht unter Linux im PATH, firefox vor firefox-esr', () => {
    const env = { PATH: '/usr/local/bin:/usr/bin' };
    expect(findFirefox(lookup('linux', ['/usr/bin/firefox-esr', '/usr/bin/firefox'], env))).toBe('/usr/bin/firefox');
    expect(findFirefox(lookup('linux', ['/usr/bin/firefox-esr'], env))).toBe('/usr/bin/firefox-esr');
    expect(findFirefox(lookup('linux', ['/opt/firefox'], env))).toBeNull();
  });

  it('sucht unter Windows in den Programmordnern', () => {
    const exe = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
    expect(findFirefox(lookup('win32', [exe], { ProgramFiles: 'C:\\Program Files' }))).toBe(exe);
  });

  it('nimmt einen ausdrücklich angegebenen Pfad und sucht nicht weiter, wenn er ins Leere zeigt', () => {
    expect(findFirefox(lookup('darwin', [MAC, '/opt/ff/firefox'], { FINDMYAIDA_FIREFOX: '/opt/ff/firefox' }))).toBe('/opt/ff/firefox');
    expect(findFirefox(lookup('darwin', [MAC], { FINDMYAIDA_FIREFOX: '/gibt/es/nicht' }))).toBeNull();
  });
});
