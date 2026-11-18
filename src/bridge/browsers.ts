import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Umgebung, in der nach einem Browser gesucht wird. Einsetzbar, damit Tests ohne das echte System laufen. */
export interface BrowserLookup {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  home: string;
  exists(file: string): boolean;
}

export function systemLookup(): BrowserLookup {
  return { platform: process.platform, env: process.env, home: os.homedir(), exists: (f) => fs.existsSync(f) };
}

/**
 * Pfad eines installierten Firefox oder null. FINDMYAIDA_FIREFOX gibt den Pfad ausdrücklich vor; zeigt die Variable
 * ins Leere, wird nicht weitergesucht.
 */
export function findFirefox(l: BrowserLookup = systemLookup()): string | null {
  const explicit = l.env.FINDMYAIDA_FIREFOX;
  if (explicit) return l.exists(explicit) ? explicit : null;
  return firefoxCandidates(l).find((c) => l.exists(c)) ?? null;
}

function firefoxCandidates(l: BrowserLookup): string[] {
  if (l.platform === 'darwin') {
    const app = 'Firefox.app/Contents/MacOS/firefox';
    return [`/Applications/${app}`, `${l.home}/Applications/${app}`];
  }
  if (l.platform === 'win32') {
    return [l.env.ProgramFiles, l.env['ProgramFiles(x86)'], l.env.LOCALAPPDATA]
      .filter((dir): dir is string => !!dir)
      .map((dir) => path.win32.join(dir, 'Mozilla Firefox', 'firefox.exe'));
  }
  const dirs = (l.env.PATH ?? '').split(':').filter(Boolean);
  return ['firefox', 'firefox-esr'].flatMap((name) => dirs.map((dir) => `${dir}/${name}`));
}
