// Muss vor Ink (und damit chalk) geladen werden: chalk liest die Farbtiefe beim Import.
// Echtfarben, damit die Bildschirmfotos der README die Farben der Palette exakt zeigen.
process.env.FORCE_COLOR = '3';
export {};
