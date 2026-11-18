import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { Transport, TransportRequest, TransportResponse, TransportState } from '../api/transport.js';

/**
 * Liefert aufgezeichnete echte AIDA-Antworten aus tests/fixtures (Demo-Modus und Tests).
 */
export class FixtureTransport implements Transport {
  readonly kind = 'fixture' as const;
  private events = new EventEmitter();

  constructor(private readonly dir: string, private readonly delayMs = 0) {}

  getState(): TransportState {
    return 'demo';
  }

  onStateChange(cb: (s: TransportState) => void): () => void {
    this.events.on('state', cb);
    return () => this.events.off('state', cb);
  }

  async close(): Promise<void> {}

  async request(req: TransportRequest): Promise<TransportResponse> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const file = this.resolve(req);
    if (!file) return { status: 404, text: '{"error":"keine Demo-Daten"}' };
    const full = path.join(this.dir, file);
    if (!fs.existsSync(full)) return { status: 404, text: '{"error":"keine Demo-Daten"}' };
    return { status: 200, text: fs.readFileSync(full, 'utf8') };
  }

  private resolve(req: TransportRequest): string | null {
    const p = req.path;
    if (p.includes('search.filter.json')) return 'filter.json';
    if (p.includes('search.cruise.json')) {
      const page = /\/p=(\d+)\//.exec(p)?.[1];
      const region = /\/region=([A-Z]+)/.exec(p)?.[1];
      if (region) return page === '1' ? `catalog-region-${region}.json` : null;
      return page === '1' ? 'catalog-demo.json' : null;
    }
    if (p.includes('detail.cruise.json')) {
      const jid = /JourneyIdentifier=([A-Z0-9]+)/.exec(p)?.[1];
      return jid ? `detail-${jid}.json` : null;
    }
    if (p.includes('player.proxy.json') && req.body) {
      try {
        const body = JSON.parse(req.body) as {
          cruise: { journeyIdentifier: string[] };
          passengers: { age: number }[];
        };
        const jid = body.cruise.journeyIdentifier[0];
        const ages = body.passengers.map((x) => x.age);
        const count = (a: number) => ages.filter((x) => x === a).length;
        return `prices-${jid}-${count(40)}-${count(20)}-${count(10)}-${count(1)}.json`;
      } catch {
        return null;
      }
    }
    return null;
  }
}
