import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const READMES = ['README.md', 'README.en.md'];
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** Bilder (src, srcset) und relative Links (href) einer README. */
function refs(md: string): { images: string[]; links: string[] } {
  const images = [...md.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]!);
  const links = [
    ...[...md.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!),
    ...[...md.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!),
  ];
  return { images, links };
}

describe('README', () => {
  it.each(READMES)('%s: alle Bilder und relativen Links gibt es', (f) => {
    const { images, links } = refs(read(f));
    expect(images.length).toBeGreaterThan(10);
    for (const p of [...images, ...links.filter((l) => !/^https?:/.test(l) && !l.startsWith('#'))]) {
      expect(fs.existsSync(path.join(ROOT, p)), p).toBe(true);
    }
  });

  it('Links nach außen zeigen nur auf das eigene Repository', () => {
    for (const f of READMES) {
      for (const l of refs(read(f)).links.filter((x) => /^https?:/.test(x))) {
        expect(l).toMatch(/^https:\/\/github\.com\/hallohallo12345674\/findmyaida\/releases(\/latest)?$/);
      }
    }
  });

  it('beide Sprachen binden dieselben Grafiken ein, bis auf Handbuch-Button und Sprachumschalter', () => {
    const neutral = (f: string) =>
      new Set(refs(read(f)).images.filter((i) => !/btn-(handbuch|manual)|lang-/.test(i)));
    expect([...neutral('README.en.md')].sort()).toEqual([...neutral('README.md')].sort());
    expect(read('README.md')).toContain('lang-de-active.svg');
    expect(read('README.en.md')).toContain('lang-en-active.svg');
  });

  it('die Versions-Badge und ihr Alt-Text nennen die aktuelle Version', () => {
    expect(read('.github/readme/badge-version.svg')).toContain(`<title>VERSION ${VERSION}</title>`);
    for (const f of READMES) expect(read(f)).toContain(`alt="Version ${VERSION}"`);
  });
});
