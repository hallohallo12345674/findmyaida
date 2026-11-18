import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRepo, TARGETS, thirdPartyLicenses } from '../scripts/build-release.js';
import { installerPath } from '../src/update.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('Auslieferung', () => {
  it('liest das Repository aus den üblichen GitHub-Angaben', () => {
    expect(parseRepo('github:someone/findmyaida')).toBe('someone/findmyaida');
    expect(parseRepo('https://github.com/someone/findmyaida.git')).toBe('someone/findmyaida');
    expect(parseRepo('git@github.com:someone/find-my.aida.git\n')).toBe('someone/find-my.aida');
    expect(parseRepo('https://gitlab.com/someone/x')).toBeNull();
  });

  it('Installer und Archive nennen dieselben Ziele', () => {
    const sh = read('install/install.sh');
    for (const t of TARGETS.filter((x) => x !== 'win-x64')) expect(sh).toContain(`echo ${t}`);
    expect(TARGETS).toContain('win-x64');
    expect(read('install/install.ps1')).toContain("$Target = 'win-x64'");
  });

  it('install.sh ist gültiges sh, install.ps1 reines ASCII (übersteht jede Dekodierung durch irm)', () => {
    execFileSync('sh', ['-n', path.join(ROOT, 'install', 'install.sh')]);
    // eslint-disable-next-line no-control-regex
    expect(read('install/install.ps1')).toMatch(/^[\x00-\x7f]*$/);
    // exit würde bei `irm | iex` das PowerShell-Fenster schließen
    expect(read('install/install.ps1')).not.toMatch(/^\s*exit\b/m);
  });

  it('findet den abgelegten Installer nur in einer echten Installation', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'findmyaida-home-'));
    expect(installerPath(undefined)).toBeNull();
    expect(installerPath(home, 'darwin')).toBeNull();
    fs.writeFileSync(path.join(home, 'install.sh'), '');
    fs.writeFileSync(path.join(home, 'install.ps1'), '');
    expect(installerPath(home, 'linux')).toBe(path.join(home, 'install.sh'));
    expect(installerPath(home, 'win32')).toBe(path.join(home, 'install.ps1'));
  });

  it('Lizenzhinweise decken jedes gebündelte Laufzeit-Paket ab', () => {
    const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, { dev?: boolean }> };
    const runtime = Object.entries(lock.packages).filter(([dir, p]) => dir && !p.dev);
    const text = thirdPartyLicenses();
    for (const [dir] of runtime) expect(text).toContain(`${dir.replace(/^.*node_modules\//, '')} `);
    // yoga-layout liefert keine Lizenzdatei aus; der MIT-Text kommt mit dem Copyright aus den Quellen.
    expect(text).toMatch(/yoga-layout [\d.]+ \(MIT\)\n\nMIT License\n\nCopyright \(c\) Meta Platforms/);
  });
});
