import { describe, expect, it } from 'vitest';
import { LETTERS, LOGO_HEIGHT, LOGO_WIDTH } from '../src/ui/components/Logo.js';

// Vorlage der Schrift (ascii.txt), Zeilenenden ohne Leerzeichen
const TEMPLATE = [
  ' █████╗ ██╗██████╗  █████╗',
  '██╔══██╗██║██╔══██╗██╔══██╗',
  '███████║██║██║  ██║███████║',
  '██╔══██║██║██║  ██║██╔══██║',
  '██║  ██║██║██████╔╝██║  ██║',
  '╚═╝  ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝',
];

describe('Logo', () => {
  it('setzt die Buchstaben Zeile für Zeile exakt zur Vorlage zusammen', () => {
    const rows = TEMPLATE.map((_, r) => LETTERS.map((l) => l[r]).join(''));
    expect(rows.map((r) => r.trimEnd())).toEqual(TEMPLATE);
  });

  it('alle Zeilen eines Buchstabens sind gleich breit (bündige Zentrierung)', () => {
    for (const l of LETTERS) expect(new Set(l.map((r) => [...r].length)).size).toBe(1);
    expect(LOGO_WIDTH).toBe(27);
    expect(LOGO_HEIGHT).toBe(7);
  });
});
