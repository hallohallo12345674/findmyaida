import { describe, expect, it } from 'vitest';
import { clickAt, find, setup, tick, type, until } from './ui-helpers.js';

const DOWN = '\u001b[B';
const RIGHT = '\u001b[C';

async function openSettings(app: ReturnType<typeof setup>) {
  await until(app.lastFrame, (s) => s.includes('⌕'));
  await type(app, '/einst');
  app.stdin.write('\r');
  return until(app.lastFrame, (s) => s.includes('›  Einstellungen') && s.includes('Farbschema'));
}

describe('Settings-Seite', () => {
  it('öffnet über /einstellungen, zeigt Navigation und Abschnitte, Esc führt zurück', async () => {
    const app = setup('home');
    const f = await openSettings(app);
    for (const t of ['◐  Darstellung', '⌖  Bedienung', '⚙  Standardwerte', '★  Favoriten', '⇄  Zugriff', '▤  Daten', 'ⓘ  Info']) {
      expect(f).toContain(t);
    }
    expect(f).toMatch(/Automatisch│Dunkel│Hell/);
    app.stdin.write('\u001b');
    await until(app.lastFrame, (s) => s.includes('⌕') && !s.includes('Einstellungen'));
    app.unmount();
  });

  it('Klick auf „Info“ in der Navigation springt zum Abschnitt', async () => {
    const app = setup('home');
    const f = await openSettings(app);
    const p = find(f, 'ⓘ  Info');
    await clickAt(app, p.x, p.y);
    const g = await until(app.lastFrame, (s) => s.includes('Version') && s.includes('Alle Einstellungen zurücksetzen'));
    expect(g).toMatch(/▌ ⓘ  Info/);
    app.unmount();
  });

  it('Schalter per Tastatur: Sprüche aus → neutraler Platzhalter auf der Startseite', async () => {
    const app = setup('home');
    await openSettings(app);
    // Farbschema → Kontrast → Großes Logo → Sprüche
    for (let i = 0; i < 3; i++) {
      app.stdin.write(DOWN);
      await tick();
    }
    await until(app.lastFrame, (s) => /▌ Sprüche im Suchfeld\s+━━● An/.test(s));
    app.stdin.write(' ');
    await until(app.lastFrame, (s) => /▌ Sprüche im Suchfeld\s+○━━ Aus/.test(s));
    app.stdin.write('\u001b');
    await until(app.lastFrame, (s) => s.includes('Reise suchen oder Befehl eingeben'));
    app.unmount();
  });

  it('großes Logo aus: Startseite zeigt die einzeilige Wortmarke', async () => {
    const app = setup('home', undefined, { settings: { bigLogo: false } });
    const f = await until(app.lastFrame, (s) => s.includes('⌕'));
    expect(f).toContain('find my AIDA');
    expect(f).not.toContain('█████╗');
    app.unmount();
  });

  it('Auswahl mit ←→: Farbschema „Hell“ ändert die Erklärung', async () => {
    const app = setup('home');
    await openSettings(app);
    app.stdin.write(RIGHT);
    await tick();
    app.stdin.write(RIGHT);
    await until(app.lastFrame, (s) => s.includes('übermalt die App'));
    app.unmount();
  });

  it('Aktionen mit Rückfrage: Verlauf löschen', async () => {
    const app = setup('home', 'PR07261128');
    const f = await openSettings(app);
    const p = find(f, '▤  Daten');
    await clickAt(app, p.x, p.y);
    await until(app.lastFrame, (s) => s.includes('1 zuletzt angesehene Reisen'));
    app.stdin.write(DOWN); // Cache → Verlauf
    await until(app.lastFrame, (s) => /▌ Verlauf/.test(s));
    app.stdin.write('\r');
    await until(app.lastFrame, (s) => s.includes('Verlauf wirklich löschen?') && s.includes('Bestätigen'));
    app.stdin.write('\r');
    await until(app.lastFrame, (s) => s.includes('Verlauf gelöscht.') && s.includes('Keine zuletzt angesehenen Reisen'));
    app.unmount();
  });

  it('Standard-Bundesland: „Alle Reisen“ bringt den Chip mit, FERIEN-Spalte erscheint', async () => {
    const app = setup('home', undefined, { settings: { defaultState: 'BY' } });
    await until(app.lastFrame, (s) => s.includes('Alle Reisen anzeigen'));
    app.stdin.write('\r');
    const f = await until(app.lastFrame, (s) => s.includes('FERIEN'));
    expect(f).toContain('Land: BY');
    app.unmount();
  });

  it('Startbildschirm „Reisen“ aus den Einstellungen', async () => {
    const app = setup('home', undefined, { settings: { startScreen: 'trips' }, fromSettings: true });
    await until(app.lastFrame, (s) => s.includes('›  Reisen') && s.includes('DATUM'));
    app.unmount();
  });

  it('⚙ in der Kopfzeile öffnet die Einstellungen, Esc kehrt zur Reiseübersicht zurück', async () => {
    const app = setup('trips');
    const f = await until(app.lastFrame, (s) => s.includes('DATUM'));
    const p = find(f, '⚙');
    await clickAt(app, p.x, p.y);
    await until(app.lastFrame, (s) => s.includes('›  Einstellungen'));
    app.stdin.write('\u001b');
    await until(app.lastFrame, (s) => s.includes('›  Reisen'));
    app.unmount();
  });
});
