import WebSocket from 'ws';

interface Pending {
  resolve: (result: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/** Zeitüberschreitung eines BiDi-Befehls, unterscheidbar von einem Fehler des Browsers. */
export class BidiTimeout extends Error {}

/**
 * Sitzung mit einem Browser über WebDriver BiDi (JSON über WebSocket). Nur das, was FirefoxTransport braucht:
 * Befehl senden, auf die Antwort mit derselben id warten, Ende der Verbindung bemerken.
 */
export class BidiSession {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly closeListeners: (() => void)[] = [];
  private open = true;

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => this.onMessage(String(data)));
    ws.on('close', () => this.onClose());
    ws.on('error', () => undefined);
  }

  /** endpoint ist die Adresse aus der Startausgabe des Browsers, ohne den Pfad /session. */
  static connect(endpoint: string, timeoutMs: number): Promise<BidiSession> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${endpoint}/session`);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new BidiTimeout('Zeitüberschreitung beim Verbinden mit dem Browser'));
      }, timeoutMs);
      ws.once('open', () => {
        clearTimeout(timer);
        resolve(new BidiSession(ws));
      });
      ws.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  send<T>(method: string, params: object, timeoutMs: number): Promise<T> {
    if (!this.open) return Promise.reject(new Error('Verbindung zum Browser ist beendet'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BidiTimeout(`Zeitüberschreitung bei ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  onClosed(cb: () => void): void {
    this.closeListeners.push(cb);
  }

  close(): void {
    this.ws.close();
  }

  private onMessage(raw: string): void {
    let msg: { type?: string; id?: number; result?: unknown; error?: string; message?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    // Ereignisse (type "event") haben keine id und werden nicht gebraucht.
    const p = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
    if (!p) return;
    this.pending.delete(msg.id!);
    clearTimeout(p.timer);
    if (msg.type === 'error') p.reject(new Error(`${msg.error ?? 'Fehler'}: ${msg.message ?? ''}`));
    else p.resolve(msg.result);
  }

  private onClose(): void {
    if (!this.open) return;
    this.open = false;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Verbindung zum Browser ist beendet'));
    }
    this.pending.clear();
    for (const cb of this.closeListeners) cb();
  }
}
