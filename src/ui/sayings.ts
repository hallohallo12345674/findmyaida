/** Platzhalter-Sprüche für das Suchfeld der Startseite – pro Start einer, nie zweimal hintereinander. */
export const SAYINGS = [
  'Kabine mit Meerblick oder Meer mit Kabinenblick?',
  'Leinen los – wohin darf’s gehen?',
  'Irgendwo ist immer Seetag …',
  'Ahoi! Welcher Hafen darf’s sein?',
  'Balkon oder Bullauge? Erst mal suchen.',
  'Das Buffet wartet schon. Wohin?',
  'Sonnenliege reservieren war gestern. Reise suchen ist heute.',
  'Fernweh? Hier tippen.',
  'Mittelmeer, Nordland oder Karibik?',
  'Kapitän Sie, Kurs bitte eingeben.',
  'Keine Sorge, das Schiff wartet nicht – die Suche schon.',
  'Wo ist das Meer heute am blausten?',
  'Erst die Route, dann die Rettungsweste.',
  'Backbord, Steuerbord – Hauptsache Bord.',
  'Mehr Meer, bitte.',
  'Einmal Fjorde zum Mitnehmen?',
  'Urlaub ab Hafen. Abfahrt nach Eingabe.',
  'Seegang: ruhig. Preise: mal sehen.',
  'Wohin geht die nächste Kreuzfahrt?',
  'Heute schon an Deck gedacht?',
] as const;

/** Zufälligen Spruch wählen, nicht denselben wie beim letzten Start. */
export function pickSaying(last: number | undefined, rnd: () => number = Math.random): number {
  const n = SAYINGS.length;
  if (last === undefined || last < 0 || last >= n) return Math.floor(rnd() * n) % n;
  const i = Math.floor(rnd() * (n - 1)) % (n - 1);
  return i >= last ? i + 1 : i;
}
