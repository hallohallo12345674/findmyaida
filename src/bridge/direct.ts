import { isAllowed } from '../api/endpoints.js';
import { ApiError } from '../api/errors.js';
import { REQUEST_TIMEOUT_MS, type Transport, type TransportRequest, type TransportResponse, type TransportState } from '../api/transport.js';
import { AIDA_ORIGIN } from '../domain/links.js';
import { VERSION } from '../version.js';

/** Nennt das Werkzeug beim Namen. Wird nicht an einen Browser angeglichen. */
export const USER_AGENT = `FindMyAIDA/${VERSION} (privates Werkzeug, persoenlicher Gebrauch)`;

export interface DirectOptions {
  origin?: string;
  timeoutMs?: number;
}

/**
 * Fragt aida.de direkt aus Node ab, ohne Browser. Gesetzt werden nur Accept, bei POST Content-Type und der eigene
 * User-Agent; alles Übrige sind die Standard-Kopfzeilen von fetch.
 *
 * Die Kopfzeilen werden bewusst nicht darauf abgestimmt, eine Ablehnung zu vermeiden. Lehnt aida.de ab, wechselt
 * ChainTransport auf den nächsten Weg.
 */
export class DirectTransport implements Transport {
  readonly kind = 'direct' as const;
  private readonly origin: string;
  private readonly timeoutMs: number;

  constructor(opts: DirectOptions = {}) {
    this.origin = opts.origin ?? AIDA_ORIGIN;
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  getState(): TransportState {
    return 'connected';
  }

  onStateChange(): () => void {
    return () => undefined;
  }

  async close(): Promise<void> {}

  async request(req: TransportRequest): Promise<TransportResponse> {
    if (!isAllowed(req.method, req.path)) throw new ApiError('http', `Pfad nicht erlaubt: ${req.path}`);
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
    if (req.method === 'POST') headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch(`${this.origin}${req.path}`, {
        method: req.method,
        headers,
        ...(req.method === 'POST' && req.body !== undefined ? { body: req.body } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') throw new ApiError('timeout', 'Zeitüberschreitung');
      throw new ApiError('unreachable', 'aida.de ist nicht erreichbar. Internetverbindung prüfen.');
    }
  }
}
