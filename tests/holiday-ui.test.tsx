import { describe, expect, it } from 'vitest';
import { SAYINGS } from '../src/ui/sayings.js';
import { find, hover, setup, tick, type, until } from './ui-helpers.js';

describe('Schulferien in der Reiseübersicht', () => {
  it('ohne Bundesland gibt es keinerlei Ferien-Elemente', async () => {
    const app = setup('trips');
    const f = await until(app.lastFrame, (s) => s.includes('DATUM'));
    expect(f).not.toContain('FERIEN');
    expect(f).not.toContain('Ctrl+T');
    expect(f).not.toContain('ferien:');
    expect(f).toContain('land:');
    app.unmount();
  });

  it('land:by ferien:weih zeigt die Spalte FERIEN mit grünen und roten Angaben', async () => {
    const app = setup('trips');
    await until(app.lastFrame, (s) => s.includes('DATUM'));
    await type(app, 'land:by ferien:weih ');
    const f = await until(app.lastFrame, (s) => s.includes('FERIEN'));
    expect(f).toContain('✓ Weihnachten');
    expect(f).toMatch(/Weihnachten · \d+ Tg/);
    expect(f).toContain('Ctrl+T');
    expect(f).toContain('ferien:');
    app.unmount();
  });

  it('Hover über die Schultage zeigt den Amtlichen Hinweis ohne Zahl, über den Namen die Ferienzeiten', async () => {
    const app = setup('trips');
    await until(app.lastFrame, (s) => s.includes('DATUM'));
    await type(app, 'land:by ferien:weih ');
    const f = await until(app.lastFrame, (s) => s.includes('FERIEN'));
    const tg = find(f, ' · 10 Tg');
    app.stdin.write(hover(tg.x + 3, tg.y));
    const n = await until(app.lastFrame, (s) => s.includes('AMTLICHER HINWEIS'));
    expect(n).toContain('Art. 35 BayEUG');
    expect(n).toContain('Kein Rechtsrat');
    expect(n).not.toMatch(/\d+ Schultag/);
    // Wegbewegen schließt, Mausfolgen landen nicht im Suchfeld
    app.stdin.write(hover(2, tg.y));
    const off = await until(app.lastFrame, (s) => !s.includes('AMTLICHER HINWEIS'));
    expect(off).not.toContain('[<35');
    const name = find(off, 'Weihnachten · 10 Tg');
    app.stdin.write(hover(name.x + 2, name.y));
    const c = await until(app.lastFrame, (s) => s.includes('Weihnachtsferien · BY'));
    expect(c).toMatch(/BY\s+Weihnachtsferien 24\.12\.–08\.01\.2027 · 10 Schultage/);
    app.unmount();
  });

  it('Klick auf ✕ am Bundesland-Chip setzt auch die Ferien zurück', async () => {
    const app = setup('trips');
    await until(app.lastFrame, (s) => s.includes('DATUM'));
    await type(app, 'bay');
    app.stdin.write('\t');
    await tick(80);
    await type(app, 'weih');
    app.stdin.write('\t');
    const f = await until(app.lastFrame, (s) => s.includes('Ferien: Weihnachtsferien'));
    const x = find(f, 'Land: BY ✕');
    app.stdin.write(`\x1b[<0;${x.x + 10 + 1};${x.y + 1}M`);
    await tick(20);
    app.stdin.write(`\x1b[<0;${x.x + 10 + 1};${x.y + 1}m`);
    const g = await until(app.lastFrame, (s) => !s.includes('Land: BY'));
    expect(g).not.toContain('Ferien:');
    expect(g).not.toContain('FERIEN');
    app.unmount();
  });

  it('meldet Konflikte klar (Winterferien in NRW)', async () => {
    const app = setup('trips');
    await until(app.lastFrame, (s) => s.includes('DATUM'));
    await type(app, 'land:by land:nw ferien:winter ');
    const f = await until(app.lastFrame, (s) => s.includes('✕ Winterferien gibt es in Nordrhein-Westfalen (NW) nicht.'));
    expect(f).toContain('Tipp:');
    app.unmount();
  });
});

describe('Startseite', () => {
  it('zeigt einen Spruch aus der Liste als Platzhalter', async () => {
    const app = setup('home');
    const f = await until(app.lastFrame, (s) => s.includes('⌕'));
    const line = f.split('\n').find((l) => l.includes('⌕'))!;
    expect(SAYINGS.some((s) => line.includes(s.slice(0, 20)))).toBe(true);
    app.unmount();
  });
});
