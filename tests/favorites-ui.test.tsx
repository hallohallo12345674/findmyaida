import { describe, expect, it } from 'vitest';
import type { TransportRequest } from '../src/api/transport.js';
import { FixtureTransport } from '../src/bridge/transport.js';
import { demoFavorites, FIXTURES } from './helpers.js';
import { clickAt, find, setup, tick, until } from './ui-helpers.js';

/** Zählt die Preisabfragen (player.proxy.json) je Reise. */
class CountingTransport extends FixtureTransport {
  prices: string[] = [];
  constructor() {
    super(FIXTURES);
  }
  override async request(req: TransportRequest) {
    if (req.path.includes('player.proxy')) this.prices.push(/"journeyIdentifier":\["(\w+)"/.exec(req.body ?? '')?.[1] ?? '?');
    return super.request(req);
  }
}

const lineWith = (frame: string, text: string) => frame.split('\n').find((l) => l.includes(text)) ?? '';

describe('Favoriten im Vergleich', () => {
  it('m merkt die angezeigte Konfiguration und entfernt sie wieder', async () => {
    const app = setup('compare', 'PR07261128');
    await until(app.lastFrame, (s) => s.includes('☆ merken') && s.includes('1.998'));
    app.stdin.write('m');
    const f = await until(app.lastFrame, (s) => s.includes('★ gemerkt'));
    expect(f).toContain('Gemerkt · 1.998 € als Vergleichspreis');
    expect(f).toMatch(/★ gemerkt \d\d\.\d\d\. für 1\.998 € · seitdem ±0 €/);
    app.stdin.write('m');
    const g = await until(app.lastFrame, (s) => s.includes('☆ merken'));
    expect(g).toContain('Aus den Favoriten entfernt.');
    app.unmount();
  });

  it('Klick auf den Stern schaltet um', async () => {
    const app = setup('compare', 'PR07261128');
    const f = await until(app.lastFrame, (s) => s.includes('☆ merken') && s.includes('1.998'));
    const p = find(f, '☆ merken');
    await clickAt(app, p.x, p.y);
    const g = await until(app.lastFrame, (s) => s.includes('★ gemerkt'));
    const q = find(g, '★ gemerkt');
    await clickAt(app, q.x, q.y);
    await until(app.lastFrame, (s) => s.includes('☆ merken'));
    app.unmount();
  });
});

describe('Favoriten auf der Startseite', () => {
  it('zeigt aktuellen Preis und Änderung, nicht Verfügbares ohne Preisvergleich', async () => {
    const app = setup('home', undefined, { favorites: demoFavorites(true) });
    const f = await until(app.lastFrame, (s) => s.includes('−120 €') && s.includes('+85 €'));
    expect(f).toContain('FAVORITEN 4');
    expect(lineWith(f, 'Kanaren & Marokko ab Gran Canaria')).toMatch(/2\.458 €\s+−120 €/);
    expect(lineWith(f, 'nicht verfügbar')).not.toContain('€');
    expect(f).toContain('Flug ab FRA nicht mehr verfügbar');
    expect(f).toContain('abgefahren');
    app.unmount();
  });

  it('prüft beim Start jede Reise + Belegung genau einmal, abgefahrene nicht', async () => {
    const t = new CountingTransport();
    const app = setup('home', undefined, { favorites: demoFavorites(true), transport: t });
    await until(app.lastFrame, (s) => s.includes('−120 €') && s.includes('+85 €') && s.includes('nicht verfügbar'));
    await tick(200);
    expect([...t.prices].sort()).toEqual(['BL07261122', 'CO07261212', 'PR07261128']);
    app.unmount();
  });

  it('pausiert die Prüfung, solange ein Vergleich offen ist', async () => {
    const t = new CountingTransport();
    const app = setup('compare', 'PR07261128', { favorites: demoFavorites(true), transport: t });
    await until(app.lastFrame, (s) => s.includes('1.998'));
    await tick(200);
    // nur die Abfrage des Vergleichs selbst
    expect(t.prices).toEqual(['PR07261128']);
    app.unmount();
  });

  it('⏎ öffnet den Favoriten in „Anreise × Tarif“ mit gefülltem Stern', async () => {
    const app = setup('home', undefined, { favorites: demoFavorites(true) });
    await until(app.lastFrame, (s) => s.includes('−120 €'));
    app.stdin.write('\u001b[B'); // ↓ in die Liste (Kanaren & Madeira, 22.11.)
    await until(app.lastFrame, (s) => s.includes('⌫ entfernen'));
    app.stdin.write('\u001b[B'); // Kanaren & Marokko, 28.11.
    await tick();
    app.stdin.write('\r');
    const f = await until(app.lastFrame, (s) => s.includes('★ gemerkt') && s.includes('2.458'));
    expect(f).toContain('Anreise × Tarif');
    expect(f).toMatch(/für 2\.578 € · seitdem −120 €/);
    app.unmount();
  });

  it('⌫ entfernt weich, ein zweites ⌫ holt den Favoriten zurück', async () => {
    const app = setup('home', undefined, { favorites: demoFavorites(true) });
    await until(app.lastFrame, (s) => s.includes('FAVORITEN 4') && s.includes('+85 €'));
    app.stdin.write('\u001b[B');
    await until(app.lastFrame, (s) => s.includes('⌫ entfernen'));
    app.stdin.write('\u007f');
    const f = await until(app.lastFrame, (s) => s.includes('FAVORITEN 3'));
    expect(f).toContain('entfernt · ⌫ oder ☆ holt zurück');
    expect(f).toContain('⌫ zurückholen');
    app.stdin.write('\u007f');
    await until(app.lastFrame, (s) => s.includes('FAVORITEN 4') && !s.includes('entfernt ·'));
    app.unmount();
  });

  it('zeigt höchstens drei zuletzt angesehene Reisen', async () => {
    const recent = ['PR07261128', 'BL07261122', 'CO07261212', 'PR07261128x', 'BL07261122x'];
    const app = setup('home', undefined, { recent });
    const f = await until(app.lastFrame, (s) => s.includes('ZULETZT ANGESEHEN') && s.includes('AIDAcosma'));
    const lines = f.split('\n');
    const start = lines.findIndex((l) => l.includes('ZULETZT ANGESEHEN'));
    const rows = lines.slice(start + 1).filter((l) => /\d\d\.\d\d\.\d\d|x\s*$/.test(l));
    expect(rows).toHaveLength(3);
    app.unmount();
  });
});
