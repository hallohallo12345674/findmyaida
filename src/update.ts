import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * `findmyaida update` und `findmyaida uninstall` übergeben an den Installer, den die Installation neben dem
 * Programm abgelegt hat. Er kennt Download, Prüfsummen, Startsymbole und PATH; hier wird nichts davon doppelt
 * gebaut. FINDMYAIDA_HOME setzt das Startskript des Installers.
 */

/** Pfad des abgelegten Installers oder null (z. B. bei einer Entwicklerinstallation aus dem Projektordner). */
export function installerPath(home: string | undefined, platform: NodeJS.Platform = process.platform): string | null {
  if (!home) return null;
  const file = path.join(home, platform === 'win32' ? 'install.ps1' : 'install.sh');
  return fs.existsSync(file) ? file : null;
}

export async function runInstaller(action: 'update' | 'uninstall'): Promise<number> {
  const file = installerPath(process.env.FINDMYAIDA_HOME);
  if (!file) {
    console.error(
      action === 'update'
        ? 'Diese Installation stammt nicht vom Installer. Im Projektordner aktualisieren: git pull && npm install && npm run build'
        : 'Diese Installation stammt nicht vom Installer. Entfernen: npm unlink bzw. den Projektordner löschen.',
    );
    return 1;
  }
  // Der Installer ersetzt beim Aktualisieren auch sich selbst; deshalb läuft eine Kopie aus dem Temp-Ordner.
  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'findmyaida-')), path.basename(file));
  fs.copyFileSync(file, copy);
  const [cmd, args] =
    process.platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', copy, action === 'update' ? '-Update' : '-Uninstall']]
      : ['sh', [copy, `--${action}`]];
  return new Promise((resolve) => {
    const p = spawn(cmd, args as string[], { stdio: 'inherit' });
    p.on('error', (e) => {
      console.error(`Installer ließ sich nicht starten: ${e.message}`);
      resolve(1);
    });
    p.on('exit', (code) => resolve(code ?? 1));
  });
}
