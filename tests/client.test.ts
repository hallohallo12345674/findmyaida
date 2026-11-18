import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AidaClient } from '../src/api/client.js';
import { ApiError, describeError } from '../src/api/errors.js';
import type { Transport, TransportRequest, TransportResponse } from '../src/api/transport.js';
import { RequestQueue } from '../src/net/queue.js';
import { Cache } from '../src/store/cache.js';
import { FIXTURES, pax } from './helpers.js';

describe('RequestQueue', () => {
  afterEach(() => vi.useRealTimers());

  it('führt Anfragen nacheinander in der Reihenfolge des Aufrufs aus', async () => {
    const queue = new RequestQueue(0);
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`${name}:ende`);
      return name;
    };
    const results = await Promise.all([queue.run(task('a', 30)), queue.run(task('b', 1)), queue.run(task('c', 1))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a:start', 'a:ende', 'b:start', 'b:ende', 'c:start', 'c:ende']);
  });

  it('hält den Mindestabstand zwischen Ende und nächstem Start ein', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const queue = new RequestQueue(300);
    const starts: number[] = [];
    const task = async () => {
      starts.push(Date.now());
    };
    const all = Promise.all([queue.run(task), queue.run(task), queue.run(task)]);
    await vi.advanceTimersByTimeAsync(299);
    expect(starts).toEqual([10_000]);
    await vi.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([10_000, 10_300]);
    await vi.advanceTimersByTimeAsync(300);
    await all;
    expect(starts).toEqual([10_000, 10_300, 10_600]);
  });

  it('läuft nach einer fehlgeschlagenen Anfrage weiter', async () => {
    const queue = new RequestQueue(0);
    const failed = queue.run(async () => {
      throw new Error('kaputt');
    });
    const next = queue.run(async () => 'ok');
    await expect(failed).rejects.toThrow('kaputt');
    await expect(next).resolves.toBe('ok');
  });
});

/** Transport, der jede Anfrage mit der gegebenen Antwort bedient und die Anfragen mitschreibt. */
function stubTransport(
  respond: (req: TransportRequest) => TransportResponse | Promise<TransportResponse>,
  kind: Transport['kind'] = 'bridge',
): Transport & { calls: TransportRequest[] } {
  const calls: TransportRequest[] = [];
  return {
    kind,
    calls,
    request: async (req) => {
      calls.push(req);
      return respond(req);
    },
    getState: () => 'connected',
    onStateChange: () => () => undefined,
    close: async () => undefined,
  };
}

const clientFor = (transport: Transport) => new AidaClient(transport, new Cache(null), 0);

describe('AidaClient – Fehler', () => {
  it('meldet 403 und Bot-Schutz-Seiten als blockiert', async () => {
    await expect(clientFor(stubTransport(() => ({ status: 403, text: '' }))).getFilters()).rejects.toMatchObject({
      kind: 'blocked',
      status: 403,
    });
    const page = '<html><body>Access Denied – waf@aida.de</body></html>';
    await expect(clientFor(stubTransport(() => ({ status: 200, text: page }))).getFilters()).rejects.toMatchObject({
      kind: 'blocked',
    });
    // HTML statt JSON ist auch ohne erkennbaren Hinweistext eine Sperrseite.
    await expect(
      clientFor(stubTransport(() => ({ status: 200, text: '<html>Wartung</html>' }))).getFilters(),
    ).rejects.toMatchObject({ kind: 'blocked' });
  });

  it('meldet andere Statuscodes als HTTP-Fehler mit Status', async () => {
    const err = await clientFor(stubTransport(() => ({ status: 500, text: '{}' })))
      .getFilters()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: 'http', status: 500 });
  });

  it('meldet kaputtes JSON und unerwartete Formate als parse, mit dem betroffenen Feld', async () => {
    await expect(clientFor(stubTransport(() => ({ status: 200, text: '{"cruise":' }))).getFilters()).rejects.toMatchObject({
      kind: 'parse',
    });
    const err = await clientFor(stubTransport(() => ({ status: 200, text: '{"cruise":"keine Liste"}' })))
      .getFilters()
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'parse' });
    expect((err as ApiError).message).toContain('cruise');
  });

  it('unterscheidet fehlende Demo-Daten von einem echten 404', async () => {
    const notFound = () => ({ status: 404, text: '{"error":"keine Demo-Daten"}' });
    await expect(clientFor(stubTransport(notFound, 'fixture')).getFilters()).rejects.toMatchObject({ kind: 'nodata' });
    await expect(clientFor(stubTransport(notFound, 'bridge')).getFilters()).rejects.toMatchObject({ kind: 'http', status: 404 });
  });

  it('beschreibt Fehler für Nutzer auf Deutsch', () => {
    expect(describeError(new ApiError('offline', 'x'))).toContain('Erweiterung');
    expect(describeError(new ApiError('blocked', 'x'))).toContain('Bot-Schutz');
    expect(describeError(new ApiError('http', 'aida.de antwortete mit Status 500', 500))).toBe('aida.de antwortete mit Status 500');
    expect(describeError(new Error('irgendwas'))).toBe('irgendwas');
    expect(describeError('text')).toBe('text');
  });
});

describe('AidaClient – Cache und gleichzeitige Anfragen', () => {
  it('stellt gleiche Anfragen, die gleichzeitig laufen, nur einmal', async () => {
    const transport = stubTransport(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { status: 200, text: '{}' };
    });
    const client = clientFor(transport);
    const [a, b] = await Promise.all([client.getFilters(), client.getFilters()]);
    expect(transport.calls).toHaveLength(1);
    expect(a).toBe(b);
  });

  it('bedient Wiederholungen aus dem Cache, außer bei erzwungenem Neuladen', async () => {
    const transport = stubTransport(() => ({ status: 200, text: '{}' }));
    const client = clientFor(transport);
    await client.getFilters();
    await client.getFilters();
    expect(transport.calls).toHaveLength(1);
    await client.getFilters(true);
    expect(transport.calls).toHaveLength(2);
  });

  it('merkt sich Fehler nicht: der nächste Aufruf fragt erneut', async () => {
    let status = 500;
    const transport = stubTransport(() => ({ status, text: '{}' }));
    const client = clientFor(transport);
    await expect(client.getFilters()).rejects.toMatchObject({ kind: 'http' });
    status = 200;
    await expect(client.getFilters()).resolves.toMatchObject({ cruise: [] });
    expect(transport.calls).toHaveLength(2);
  });

  it('trennt Preise im Cache nach Transportart und Belegung', async () => {
    const cache = new Cache(null);
    const prices = fs.readFileSync(path.join(FIXTURES, 'prices-PR07261128-2-0-0-0.json'), 'utf8');
    const live = new AidaClient(stubTransport(() => ({ status: 200, text: prices })), cache, 0);
    const matrix = await live.getPrices('PR07261128', pax(2));
    expect(live.peekPrices('PR07261128', pax(2))).toBe(matrix);
    expect(live.peekPrices('PR07261128', pax(1))).toBeNull();
    // Demo-Daten und Live-Daten teilen sich nie einen Eintrag.
    const demo = new AidaClient(stubTransport(() => ({ status: 200, text: prices }), 'fixture'), cache, 0);
    expect(demo.peekPrices('PR07261128', pax(2))).toBeNull();
  });
});
