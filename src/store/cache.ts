import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function defaultCacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(base, 'findmyaida');
}

interface Entry<T> {
  savedAt: number;
  data: T;
}

/** Einfacher Cache: Speicher + optional JSON-Dateien auf der Platte, jeweils mit TTL. */
export class Cache {
  private mem = new Map<string, Entry<unknown>>();

  constructor(private readonly dir: string | null) {}

  get<T>(key: string, ttlMs: number): { data: T; savedAt: number } | null {
    const now = Date.now();
    const m = this.mem.get(key) as Entry<T> | undefined;
    if (m && now - m.savedAt < ttlMs) return m;
    if (!this.dir) return null;
    try {
      const raw = fs.readFileSync(this.file(key), 'utf8');
      const e = JSON.parse(raw) as Entry<T>;
      if (now - e.savedAt < ttlMs) {
        this.mem.set(key, e);
        return e;
      }
    } catch {
      /* kein Eintrag */
    }
    return null;
  }

  set<T>(key: string, data: T): void {
    const e: Entry<T> = { savedAt: Date.now(), data };
    this.mem.set(key, e);
    if (!this.dir) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file(key), JSON.stringify(e));
    } catch {
      /* Cache ist optional */
    }
  }

  delete(key: string): void {
    this.mem.delete(key);
    if (!this.dir) return;
    try {
      fs.unlinkSync(this.file(key));
    } catch {
      /* egal */
    }
  }

  /** Belegter Platz der Cache-Dateien in Bytes (nur *.json, nicht das Firefox-Profil im Unterordner). */
  sizeBytes(): number {
    let n = 0;
    for (const f of this.files()) {
      try {
        n += fs.statSync(f).size;
      } catch {
        /* inzwischen gelöscht */
      }
    }
    return n;
  }

  /** Leert Speicher und Cache-Dateien. Unterordner (z. B. das Firefox-Profil) bleiben unberührt. */
  clear(): void {
    this.mem.clear();
    for (const f of this.files()) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* egal */
      }
    }
  }

  private files(): string[] {
    if (!this.dir) return [];
    try {
      return fs
        .readdirSync(this.dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.json'))
        .map((e) => path.join(this.dir!, e.name));
    } catch {
      return [];
    }
  }

  private file(key: string): string {
    return path.join(this.dir!, `${key.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
  }
}
