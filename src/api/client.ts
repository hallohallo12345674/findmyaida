import type { z } from 'zod';
import { RequestQueue } from '../net/queue.js';
import type { Cache } from '../store/cache.js';
import { paxKey } from '../domain/pax.js';
import type { Catalog, Pax, PriceMatrix } from '../domain/types.js';
import { normalizeCatalog } from './catalog.js';
import { catalogPath, filterPath, playerPath } from './endpoints.js';
import { ApiError } from './errors.js';
import { buildPriceRequest, normalizePrices } from './prices.js';
import { CatalogResponse, FilterResponse, PlayerResponse } from './schemas.js';
import { isBlockedResponse, type Transport } from './transport.js';

export const TTL = {
  catalog: 6 * 60 * 60 * 1000,
  filters: 24 * 60 * 60 * 1000,
  prices: 15 * 60 * 1000,
};

const MAX_CATALOG_PAGES = 40;

export class AidaClient {
  private queue: RequestQueue;
  private inflight = new Map<string, Promise<unknown>>();

  constructor(
    readonly transport: Transport,
    private readonly cache: Cache,
    minIntervalMs = 300,
  ) {
    this.queue = new RequestQueue(minIntervalMs);
  }

  /** Belegter Platz des Caches in Bytes (für die Einstellungen). */
  cacheBytes(): number {
    return this.cache.sizeBytes();
  }

  /** Leert den Cache; die nächsten Abfragen gehen wieder an aida.de. */
  clearCache(): void {
    this.cache.clear();
  }

  private async fetchJson<S extends z.ZodTypeAny>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const res = await this.queue.run(() =>
      this.transport.request({ method, path, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    );
    const text = res.text ?? '';
    const looksHtml = /^\s*</.test(text);
    if (isBlockedResponse({ status: res.status, text })) {
      throw new ApiError('blocked', 'Anfrage von aida.de blockiert', res.status);
    }
    if (res.status === 404 && this.transport.kind === 'fixture') {
      throw new ApiError('nodata', 'Für diese Auswahl gibt es im Demo-Modus keine Daten.', 404);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ApiError('http', `aida.de antwortete mit Status ${res.status}`, res.status);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(looksHtml ? 'blocked' : 'parse', 'Antwort von aida.de ist kein JSON', res.status);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError('parse', `Unerwartetes Antwortformat (${parsed.error.issues[0]?.path.join('.') ?? '?'})`);
    }
    return parsed.data;
  }

  private once<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const cur = this.inflight.get(key) as Promise<T> | undefined;
    if (cur) return cur;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  async getFilters(force = false): Promise<FilterResponse> {
    const key = 'filters';
    if (!force) {
      const hit = this.cache.get<FilterResponse>(key, TTL.filters);
      if (hit) return hit.data;
    }
    return this.once(key, async () => {
      const data = await this.fetchJson('GET', filterPath(), FilterResponse);
      this.cache.set(key, data);
      return data;
    });
  }

  /** Lädt den gesamten Katalog (alle Seiten à 100 Routen). */
  async getCatalog(opts: { force?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<Catalog> {
    const key = `catalog-${this.transport.kind}`;
    if (!opts.force) {
      const hit = this.cache.get<Catalog>(key, TTL.catalog);
      if (hit) return hit.data;
    }
    return this.once(key, async () => {
      const first = await this.fetchJson('GET', catalogPath({ page: 1 }), CatalogResponse);
      const pages = [first];
      const total = Math.min(first.totalPages || 1, MAX_CATALOG_PAGES);
      opts.onProgress?.(1, total);
      for (let p = 2; p <= total; p++) {
        pages.push(await this.fetchJson('GET', catalogPath({ page: p }), CatalogResponse));
        opts.onProgress?.(p, total);
      }
      const catalog = normalizeCatalog(pages);
      this.cache.set(key, catalog);
      return catalog;
    });
  }

  peekPrices(journeyId: string, pax: Pax): PriceMatrix | null {
    return this.cache.get<PriceMatrix>(this.priceKey(journeyId, pax), TTL.prices)?.data ?? null;
  }

  /** Alle Reisen (JourneyIdentifier) einer Region, z. B. VRKA = Kanaren. */
  async getRegionJourneyIds(code: string, force = false): Promise<string[]> {
    const key = `region-${this.transport.kind}-${code}`;
    if (!force) {
      const hit = this.cache.get<string[]>(key, TTL.catalog);
      if (hit) return hit.data;
    }
    return this.once(key, async () => {
      const ids = new Set<string>();
      let total = 1;
      for (let p = 1; p <= Math.min(total, MAX_CATALOG_PAGES); p++) {
        const page = await this.fetchJson('GET', catalogPath({ page: p, region: code }), CatalogResponse);
        total = page.totalPages || 1;
        for (const item of page.cruiseItems) for (const v of item.cruiseItemVariant) ids.add(v.journeyIdentifier);
      }
      const list = [...ids];
      this.cache.set(key, list);
      return list;
    });
  }

  async getPrices(journeyId: string, pax: Pax, force = false): Promise<PriceMatrix> {
    const key = this.priceKey(journeyId, pax);
    if (!force) {
      const hit = this.cache.get<PriceMatrix>(key, TTL.prices);
      if (hit) return hit.data;
    }
    return this.once(key, async () => {
      const raw = await this.fetchJson('POST', playerPath('prices'), PlayerResponse, buildPriceRequest(journeyId, pax));
      const matrix = normalizePrices(raw, journeyId, pax);
      this.cache.set(key, matrix);
      return matrix;
    });
  }

  private priceKey(journeyId: string, pax: Pax): string {
    return `prices-${this.transport.kind}-${journeyId}-${paxKey(pax)}`;
  }
}
