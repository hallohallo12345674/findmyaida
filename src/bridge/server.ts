import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { isAllowed } from '../api/endpoints.js';
import { ApiError } from '../api/errors.js';
import { REQUEST_TIMEOUT_MS, type Transport, type TransportRequest, type TransportResponse, type TransportState } from '../api/transport.js';

export const DEFAULT_PORT = 47831;
const PING_MS = 20_000;

interface Pending {
  resolve: (r: TransportResponse) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Lokaler WebSocket-Server (nur 127.0.0.1). Die Chrome-Erweiterung verbindet sich als Client
 * und führt die Anfragen in einem normalen aida.de-Tab aus.
 */
export class BridgeTransport implements Transport {
  readonly kind = 'bridge' as const;
  private wss: WebSocketServer;
  private socket: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private events = new EventEmitter();
  private pingTimer: NodeJS.Timeout;
  extensionVersion: string | null = null;

  private constructor(wss: WebSocketServer) {
    this.wss = wss;
    wss.on('connection', (ws, req) => this.onConnection(ws, req.headers.origin));
    this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_MS);
    this.pingTimer.unref();
  }

  static start(port = DEFAULT_PORT): Promise<BridgeTransport> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: '127.0.0.1', port });
      wss.once('listening', () => resolve(new BridgeTransport(wss)));
      wss.once('error', (err: NodeJS.ErrnoException) => {
        reject(
          err.code === 'EADDRINUSE'
            ? new Error(`Port ${port} ist belegt – läuft FindMyAIDA bereits in einem anderen Terminal?`)
            : err,
        );
      });
    });
  }

  getState(): TransportState {
    return this.socket ? 'connected' : 'waiting';
  }

  onStateChange(cb: (s: TransportState) => void): () => void {
    this.events.on('state', cb);
    return () => this.events.off('state', cb);
  }

  /** Wartet, bis die Erweiterung verbunden ist. */
  waitForConnection(timeoutMs: number): Promise<boolean> {
    if (this.socket) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        off();
        resolve(false);
      }, timeoutMs);
      const off = this.onStateChange((s) => {
        if (s === 'connected') {
          clearTimeout(t);
          off();
          resolve(true);
        }
      });
    });
  }

  request(req: TransportRequest): Promise<TransportResponse> {
    if (!isAllowed(req.method, req.path)) {
      return Promise.reject(new ApiError('http', `Pfad nicht erlaubt: ${req.path}`));
    }
    if (!this.socket) return Promise.reject(new ApiError('offline', 'Keine Browser-Verbindung'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ApiError('timeout', 'Zeitüberschreitung'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ type: 'request', id, ...req });
    });
  }

  async close(): Promise<void> {
    clearInterval(this.pingTimer);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new ApiError('offline', 'Verbindung beendet'));
    }
    this.pending.clear();
    this.socket?.close();
    await new Promise<void>((r) => this.wss.close(() => r()));
  }

  private onConnection(ws: WebSocket, origin: string | undefined) {
    // Nur Browser-Erweiterungen zulassen – normale Webseiten können diesen Origin nicht fälschen.
    if (!origin || !origin.startsWith('chrome-extension://')) {
      ws.close(1008, 'origin not allowed');
      return;
    }
    if (this.socket && this.socket !== ws) this.socket.close(1000, 'replaced');
    this.socket = ws;
    this.events.emit('state', 'connected');

    ws.on('message', (data) => {
      let msg: { type?: string; id?: string; status?: number; text?: string; message?: string; version?: string };
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === 'hello') this.extensionVersion = msg.version ?? null;
      if ((msg.type === 'response' || msg.type === 'error') && msg.id) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.type === 'response') p.resolve({ status: msg.status ?? 0, text: msg.text ?? '' });
        else p.reject(new ApiError('http', msg.message ?? 'Fehler in der Browser-Erweiterung'));
      }
    });
    ws.on('close', () => {
      if (this.socket !== ws) return;
      this.socket = null;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new ApiError('offline', 'Browser-Verbindung getrennt'));
      }
      this.pending.clear();
      this.events.emit('state', 'waiting');
    });
    ws.on('error', () => undefined);
  }

  private send(msg: object) {
    if (this.socket && this.socket.readyState === this.socket.OPEN) this.socket.send(JSON.stringify(msg));
  }
}
