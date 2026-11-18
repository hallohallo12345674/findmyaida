import { EventEmitter } from 'node:events';
import { ApiError } from '../api/errors.js';
import { isBlockedResponse, type AccessPath, type Transport, type TransportRequest, type TransportResponse, type TransportState } from '../api/transport.js';

/** Öffnet einen Zugriffsweg. Wirft, wenn er nicht zur Verfügung steht (z. B. kein Firefox installiert). */
export type TransportFactory = () => Promise<Transport> | Transport;

async function openNext(rest: TransportFactory[]): Promise<Transport | null> {
  while (rest.length) {
    const factory = rest.shift()!;
    try {
      return await factory();
    } catch {
      // Dieser Weg steht nicht zur Verfügung; der nächste wird versucht.
    }
  }
  return null;
}

/**
 * Reiht Zugriffswege hintereinander. Lehnt aida.de den aktuellen Weg ab, wechselt die Kette für den Rest der
 * Sitzung auf den nächsten und stellt die Anfrage dort einmal.
 *
 * Gewechselt wird nur bei einer Ablehnung (isBlockedResponse). Netzfehler und Zeitüberschreitungen lösen keinen
 * Wechsel aus, weil der nächste Weg daran nichts ändert. Ein abgelehnter Weg wird nicht erneut versucht.
 */
export class ChainTransport implements Transport {
  private readonly events = new EventEmitter();
  private unsubscribe: () => void = () => undefined;
  private switching: Promise<boolean> | null = null;

  private constructor(
    private current: Transport,
    private readonly rest: TransportFactory[],
  ) {
    this.follow(current);
  }

  /** Öffnet den ersten Weg, der zur Verfügung steht. Die übrigen werden erst bei Bedarf geöffnet. */
  static async start(factories: TransportFactory[]): Promise<ChainTransport> {
    const rest = [...factories];
    const first = await openNext(rest);
    if (!first) throw new ApiError('unreachable', 'Kein Zugriffsweg zu aida.de verfügbar.');
    return new ChainTransport(first, rest);
  }

  get kind(): AccessPath {
    return this.current.kind;
  }

  getState(): TransportState {
    return this.switching ? 'waiting' : this.current.getState();
  }

  /** Meldet auch jeden Wechsel des Wegs, selbst wenn der Zustand derselbe bleibt. */
  onStateChange(cb: (s: TransportState) => void): () => void {
    this.events.on('state', cb);
    return () => this.events.off('state', cb);
  }

  async request(req: TransportRequest): Promise<TransportResponse> {
    for (;;) {
      const used = this.current;
      const res = await used.request(req);
      if (!isBlockedResponse(res)) return res;
      // Zwei Anfragen können gleichzeitig abgelehnt werden; gewechselt wird nur einmal.
      if (this.current === used && !(await this.advance())) return res;
    }
  }

  async close(): Promise<void> {
    this.unsubscribe();
    await this.current.close();
  }

  private follow(t: Transport): void {
    this.unsubscribe = t.onStateChange((s) => {
      if (!this.switching) this.events.emit('state', s);
    });
  }

  private advance(): Promise<boolean> {
    this.switching ??= (async () => {
      this.events.emit('state', 'waiting');
      const previous = this.current;
      const next = await openNext(this.rest);
      if (!next) return false;
      this.unsubscribe();
      await previous.close().catch(() => undefined);
      this.current = next;
      this.follow(next);
      return true;
    })().finally(() => {
      this.switching = null;
      this.events.emit('state', this.getState());
    });
    return this.switching;
  }
}
