import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/* Aufrufe ins Betriebssystem (Browser, Zwischenablage, Dateien), getrennt von der Darstellung. */

/** Öffnet die Adresse im Standardbrowser. Fehler werden ignoriert: Der Link lässt sich auch kopieren. */
export function openUrl(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* ignorieren */
  }
}

/** Kopiert Text in die Zwischenablage. false, wenn sich das Hilfsprogramm nicht starten lässt. */
export function copyText(text: string): boolean {
  const cmd = process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : 'xclip';
  const args = process.platform === 'linux' ? ['-selection', 'clipboard'] : [];
  try {
    const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    p.on('error', () => undefined);
    p.stdin.end(text);
    return true;
  } catch {
    return false;
  }
}

/** „~/Downloads/x.json“ → absoluter Pfad. */
export function expandHome(p: string, home: string): string {
  return p === '~' ? home : p.startsWith('~/') ? path.join(home, p.slice(2)) : p;
}

/** Gibt es die Datei (kein Ordner)? */
export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Fragt die Hintergrundfarbe des Terminals ab (OSC 11) und hängt eine Geräteabfrage (DA1) an, die jedes Terminal
 * beantwortet. Kommt die DA1-Antwort, ist klar, dass keine OSC-11-Antwort mehr folgt – so landet keine verspätete
 * Antwort später im Suchfeld. Liefert die rohe Antwort ('' ohne Terminal oder nach Zeitablauf).
 */
export function queryTerminalBackground(timeoutMs = 400): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let buf = '';
    const wasRaw = stdin.isRaw;
    const finish = () => {
      clearTimeout(timer);
      stdin.off('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      resolve(buf);
    };
    const onData = (d: Buffer) => {
      buf += d.toString('latin1');
      if (/\x1b\[\?[\d;]*c/.test(buf)) finish();
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    const timer = setTimeout(finish, timeoutMs);
    stdout.write('\x1b]11;?\x1b\\\x1b[c');
  });
}

/** Ordner für Exporte: ~/Downloads, sonst das Benutzerverzeichnis. */
export function defaultExportDir(home: string): string {
  const downloads = path.join(home, 'Downloads');
  try {
    if (fs.statSync(downloads).isDirectory()) return downloads;
  } catch {
    /* kein Downloads-Ordner */
  }
  return home;
}
