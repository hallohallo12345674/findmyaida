import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { STATES } from '../../domain/holidays.js';
import { fit } from '../format.js';
import { useKeys } from '../input.js';
import { windowAround } from '../layout.js';
import { theme } from '../theme.js';
import { Button, Clickable, Dialog } from './ui.js';

interface DialogBase {
  cols: number;
  rows: number;
  onClose: () => void;
}

// ------------------------------------------------------------------ Heimatflughäfen

/** Mehrfachauswahl der Flughäfen; leere Auswahl heißt „alle“. */
export function AirportsDialog({
  airports,
  selected,
  error,
  onApply,
  ...base
}: DialogBase & {
  airports: { code: string; name: string }[];
  selected: string[];
  error: string | null;
  onApply: (codes: string[]) => void;
}) {
  // Gewählte, die aida.de gerade nicht anbietet, bleiben sichtbar und abwählbar.
  const list = [
    ...airports,
    ...selected.filter((c) => !airports.some((a) => a.code === c)).map((code) => ({ code, name: 'derzeit nicht im Angebot' })),
  ];
  const [draft, setDraft] = useState<string[]>(selected);
  const [cursor, setCursor] = useState(0);
  const toggle = (code: string) =>
    setDraft((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code].sort()));
  useKeys((input, key) => {
    if (key.escape) return base.onClose();
    if (key.return) return onApply(draft);
    if (key.upArrow) return setCursor(Math.max(0, cursor - 1));
    if (key.downArrow) return setCursor(Math.min(list.length - 1, cursor + 1));
    if (input === ' ' && list[cursor]) return toggle(list[cursor]!.code);
  });
  const [start, end] = windowAround(list.length, cursor, Math.max(3, base.rows - 12));
  return (
    <Dialog title="Heimatflughäfen" width={52} screenCols={base.cols} screenRows={base.rows} onClose={base.onClose}>
      <Text color={theme.muted} wrap="wrap">
        Vorauswahl für Abflug und Rückflug. Ohne Auswahl gelten alle Flughäfen.
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {error ? <Text color={theme.warn}>{error}</Text> : null}
        {!error && !list.length ? <Text color={theme.muted}>Flughäfen werden geladen …</Text> : null}
        {list.slice(start, end).map((a, i) => {
          const idx = start + i;
          const on = draft.includes(a.code);
          const active = idx === cursor;
          return (
            <Clickable
              key={a.code}
              onClick={() => {
                setCursor(idx);
                toggle(a.code);
              }}
            >
              <Text backgroundColor={active ? theme.accentBg : undefined} wrap="truncate">
                <Text color={on ? theme.accent : theme.faint} backgroundColor={active ? theme.accentBg : undefined}>
                  {on ? ' ■ ' : ' □ '}
                </Text>
                <Text bold={on} backgroundColor={active ? theme.accentBg : undefined}>
                  {a.code}
                </Text>
                <Text color={theme.muted} backgroundColor={active ? theme.accentBg : undefined}>{`  ${fit(a.name, 36)}`}</Text>
              </Text>
            </Clickable>
          );
        })}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Text color={theme.faint}>Leertaste wählt</Text>
        <Box flexShrink={0}>
          <Button label="Alle" onClick={() => setDraft([])} />
          <Text> </Text>
          <Button label="Übernehmen ⏎" primary onClick={() => onApply(draft)} />
        </Box>
      </Box>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Bundesland

/** Einfachauswahl des Bundeslands für Schulferien, „Keins“ zuerst. */
export function StateDialog({
  selected,
  onApply,
  ...base
}: DialogBase & { selected: string | null; onApply: (code: string | null) => void }) {
  const options: { code: string | null; name: string }[] = [{ code: null, name: 'Kein Bundesland' }, ...STATES];
  const [cursor, setCursor] = useState(Math.max(0, options.findIndex((o) => o.code === selected)));
  useKeys((_input, key) => {
    if (key.escape) return base.onClose();
    if (key.return) return onApply(options[cursor]?.code ?? null);
    if (key.upArrow) return setCursor(Math.max(0, cursor - 1));
    if (key.downArrow) return setCursor(Math.min(options.length - 1, cursor + 1));
  });
  const [start, end] = windowAround(options.length, cursor, Math.max(3, base.rows - 8));
  return (
    <Dialog title="Bundesland für Schulferien" width={44} screenCols={base.cols} screenRows={base.rows} onClose={base.onClose}>
      <Box flexDirection="column" marginTop={1}>
        {options.slice(start, end).map((o, i) => {
          const idx = start + i;
          const active = idx === cursor;
          const current = o.code === selected;
          return (
            <Clickable key={o.code ?? '-'} onClick={() => onApply(o.code)}>
              <Text backgroundColor={active ? theme.accentBg : undefined} color={current ? theme.accent : undefined} wrap="truncate">
                {current ? ' ● ' : '   '}
                <Text bold={current} backgroundColor={active ? theme.accentBg : undefined}>
                  {o.code ? o.code.padEnd(4) : '    '}
                </Text>
                {o.name}
              </Text>
            </Clickable>
          );
        })}
      </Box>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Texteingabe

/** Eingabefeld für Pfade und Zahlen; `validate` liefert eine Fehlermeldung oder null. */
export function TextDialog({
  title,
  description,
  initial,
  placeholder,
  validate,
  onApply,
  ...base
}: DialogBase & {
  title: string;
  description: string;
  initial: string;
  placeholder?: string;
  validate: (v: string) => string | null;
  onApply: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const err = validate(value.trim());
    if (err) return setError(err);
    onApply(value.trim());
  };
  useKeys((input, key) => {
    if (key.escape) return base.onClose();
    if (key.return) return submit();
    if (key.backspace || key.delete) return setValue((v) => v.slice(0, -1));
    if (key.ctrl && input === 'u') return setValue('');
    if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
    // Eingefügter Text kommt als ein Stück; Zeilenumbrüche daraus entfernen.
    if (input) {
      setValue((v) => v + input.replace(/[\r\n]/g, ''));
      setError(null);
    }
  });
  const width = Math.min(base.cols - 4, 72);
  const fieldW = width - 6;
  const shown = value.length > fieldW - 1 ? `…${value.slice(-(fieldW - 2))}` : value;
  return (
    <Dialog title={title} width={width} screenCols={base.cols} screenRows={base.rows} onClose={base.onClose}>
      <Text color={theme.muted} wrap="wrap">
        {description}
      </Text>
      <Box marginTop={1} borderStyle="round" borderColor={error ? theme.bad : theme.borderFocus} paddingX={1}>
        <Text wrap="truncate">
          {shown ? <Text>{shown}</Text> : <Text color={theme.faint}>{placeholder ?? ''}</Text>}
          <Text color={theme.accent}>▏</Text>
        </Text>
      </Box>
      <Text color={error ? theme.bad : theme.faint} wrap="truncate">
        {error ?? 'Ctrl+U leert das Feld'}
      </Text>
      <Box marginTop={1} justifyContent="flex-end">
        <Button label="Abbrechen" onClick={base.onClose} />
        <Text> </Text>
        <Button label="Übernehmen ⏎" primary onClick={submit} />
      </Box>
    </Dialog>
  );
}
