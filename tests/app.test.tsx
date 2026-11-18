import { describe, expect, it } from 'vitest';
import { clickAt, find, plain, setup, tick, until, wheelDown } from './ui-helpers.js';

describe('Vergleich (Tastatur)', () => {
  it('zeigt Kabine × Tarif mit den Preisen des Buchungsassistenten', async () => {
    const app = setup('compare', 'PR07261128');
    const f = await until(app.lastFrame, (s) => s.includes('CLASSIC') && s.includes('1.998'));
    expect(f).toContain('Kanaren & Marokko ab Gran Canaria');
    expect(f).toContain('Innen');
    expect(f).toContain('‹ Reisen');
    expect(f).toContain('Demo-Daten');
    app.unmount();
  });

  it('wechselt Ansichten synchron und zeigt Angebote einer Zelle', async () => {
    const app = setup('compare', 'PR07261128');
    await until(app.lastFrame, (s) => s.includes('1.998'));
    await tick();
    app.stdin.write('2');
    const v2 = await until(app.lastFrame, (s) => s.includes('HAM ⇄ HAM'));
    expect(v2).toContain('2.098');
    expect(v2).toContain('Kabine ‹');
    app.stdin.write('\r');
    const v4 = await until(app.lastFrame, (s) => s.includes('Angebote (') && s.includes('✕'));
    expect(v4).toContain('GESAMT');
    app.stdin.write('\u001b');
    await until(app.lastFrame, (s) => s.includes('HAM ⇄ HAM') && !s.includes('Angebote ('));
    app.unmount();
  });

  it('ändert die Belegung über den Dialog', async () => {
    const app = setup('compare', 'PR07261128');
    await until(app.lastFrame, (s) => s.includes('1.998'));
    app.stdin.write('b');
    await until(app.lastFrame, (s) => s.includes('Belegung der Kabine'));
    await tick();
    app.stdin.write('4'); // Schnellwahl 4 = 2 Erw. + 1 Kind
    await until(app.lastFrame, (s) => s.includes('2 Erw. + 1 Kind') && !s.includes('Belegung der Kabine') && s.includes('CLASSIC'));
    app.unmount();
  });

  it('meldet nicht buchbare Belegungen klar', async () => {
    const app = setup('compare', 'PR07261128');
    await until(app.lastFrame, (s) => s.includes('1.998'));
    app.stdin.write('b');
    await until(app.lastFrame, (s) => s.includes('Belegung der Kabine'));
    await tick();
    app.stdin.write('2'); // 1 Erw.
    await until(app.lastFrame, (s) => s.includes('nicht buchbar'));
    app.unmount();
  });
});

describe('Startseite und Reiseübersicht', () => {
  it('⏎ bei leerer Eingabe zeigt alle Reisen', async () => {
    const app = setup('home');
    await until(app.lastFrame, (s) => s.includes('Alle Reisen anzeigen'));
    await tick();
    app.stdin.write('\r');
    await until(app.lastFrame, (s) => s.includes('66 Termine'));
    app.unmount();
  });

  it('Vorschlag per Tab wird zum Filter-Chip, ⏎ zeigt die gefilterte Liste', async () => {
    const app = setup('home');
    await until(app.lastFrame, (s) => s.includes('Alle Reisen anzeigen'));
    await tick();
    for (const ch of 'kan') app.stdin.write(ch);
    await until(app.lastFrame, (s) => s.includes('Region Kanaren'));
    app.stdin.write('\t');
    await until(app.lastFrame, (s) => s.includes('Region: Kanaren ✕'));
    app.stdin.write('\r');
    const f = await until(app.lastFrame, (s) => /\b39 Termine/.test(s));
    expect(f).toContain('Region: Kanaren');
    app.unmount();
  });

  it('öffnet aus der Übersicht den Vergleich und kommt mit Esc zurück', async () => {
    const app = setup('trips');
    await until(app.lastFrame, (s) => s.includes('Termine'));
    await tick();
    for (const ch of 'marokko') app.stdin.write(ch);
    await until(app.lastFrame, (s) => s.includes('1 Termin '));
    app.stdin.write('\r');
    await until(app.lastFrame, (s) => s.includes('‹ Reisen') && s.includes('1.998'));
    app.stdin.write('\u001b');
    await until(app.lastFrame, (s) => s.includes('find my') && s.includes('marokko'));
    app.unmount();
  });

  it('Befehle im Text filtern sofort (dauer:12)', async () => {
    const app = setup('trips');
    await until(app.lastFrame, (s) => s.includes('66 Termine'));
    await tick();
    for (const ch of 'dauer:12') app.stdin.write(ch);
    await until(app.lastFrame, (s) => /\b8 Termine/.test(s));
    app.unmount();
  });
});

describe('Maus', () => {
  it('Klick auf einen Tab wechselt die Ansicht', async () => {
    const app = setup('compare', 'PR07261128');
    const f = await until(app.lastFrame, (s) => s.includes('1.998'));
    const p = find(f, '4 Angebote');
    await clickAt(app, p.x + 2, p.y);
    await until(app.lastFrame, (s) => s.includes('Angebote (') && s.includes('GESAMT'));
    app.unmount();
  });

  it('Klick wählt eine Zelle, zweiter Klick zeigt deren Angebote', async () => {
    const app = setup('compare', 'PR07261128');
    const f = await until(app.lastFrame, (s) => s.includes('2.430'));
    const p = find(f, '2.430');
    await clickAt(app, p.x + 1, p.y);
    await until(app.lastFrame, (s) => s.includes('Meerblickkabine'));
    await tick(450); // kein Doppelklick
    await clickAt(app, p.x + 1, p.y);
    const v4 = await until(app.lastFrame, (s) => s.includes('Angebote (') && s.includes('PREMIUM ✕'));
    expect(v4).toContain('Meerblick');
    app.unmount();
  });

  it('Klick auf „‹ Reisen“ führt zur Übersicht, Mausrad scrollt, Mausfolgen landen nicht im Suchfeld', async () => {
    const app = setup('compare', 'PR07261128');
    const f = await until(app.lastFrame, (s) => s.includes('1.998'));
    const p = find(f, '‹ Reisen');
    await clickAt(app, p.x + 1, p.y);
    const t = await until(app.lastFrame, (s) => s.includes('66 Termine'));
    const first = find(t, '▌');
    app.stdin.write(wheelDown(first.x + 10, first.y + 2));
    await tick(120);
    const after = plain(app.lastFrame());
    expect(find(after, '▌').y).toBeGreaterThan(first.y);
    expect(after).not.toContain('[<65');
    app.unmount();
  });

  it('Klick auf einen Filter-Chip öffnet den Dialog, Klick daneben schließt ihn', async () => {
    const app = setup('compare', 'PR07261128');
    const f = await until(app.lastFrame, (s) => s.includes('1.998'));
    const p = find(f, 'Tarif alle');
    await clickAt(app, p.x + 2, p.y);
    await until(app.lastFrame, (s) => s.includes('ABFLUGHAFEN') && s.includes('Übernehmen'));
    await clickAt(app, 0, 0);
    await until(app.lastFrame, (s) => !s.includes('ABFLUGHAFEN'));
    app.unmount();
  });
});
