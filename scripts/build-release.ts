/**
 * Baut die Release-Archive für Nutzer ohne Node.js: offizielle Node-Laufzeit (gepinnt, Prüfsumme von nodejs.org)
 * + FindMyAIDA als ein gebündeltes Skript + Beispieldaten, Erweiterung und Symbole.
 *
 *   npm run release            → release/findmyaida-<version>-<ziel>.tar.gz|zip, SHA256SUMS, install.sh, install.ps1
 *   npm run release -- darwin-arm64   nur für ein Ziel
 *
 * Warum Node beiliegt und keine kompilierte Einzeldatei (Bun): aida.de nimmt den direkten Abruf aus Node an, den
 * aus Bun nicht (gemessen 17.11.2026). Der Netzwerk-Stack wird nicht angepasst.
 *
 * Jedes Archiv enthält die Lizenz von FindMyAIDA (GPL-3.0), die von Node und die der gebündelten Pakete.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsup';
import { VERSION } from '../src/version.js';

/** Node-Laufzeit für die Archive: aktuelle LTS-Reihe 24 („Krypton“), dieselbe Hauptversion wie in der Entwicklung. */
export const NODE_VERSION = '24.22.3';

export const TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'win-x64'] as const;
export type Target = (typeof TARGETS)[number];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const RELEASE = path.join(ROOT, 'release');
const NODE_CACHE = path.join(BUILD, 'node');

/** „owner/name“ aus einer GitHub-Angabe: github:owner/name, https://github.com/owner/name(.git), git@github.com:owner/name.git */
export function parseRepo(raw: string): string | null {
  return /github(?:\.com[:/]|:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(raw.trim())?.[1] ?? null;
}

/** GitHub-Repository der Releases: FINDMYAIDA_REPO, `repository` in package.json oder das Git-Remote origin. */
function releaseRepo(): string | null {
  if (process.env.FINDMYAIDA_REPO) return process.env.FINDMYAIDA_REPO;
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { repository?: string | { url?: string } };
  const raw = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');
  if (raw) return parseRepo(raw);
  try {
    return parseRepo(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }));
  } catch {
    return null;
  }
}

/** Installer mit eingesetztem Repository. */
function installer(file: 'install.sh' | 'install.ps1', repo: string | null): string {
  const text = fs.readFileSync(path.join(ROOT, 'install', file), 'utf8');
  return repo ? text.replaceAll('__REPO__', repo) : text;
}

