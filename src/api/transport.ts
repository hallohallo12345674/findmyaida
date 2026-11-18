/** Weg, auf dem der Client aida.de erreicht. Umsetzungen stehen in src/bridge. */

export interface TransportRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: string;
}

export interface TransportResponse {
  status: number;
  text: string;
}

export type TransportState = 'waiting' | 'connected' | 'demo';

/** direct: Node ohne Browser · firefox: Firefox ohne Fenster · bridge: Chrome mit Erweiterung · fixture: Demo-Daten */
export type AccessPath = 'direct' | 'firefox' | 'bridge' | 'fixture';

export interface Transport {
  readonly kind: AccessPath;
  request(req: TransportRequest): Promise<TransportResponse>;
  getState(): TransportState;
  /** Liefert eine Funktion zum Abmelden. */
  onStateChange(cb: (s: TransportState) => void): () => void;
  close(): Promise<void>;
}

/** Zeitlimit je Anfrage, für alle Wege gleich. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Antwort der Schutzschicht vor aida.de statt der Daten: Status 403 oder deren HTML-Seite. */
export function isBlockedResponse(res: TransportResponse): boolean {
  return res.status === 403 || (/^\s*</.test(res.text) && /waf@aida\.de|Access Denied|Zugriff/i.test(res.text));
}
