import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isAllowed } from '../api/endpoints.js';
import { ApiError } from '../api/errors.js';
import { REQUEST_TIMEOUT_MS, type Transport, type TransportRequest, type TransportResponse, type TransportState } from '../api/transport.js';
import { AIDA_ORIGIN } from '../domain/links.js';
import { BidiSession, BidiTimeout } from './bidi.js';

const START_TIMEOUT_MS = 45_000;
const PROFILE_PREFIX = 'ff-';
const PID_FILE = 'findmyaida.pid';

/**
 * Läuft in der aida.de-Seite: derselbe Aufruf wie pageFetch in extension/background.js (same-origin, ohne Cookies).
 * Beide Stellen müssen gleich bleiben. Das Ergebnis kommt als JSON-Text zurück, weil BiDi Objekte verpackt liefert.
 */
const PAGE_FETCH = `(async (path, method, body) => {
  const res = await fetch(path, {
    method,
    headers: method === 'POST' ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
    body: method === 'POST' ? body : undefined,
    credentials: 'omit',
  });
  return JSON.stringify({ status: res.status, text: await res.text() });
})`;

export interface LaunchedBrowser {
  /** WebSocket-Adresse aus der Startausgabe, ohne den Pfad /session. */
  endpoint: string;
  pid?: number;
  kill(): void;
}

export type Launcher = (executable: string, profileDir: string) => Promise<LaunchedBrowser>;

export interface FirefoxOptions {
  executable: string;
  /** Ordner für Wegwerf-Profile; je Start entsteht darin ein eigenes. */
  profileBase: string;
  launch?: Launcher;
  startPage?: string;
  timeoutMs?: number;
}

type EvaluateResult = { type: 'success'; result: { type: string; value?: unknown } } | { type: 'exception'; exceptionDetails?: { text?: string } };

/**
 * Fragt aus einem Firefox ohne Fenster ab: echter, unveränderter Browser mit Wegwerf-Profil, gesteuert über
 * WebDriver BiDi. Die Anfragen laufen in der geladenen aida.de-Seite, wie beim Weg über die Erweiterung.
 * Der Browser wird nicht getarnt; dass er ferngesteuert ist, bleibt für die Seite erkennbar.
 */
export class FirefoxTransport implements Transport {
  readonly kind = 'firefox' as const;
  private alive = true;
  private readonly onProcessExit = () => this.shutdown();

  private constructor(
    private readonly browser: LaunchedBrowser,
    private readonly session: BidiSession,
    private readonly context: string,
    private readonly profileDir: string,
    private readonly timeoutMs: number,
  ) {
    session.onClosed(() => {
      this.alive = false;
    });
    // Auch bei process.exit (SIGTERM, SIGHUP, Absturz) darf kein Browser weiterlaufen.
    process.once('exit', this.onProcessExit);
  }