const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run = (cmd: string, args: string[], cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

/** Name des Archivs auf nodejs.org. Windows als zip, sonst tar.gz. */
function nodeArchive(t: Target): string {
  return t === 'win-x64' ? `node-v${NODE_VERSION}-win-x64.zip` : `node-v${NODE_VERSION}-${t}.tar.gz`;
}

/** Lädt SHASUMS256.txt und das Archiv (einmal, dann aus build/node) und prüft die Prüfsumme. */
async function fetchNode(t: Target): Promise<string> {
  fs.mkdirSync(NODE_CACHE, { recursive: true });
  const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
  const sumsFile = path.join(NODE_CACHE, `SHASUMS256-${NODE_VERSION}.txt`);
  if (!fs.existsSync(sumsFile)) {
    const r = await fetch(`${base}/SHASUMS256.txt`);
    if (!r.ok) throw new Error(`SHASUMS256.txt: HTTP ${r.status}`);
    fs.writeFileSync(sumsFile, await r.text());
  }
  const name = nodeArchive(t);
  const expected = fs
    .readFileSync(sumsFile, 'utf8')
    .split('\n')
    .find((l) => l.endsWith(`  ${name}`))
    ?.split(' ')[0];
  if (!expected) throw new Error(`Keine Prüfsumme für ${name}`);
  const file = path.join(NODE_CACHE, name);
  if (!fs.existsSync(file) || sha256(file) !== expected) {
    console.log(`  lade ${name} …`);
    const r = await fetch(`${base}/${name}`);
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  if (sha256(file) !== expected) throw new Error(`Prüfsumme von ${name} stimmt nicht`);
  return file;
}

/** Holt nur das Node-Programm und seine Lizenz aus dem Archiv (ohne npm, Header usw.). */
function extractNode(t: Target, archive: string, dest: string) {
  const dir = path.basename(archive).replace(/\.(zip|tar\.gz)$/, '');
  const read = (member: string) =>
    t === 'win-x64'
      ? execFileSync('unzip', ['-p', archive, `${dir}/${member}`], { maxBuffer: 512 * 1024 * 1024 })
      : execFileSync('tar', ['-xzOf', archive, `${dir}/${member}`], { maxBuffer: 512 * 1024 * 1024 });
  const exe = t === 'win-x64' ? 'node.exe' : 'node';
  fs.writeFileSync(path.join(dest, exe), read(t === 'win-x64' ? 'node.exe' : 'bin/node'));
  fs.chmodSync(path.join(dest, exe), 0o755);
  fs.writeFileSync(path.join(dest, 'LICENSE-node.txt'), read('LICENSE'));
}

/** Ein ESM-Bündel ohne node_modules. CJS-Abhängigkeiten (React, ws) bekommen require über createRequire. */
async function bundle(): Promise<string> {
  const out = path.join(BUILD, 'app');
  await build({
    entry: { findmyaida: 'src/cli.tsx' },
    outDir: out,
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    clean: true,
    // Eine Datei: dynamische Importe (z. B. Ink-Devtools) nicht in Chunks auslagern.
    splitting: false,
    // Alles bündeln außer den optionalen Beschleunigern von ws (fehlen sie, läuft ws normal).
    // noExternal hat in tsup Vorrang vor external.
    noExternal: [/^(?!bufferutil$|utf-8-validate$)/],
    external: ['bufferutil', 'utf-8-validate'],
    // Ink lädt die React-Devtools nur bei DEV=true. Im Bündel würde der Import trotzdem beim Start ausgeführt,
    // deshalb ein leerer Ersatz.
    esbuildPlugins: [
      {
        name: 'stub-react-devtools',
        setup(b) {
          b.onResolve({ filter: /^react-devtools-core$/ }, () => ({ path: 'react-devtools-core', namespace: 'stub' }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export default { initialize() {}, connectToDevTools() {} };',
            loader: 'js',
          }));
        },
      },
    ],
    outExtension: () => ({ js: '.mjs' }),
    banner: { js: "import { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);" },
    silent: true,
  });
  return path.join(out, 'findmyaida.mjs');
}

// ---------------------------------------------------------------- Lizenzen der gebündelten Pakete

const MIT_TERMS = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** Lizenztext eines Pakets: seine LICENSE-Dateien; fehlen sie bei MIT, der MIT-Text mit dem Copyright aus den Quellen. */
function packageLicense(dir: string, license: string | undefined): string {
  const files = fs.readdirSync(dir).filter((f) => /^licen[cs]e/i.test(f)).sort();
  if (files.length) return files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim()).join('\n\n');
  // yoga-layout liefert keine Lizenzdatei aus, nur den Hinweis im Dateikopf jeder Quelle.
  const copyright =
    license === 'MIT'
      ? (fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }) as string[])
          .filter((f) => /\.(js|ts)$/.test(f))
          .map((f) => /Copyright \(c\)[^\n*]+/.exec(fs.readFileSync(path.join(dir, f), 'utf8'))?.[0].trim())
          .find(Boolean)
      : undefined;
  if (!copyright) throw new Error(`Keine Lizenzdatei in ${path.relative(ROOT, dir)}`);
  return `MIT License\n\n${copyright}\n\n${MIT_TERMS}`;
}

/**
 * THIRD-PARTY-LICENSES.txt: alle Laufzeit-Pakete aus package-lock.json, also alles, was im Bündel stecken kann.
 * MIT und ISC verlangen, dass ihr Hinweis jeder Kopie beiliegt.
 */
