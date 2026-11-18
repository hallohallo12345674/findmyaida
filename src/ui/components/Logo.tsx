import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

// Blockschrift mit Schatten, A I D A – je Buchstabe 6 Zeilen. Jede Zeile hat die volle
// Buchstabenbreite (auch Leerzeichen am Ende), damit der Block bündig zentriert wird.
export const LETTERS: string[][] = [
  [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
  ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
  [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
];

const ROWS = LETTERS[0]!.length;
export const LOGO_WIDTH = LETTERS.reduce((a, l) => a + l[0]!.length, 0);
/** „find my“ + Schriftzug */
export const LOGO_HEIGHT = 1 + ROWS;

/** Großes Logo: „f i n d   m y“ klein, darunter AIDA in den Farben der AIDA-Logobuchstaben. */
export function BigLogo() {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text color={theme.muted}>f i n d   m y</Text>
      {Array.from({ length: ROWS }, (_, row) => (
        <Text key={row}>
          {LETTERS.map((l, i) => (
            <Text key={i} color={theme.aidaLetters[i]}>
              {l[row]}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}

/** Einzeilige Wortmarke für Titelleisten. */
export function SmallLogo() {
  return (
    <Text>
      <Text color={theme.muted}>find my </Text>
      {'AIDA'.split('').map((ch, i) => (
        <Text key={i} bold color={theme.aidaLetters[i]}>
          {ch}
        </Text>
      ))}
    </Text>
  );
}