  /** Startet den Browser und lädt die aida.de-Seite. Wirft ApiError 'unreachable', wenn das nicht gelingt. */
  static async start(opts: FirefoxOptions): Promise<FirefoxTransport> {
    cleanupStaleProfiles(opts.profileBase);
    fs.mkdirSync(opts.profileBase, { recursive: true });
    const profileDir = fs.mkdtempSync(path.join(opts.profileBase, PROFILE_PREFIX));
    let browser: LaunchedBrowser | undefined;
    let session: BidiSession | undefined;
    try {
      browser = await (opts.launch ?? launchFirefox)(opts.executable, profileDir);
      // Besitzer (diese App) und Browser merken, damit ein späterer Start verwaiste Profile erkennt.
      fs.writeFileSync(path.join(profileDir, PID_FILE), `${process.pid} ${browser.pid ?? 0}`);
      session = await BidiSession.connect(browser.endpoint, START_TIMEOUT_MS);
      await session.send('session.new', { capabilities: {} }, START_TIMEOUT_MS);
      const tree = await session.send<{ contexts: { context: string }[] }>('browsingContext.getTree', {}, START_TIMEOUT_MS);
      const context = tree.contexts[0]?.context;
      if (!context) throw new Error('kein Tab vorhanden');
      const url = opts.startPage ?? `${AIDA_ORIGIN}/finden`;
      await session.send('browsingContext.navigate', { context, url, wait: 'complete' }, START_TIMEOUT_MS);
      return new FirefoxTransport(browser, session, context, profileDir, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
    } catch (e) {
      session?.close();
      browser?.kill();
      removeDir(profileDir);
      throw new ApiError('unreachable', `Firefox ließ sich nicht ohne Fenster starten: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  getState(): TransportState {
    return 'connected';
  }

  onStateChange(): () => void {
    return () => undefined;
  }

  async request(req: TransportRequest): Promise<TransportResponse> {
    if (!isAllowed(req.method, req.path)) throw new ApiError('http', `Pfad nicht erlaubt: ${req.path}`);
    if (!this.alive) throw new ApiError('unreachable', 'Firefox ohne Fenster wurde unerwartet beendet. FindMyAIDA neu starten.');
    const expression = `${PAGE_FETCH}(${JSON.stringify(req.path)}, ${JSON.stringify(req.method)}, ${JSON.stringify(req.body ?? null)})`;
    let result: EvaluateResult;
    try {
      result = await this.session.send<EvaluateResult>(
        'script.evaluate',
        { expression, target: { context: this.context }, awaitPromise: true, resultOwnership: 'none' },
        this.timeoutMs,
      );
    } catch (e) {
      if (e instanceof BidiTimeout) throw new ApiError('timeout', 'Zeitüberschreitung');
      throw new ApiError('unreachable', 'Firefox ohne Fenster antwortet nicht mehr. FindMyAIDA neu starten.');
    }
    // Eine Ausnahme in der Seite heißt: fetch selbst ist gescheitert, also keine Verbindung zu aida.de.
    if (result.type === 'exception' || typeof result.result.value !== 'string') {
      throw new ApiError('unreachable', 'aida.de ist nicht erreichbar. Internetverbindung prüfen.');
    }
    return JSON.parse(result.result.value) as TransportResponse;
  }

  async close(): Promise<void> {
    if (this.alive) await this.session.send('browser.close', {}, 3000).catch(() => undefined);
    this.shutdown();
  }

  private shutdown(): void {
    process.off('exit', this.onProcessExit);
    this.alive = false;
    this.session.close();
    this.browser.kill();
    removeDir(this.profileDir);
  }
}

/** Startet Firefox ohne Fenster und wartet auf die BiDi-Adresse in dessen Startausgabe. */
const launchFirefox: Launcher = (executable, profileDir) =>
  new Promise((resolve, reject) => {
    // -no-remote: eigene Instanz, auch wenn der Nutzer gerade Firefox offen hat.
    const child = spawn(executable, ['-headless', '-no-remote', '-profile', profileDir, '--remote-debugging-port', '0', 'about:blank'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error('Zeitüberschreitung beim Start')));
    }, START_TIMEOUT_MS);
    const onData = (chunk: Buffer) => {
      if (settled) return; // weiterlesen, damit die Ausgabe den Browser nicht blockiert
      output += chunk.toString();
      const m = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(output);
      if (m) finish(() => resolve({ endpoint: m[1]!, pid: child.pid, kill: () => void child.kill() }));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', (e) => finish(() => reject(e)));
    child.once('exit', (code) => finish(() => reject(new Error(`Firefox hat sich beendet (Code ${code})`))));
  });

function removeDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* wird beim nächsten Start aufgeräumt */
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Räumt Profile früherer Läufe auf, die nicht sauber beendet wurden (z. B. nach kill -9), samt eines Browsers, der
 * dazu noch läuft. Profile einer zweiten, noch laufenden FindMyAIDA-Instanz bleiben unberührt. Beendet wird ein
 * Browserprozess nur, wenn seine Befehlszeile genau dieses Profil nennt.
 */
function cleanupStaleProfiles(profileBase: string): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(profileBase).filter((n) => n.startsWith(PROFILE_PREFIX));
  } catch {
    return;
  }
  for (const name of entries) {
    const dir = path.join(profileBase, name);
    let owner = 0;
    let browser = 0;
    try {
      [owner = 0, browser = 0] = fs.readFileSync(path.join(dir, PID_FILE), 'utf8').split(' ').map(Number);
    } catch {
      /* keine PID-Datei: Start wurde abgebrochen */
    }
    if (owner > 0 && isRunning(owner)) continue;
    try {
      if (browser > 0 && process.platform !== 'win32') {
        const command = execFileSync('ps', ['-p', String(browser), '-o', 'command='], { encoding: 'utf8' });
        if (command.includes(dir)) process.kill(browser);
      }
    } catch {
      /* Browser läuft nicht mehr */
    }
    removeDir(dir);
  }
}