export function thirdPartyLicenses(): string {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, { version?: string; license?: string; dev?: boolean }>;
  };
  const parts = Object.entries(lock.packages)
    .filter(([dir, p]) => dir && !p.dev)
    .map(([dir, p]) => {
      const name = dir.replace(/^.*node_modules\//, '');
      return `${name} ${p.version ?? ''} (${p.license ?? 'ohne Angabe'})\n\n${packageLicense(path.join(ROOT, dir), p.license)}`;
    });
  return (
    'FindMyAIDA bündelt die folgenden Pakete in app/findmyaida.mjs. Ihre Lizenzen:\n\n' +
    `${parts.join(`\n\n${'-'.repeat(80)}\n\n`)}\n`
  );
}

function copyDir(src: string, dest: string, skip: (name: string) => boolean = () => false) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d, skip);
    else fs.copyFileSync(s, d);
  }
}

async function main() {
  const wanted = process.argv.slice(2).filter((a): a is Target => (TARGETS as readonly string[]).includes(a));
  const targets = wanted.length ? wanted : [...TARGETS];
  console.log(`FindMyAIDA ${VERSION} mit Node ${NODE_VERSION}: ${targets.join(', ')}`);
  const repo = releaseRepo();
  if (!repo) console.warn('  Hinweis: kein GitHub-Repository bekannt (FINDMYAIDA_REPO bzw. "repository" in package.json); Installer behalten __REPO__.');
  const app = await bundle();
  const notices = thirdPartyLicenses();
  fs.rmSync(RELEASE, { recursive: true, force: true });
  fs.mkdirSync(RELEASE, { recursive: true });
  const stage = path.join(BUILD, 'stage');
  fs.rmSync(stage, { recursive: true, force: true });

  for (const t of targets) {
    const name = `findmyaida-${VERSION}-${t}`;
    const dir = path.join(stage, name);
    fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
    extractNode(t, await fetchNode(t), dir);
    fs.copyFileSync(app, path.join(dir, 'app', 'findmyaida.mjs'));
    copyDir(path.join(ROOT, 'tests', 'fixtures'), path.join(dir, 'fixtures'));
    copyDir(path.join(ROOT, 'extension'), path.join(dir, 'extension'));
    copyDir(path.join(ROOT, 'install', 'assets'), path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'VERSION'), `${VERSION}\n`);
    fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(dir, 'LICENSE'));
    fs.writeFileSync(path.join(dir, 'THIRD-PARTY-LICENSES.txt'), notices);
    // Der Installer liegt im Archiv, damit `findmyaida update` und `uninstall` ihn lokal finden.
    fs.writeFileSync(path.join(dir, t === 'win-x64' ? 'install.ps1' : 'install.sh'), installer(t === 'win-x64' ? 'install.ps1' : 'install.sh', repo));
    const archive = path.join(RELEASE, t === 'win-x64' ? `${name}.zip` : `${name}.tar.gz`);
    // Ohne macOS-Metadaten (._-Dateien), damit die Archive auf allen Systemen sauber sind.
    if (t === 'win-x64') run('zip', ['-qrX', archive, name], stage);
    else execFileSync('tar', ['-czf', archive, name], { cwd: stage, stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } });
    console.log(`  ${path.relative(ROOT, archive)}  ${(fs.statSync(archive).size / 1024 / 1024).toFixed(1)} MB`);
  }

  for (const f of ['install.sh', 'install.ps1'] as const) fs.writeFileSync(path.join(RELEASE, f), installer(f, repo));
  const sums = fs
    .readdirSync(RELEASE)
    .filter((f) => f !== 'SHA256SUMS')
    .sort()
    .map((f) => `${sha256(path.join(RELEASE, f))}  ${f}`)
    .join('\n');
  fs.writeFileSync(path.join(RELEASE, 'SHA256SUMS'), `${sums}\n`);
  console.log(`Fertig: ${path.relative(ROOT, RELEASE)}/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
