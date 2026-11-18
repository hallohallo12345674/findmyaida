import React from 'react';
import { Box, Text, type Key } from 'ink';
import { isPrintable } from '../input.js';
import {
  KIND_LABEL,
  removeLastChip,
  visibleCommands,
  type Suggestion,
  type TripQuery,
} from '../search/query.js';
import { theme } from '../theme.js';
import { Clickable } from './ui.js';

export interface SearchKeyResult {
  query?: TripQuery;
  sel?: number;
  accept?: Suggestion;
  handled: boolean;
}

/** Tastenlogik des Suchfelds. Nicht behandelte Tasten (↑↓, ⏎, Esc …) bleiben dem Bildschirm. */
export function handleSearchKey(q: TripQuery, sugg: Suggestion[], sel: number, input: string, key: Key): SearchKeyResult {
  if (key.tab && sugg.length) return { accept: sugg[Math.min(sel, sugg.length - 1)]!, handled: true };
  if (key.tab) return { handled: true };
  if ((key.leftArrow || key.rightArrow) && sugg.length > 1) {
    const n = sugg.length;
    return { sel: (sel + (key.rightArrow ? 1 : n - 1)) % n, handled: true };
  }
  if (key.backspace || key.delete) {
    if (q.text) return { query: { ...q, text: q.text.slice(0, -1) }, sel: 0, handled: true };
    if (q.chips.length) return { query: removeLastChip(q), sel: 0, handled: true };
    return { handled: true };
  }
  if (key.ctrl && input === 'u') return { query: { ...q, text: '' }, sel: 0, handled: true };
  if (isPrintable(input, key)) {
    // Nicht mit Leerzeichen beginnen und keine doppelten Leerzeichen.
    if (input === ' ' && (!q.text || q.text.endsWith(' '))) return { handled: true };
    return { query: { ...q, text: q.text + input }, sel: 0, handled: true };
  }
  return { handled: false };
}

function suggestionLabel(s: Suggestion): { kind: string; label: string } {
  if (s.type === 'chip') return { kind: KIND_LABEL[s.chip.kind], label: s.chip.long ?? s.chip.label };
  if (s.type === 'slash') return { kind: `/${s.command}`, label: s.label };
  return { kind: 'Befehl', label: s.insert };
}

interface Props {
  query: TripQuery;
  suggestions: Suggestion[];
  sel: number;
  focused: boolean;
  placeholder?: string;
  onRemoveChip: (i: number) => void;
  onAccept: (s: Suggestion) => void;
  onInsertCommand: (cmd: string) => void;
  /** rechts in der Hinweiszeile, z. B. „⏎ suchen“ */
  rightHint?: string;
  /** Statt der Befehlshinweise einen Status anzeigen (z. B. „Region wird geladen …“) */
  status?: React.ReactNode;
}

/** Eingabezeile mit Filter-Chips; darunter Vorschläge bzw. Befehlshinweise. */
export function SearchLine({ query, focused, placeholder, onRemoveChip }: Pick<Props, 'query' | 'focused' | 'placeholder' | 'onRemoveChip'>) {
  const empty = !query.text && !query.chips.length;
  return (
    <Box height={1} overflow="hidden">
      <Text color={focused ? theme.accent : theme.muted}>⌕ </Text>
      {query.chips.map((c, i) => (
        <Clickable key={`${c.kind}-${c.value}`} onClick={() => onRemoveChip(i)} marginRight={1} flexShrink={0}>
          <Text backgroundColor={theme.accentBg}>
            <Text color={theme.muted} backgroundColor={theme.accentBg}>
              {' '}
              {KIND_LABEL[c.kind]}:{' '}
            </Text>
            <Text color={theme.accent} backgroundColor={theme.accentBg} bold>
              {c.label}
            </Text>
            <Text color={theme.muted} backgroundColor={theme.accentBg}>
              {' ✕ '}
            </Text>
          </Text>
        </Clickable>
      ))}
      <Text wrap="truncate-start">
        {query.text}
        {focused ? <Text color={theme.accent}>▏</Text> : null}
        {empty && placeholder ? <Text color={theme.faint}>{placeholder}</Text> : null}
      </Text>
    </Box>
  );
}

export function SuggestionLine({
  query,
  suggestions,
  sel,
  onAccept,
  onInsertCommand,
  rightHint,
  status,
}: Omit<Props, 'focused' | 'placeholder' | 'onRemoveChip'>) {
  return (
    <Box height={1} overflow="hidden" justifyContent="space-between" flexGrow={1}>
      <Box overflow="hidden" flexShrink={1}>
        {suggestions.length ? (
          <>
            <Box flexShrink={0}>
              <Text color={theme.faint}>Tab ↹ </Text>
            </Box>
            {suggestions.map((s, i) => {
              const { kind, label } = suggestionLabel(s);
              const active = i === sel;
              return (
                <Clickable key={i} onClick={() => onAccept(s)} marginRight={1} flexShrink={0}>
                  <Text backgroundColor={active ? theme.accentBg : theme.chipBg}>
                    <Text color={theme.muted} backgroundColor={active ? theme.accentBg : theme.chipBg}>
                      {' '}
                      {kind}{' '}
                    </Text>
                    <Text color={active ? theme.accent : undefined} backgroundColor={active ? theme.accentBg : theme.chipBg} bold={active}>
                      {label}{' '}
                    </Text>
                  </Text>
                </Clickable>
              );
            })}
          </>
        ) : status ? (
          status
        ) : (
          <>
            {visibleCommands(query).map((c) => (
              <Clickable key={c.key} onClick={() => onInsertCommand(c.key)} marginRight={2} flexShrink={0}>
                <Text color={theme.muted}>{c.key}</Text>
              </Clickable>
            ))}
            <Text color={theme.faint}>/alle /hilfe</Text>
          </>
        )}
      </Box>
      {rightHint ? (
        <Box flexShrink={0} marginLeft={1}>
          <Text color={theme.faint}>{rightHint}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
