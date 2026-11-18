import React from 'react';
import { Box, Text } from 'ink';
import type { Favorite } from '../../domain/favorites.js';
import { checkGroupKey, configLine, deltaTone, favoriteView, formatDelta, type FavoriteView } from '../favorites.js';
import { dateWeekday, euroDetail, fit, width as textWidth } from '../format.js';
import type { CheckStatus } from '../hooks/favorites.js';
import { theme } from '../theme.js';
import { Clickable } from './ui.js';

export interface FavoriteItem {
  fav: Favorite;
  /** auf der Startseite entfernt, aber noch zurückholbar */
  ghost: boolean;
}

interface Props {
  items: FavoriteItem[];
  /** sichtbarer Ausschnitt [start, end) */
  start: number;
  end: number;
  /** markierter Eintrag (Index in items) oder -1 */
  cursor: number;
  width: number;
  checks: Map<string, CheckStatus>;
  today: string;
  deltaMode: 'euro' | 'percent';
  /** Änderungen ab diesem Betrag farbig */
  threshold: number;
  onClick: (i: number, double: boolean) => void;
  onToggle: (i: number) => void;
  onWheel: (dir: -1 | 1) => void;
}

/** Rechte Spalte der ersten Zeile: Preis und Änderung bzw. Status. */
function statusOf(v: FavoriteView): { text: string; color: string; delta?: number } {
  switch (v.kind) {
    case 'checking':
      return { text: 'prüfe …', color: theme.muted };
    case 'departed':
      return { text: 'abgefahren', color: theme.faint };
    case 'unavailable':
      return { text: 'nicht verfügbar', color: theme.warn };
    case 'error':
      return { text: 'nicht geprüft', color: theme.bad };
    case 'price':
      return { text: euroDetail(v.total), color: v.stale ? theme.muted : '', delta: v.delta };
  }
}

/** Rechte Spalte der zweiten Zeile: Grund oder Stand; im Normalfall leer. */
function noteOf(v: FavoriteView): { text: string; color: string } {
  if (v.kind === 'unavailable') return { text: v.reason + (v.stale ? ` (Stand ${v.stale})` : ''), color: theme.warn };
  if (v.kind === 'error') return { text: v.text, color: theme.bad };
  if (v.kind === 'price' && v.stale) return { text: `Stand ${v.stale}${v.error ? ' · nicht geprüft' : ''}`, color: theme.muted };
  return { text: '', color: theme.faint };
}

const DELTA_W = 9;

/** Favoriten der Startseite: je zwei Zeilen, Stern zum (Wieder-)Merken, Preis und Änderung seit dem Speichern. */
export function FavoriteList({
  items,
  start,
  end,
  cursor,
  width,
  checks,
  today,
  deltaMode,
  threshold,
  onClick,
  onToggle,
  onWheel,
}: Props) {
  return (
    <Clickable flexDirection="column" onWheel={(dir) => onWheel(dir)}>
      {items.slice(start, end).map((item, k) => {
        const i = start + k;
        const { fav, ghost } = item;
        const active = i === cursor;
        const v = favoriteView(fav, checks.get(checkGroupKey(fav)), today);
        const st = statusOf(v);
        const note = noteOf(v);
        const bg = active ? theme.accentBg : undefined;
        const dim = ghost ? theme.faint : undefined;
        const deltaText = st.delta === undefined ? '' : formatDelta(st.delta, fav.saved.total, deltaMode).padStart(DELTA_W);
        const tone = st.delta === undefined ? 'flat' : deltaTone(st.delta, threshold);
        const right = st.text + deltaText;
        const titleW = Math.max(8, width - 2 - 13 - textWidth(right) - 2);
        const noteText = ghost ? 'entfernt · ⌫ oder ☆ holt zurück' : note.text;
        const configW = Math.max(8, width - 4 - (noteText ? textWidth(noteText) + 2 : 0));
        return (
          <Clickable key={fav.id} flexDirection="column" onClick={(e) => onClick(i, e.double)}>
            <Box>
              <Clickable onClick={() => onToggle(i)}>
                <Text backgroundColor={bg} color={ghost ? theme.faint : theme.favorite}>
                  {ghost ? '☆' : '★'}{' '}
                </Text>
              </Clickable>
              <Text backgroundColor={bg} color={dim ?? (active ? theme.accent : undefined)} bold={active} wrap="truncate">
                {fit(`${dateWeekday(fav.trip.startDate)}${fav.trip.startDate.slice(2, 4)}`, 12)} {fit(fav.trip.title, titleW)}
              </Text>
              <Box flexGrow={1}>
                <Text backgroundColor={bg}> </Text>
              </Box>
              <Text backgroundColor={bg} color={dim ?? (st.color || undefined)} bold={!ghost && v.kind === 'price'}>
                {st.text}
              </Text>
              {st.delta !== undefined ? (
                <Text backgroundColor={bg} color={dim ?? (tone === 'down' ? theme.good : tone === 'up' ? theme.bad : theme.muted)}>
                  {deltaText}
                </Text>
              ) : null}
            </Box>
            <Box>
              <Text backgroundColor={bg} color={dim ?? theme.muted} wrap="truncate">
                {'    '}
                {fit(configLine(fav), configW)}
              </Text>
              <Box flexGrow={1}>
                <Text backgroundColor={bg}> </Text>
              </Box>
              <Text backgroundColor={bg} color={dim ?? note.color} wrap="truncate">
                {noteText}
              </Text>
            </Box>
          </Clickable>
        );
      })}
    </Clickable>
  );
}
