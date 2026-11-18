import React from 'react';
import { Box, Text } from 'ink';
import { commonWindow, holidayLabel, holidayShort, stateNote, type TripHolidays } from '../../domain/holidays.js';
import { officialNotice } from '../../domain/schoolLaw.js';
import { dateDE, dateShort, dateWeekday } from '../format.js';
import type { Rect } from '../mouse/MouseProvider.js';
import { theme } from '../theme.js';

/** Kurzlabel der Ferienart(en) einer Passung, z. B. „Sommer“ oder „Herbst/Winter“. */
export function fitTypeLabel(h: TripHolidays): string {
  const types = [...new Set(h.fits.map((f) => f.type))];
  return types.map(holidayShort).join('/');
}

/** „2 Tg“ bzw. bei mehreren Ländern „bis 4 Tg“. */
export function missedLabel(h: TripHolidays): string {
  return `${h.fits.length > 1 ? 'bis ' : ''}${h.maxMissed} Tg`;
}

function wrapCount(text: string, width: number): number {
  return Math.max(1, Math.ceil([...text].length / Math.max(10, width)));
}

interface TipProps {
  anchor: Rect;
  cols: number;
  rows: number;
  width: number;
  height: number;
  title: string;
  tone: 'info' | 'bad';
  children?: React.ReactNode;
}

/** Absolut platzierte Box neben dem Anker: bevorzugt darunter, sonst darüber, immer im Bild. */
export function Tooltip({ anchor, cols, rows, width, height, title, tone, children }: TipProps) {
  const w = Math.min(width, cols - 2);
  const h = Math.min(height, rows - 2);
  const left = Math.max(0, Math.min(anchor.x, cols - w - 1));
  const below = anchor.y + anchor.h;
  const top = below + h <= rows - 1 ? below : Math.max(0, anchor.y - h);
  return (
    <Box
      position="absolute"
      marginLeft={left}
      marginTop={top}
      width={w}
      height={h}
      flexDirection="column"
      borderStyle="round"
      borderColor={tone === 'bad' ? theme.bad : theme.accent}
      backgroundColor={theme.surface}
      paddingX={1}
      overflow="hidden"
    >
      {/* flexShrink 0: zu langer Inhalt wird unten abgeschnitten statt zusammengeschoben */}
      <Box flexDirection="column" flexShrink={0}>
        <Text bold color={tone === 'bad' ? theme.bad : theme.accent}>
          {title}
        </Text>
        {children}
      </Box>
    </Box>
  );
}

/** Sachlicher Tooltip „Gemeinsame Ferien“: Schnittmenge und Status je Land. */
export function commonTip(h: TripHolidays, width: number): { title: string; height: number; body: React.ReactNode } {
  const first = h.fits[0]!;
  const year = Number(first.start.slice(0, 4));
  const states = h.fits.map((f) => f.state);
  const sameType = h.fits.every((f) => f.type === first.type);
  const lines: React.ReactNode[] = [];
  let count = 0;
  if (states.length > 1 && sameType) {
    const cw = commonWindow(states, first.type, year);
    lines.push(
      cw ? (
        <Text key="c">
          Gemeinsame Zeit: <Text bold>{`${dateShort(cw.start)}–${dateDE(cw.end)}`}</Text>
        </Text>
      ) : (
        <Text key="c" color={theme.bad}>
          Keine gemeinsamen {holidayLabel(first.type)} {year}
        </Text>
      ),
    );
    lines.push(<Text key="sp"> </Text>);
    count += 2;
  }
  for (const f of h.fits) {
    const dates = f.missedDates.map((d) => dateWeekday(d)).slice(0, 4);
    const more = f.missedDates.length > 4 ? ' …' : '';
    lines.push(
      <Text key={f.state} wrap="wrap">
        <Text bold>{f.state.padEnd(3)}</Text>
        <Text>
          {f.name} {dateShort(f.start)}–{dateDE(f.end)}
        </Text>
        {f.missed === 0 ? (
          <Text color={theme.good}> ✓</Text>
        ) : (
          <Text color={theme.bad}>
            {' '}
            · {f.missed} {f.missed === 1 ? 'Schultag' : 'Schultage'} ({dates.join(', ')}
            {more})
          </Text>
        )}
      </Text>,
    );
    count += wrapCount(`${f.state} ${f.name} 00.00.–00.00.0000 · 0 Schultage (${dates.join(', ')})`, width - 4);
    const note = stateNote(f.state);
    if (note) {
      lines.push(
        <Text key={`${f.state}-n`} color={theme.faint} wrap="wrap">
          {'   '}
          {note}
        </Text>,
      );
      count += wrapCount(note, width - 7);
    }
  }
  const title = `${sameType ? holidayLabel(first.type) : 'Ferien'} · ${states.join(' + ')}`;
  return { title, height: count + 3, body: lines };
}

/** „Amtlicher Hinweis“ mit den Rechtsgrundlagen der betroffenen Länder (ohne Zahl der Schultage). */
export function noticeTip(
  h: TripHolidays,
  width: number,
  maxHeight = Infinity,
): { title: string; height: number; body: React.ReactNode } | null {
  const affected = h.fits.filter((f) => f.missed > 0);
  if (!affected.length) return null;
  const first = affected[0]!;
  const n = officialNotice(
    affected.map((f) => f.state),
    first.type,
    first.start.slice(0, 4),
  );
  const inner = width - 4;
  const measure = (ls: string[]) => ls.reduce((a, l) => a + (l ? wrapCount(l, inner) : 1), 0) + wrapCount(n.footer, inner) + 3;
  // Wenig Platz: erst Floskeln, dann Leerzeilen, dann „Ferner gilt“ weglassen – Normen und Fußzeile bleiben.
  let lines = n.lines;
  const drops: ((l: string) => boolean)[] = [
    (l) => l.startsWith('Einwendungen'),
    (l) => l.startsWith('Sehr geehrte') || l.startsWith('wir gestatten'),
    (l) => l === '',
    (l) => l.startsWith('Ferner gilt'),
    (l) => l.startsWith('Az.'),
  ];
  for (const drop of drops) {
    if (measure(lines) <= maxHeight) break;
    lines = lines.filter((l) => !drop(l));
  }
  const height = measure(lines);
  const body = (
    <>
      {lines.map((l, i) => (
        <Text key={i} wrap="wrap" color={i < 2 ? theme.muted : undefined}>
          {l || ' '}
        </Text>
      ))}
      <Text color={theme.faint} wrap="wrap">
        {n.footer}
      </Text>
    </>
  );
  return { title: n.title, height, body };
}
