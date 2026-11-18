/**
 * Kleine, klickbare UI-Bausteine: Clickable, Chip, Button, Segmented, Tabs, KeyHints, Panel, Dialog.
 */
import React, { useRef } from 'react';
import { Box, Text, type BoxProps, type DOMElement } from 'ink';
import { LayerContext, useClickable, type ClickHandlers, type LocalMouse } from '../mouse/MouseProvider.js';
import { theme } from '../theme.js';

type ClickableProps = Omit<BoxProps, 'ref'> & ClickHandlers & { children?: React.ReactNode };

export function Clickable({ onClick, onWheel, onHover, children, ...box }: ClickableProps) {
  const ref = useRef<DOMElement>(null);
  useClickable(ref, { ...(onClick ? { onClick } : {}), ...(onWheel ? { onWheel } : {}), ...(onHover ? { onHover } : {}) });
  return (
    <Box ref={ref} {...box}>
      {children}
    </Box>
  );
}

/** Auswahl-Chip, z. B. „Tarif alle ▾“. */
export function Chip({
  label,
  value,
  active = false,
  onClick,
  caret = true,
}: {
  label?: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
  caret?: boolean;
}) {
  // Innere Texte bekommen den Hintergrund ausdrücklich: Ink vererbt sonst den einer umgebenden Box (z. B. beim
  // Übermalen im hellen Schema) statt den des äußeren Textes.
  const bg = active ? theme.accentBg : theme.chipBg;
  return (
    <Clickable {...(onClick ? { onClick: () => onClick() } : {})} flexShrink={0}>
      <Text backgroundColor={bg}>
        {' '}
        {label ? (
          <Text color={theme.muted} backgroundColor={bg}>
            {label}{' '}
          </Text>
        ) : null}
        <Text color={active ? theme.accent : undefined} backgroundColor={bg} bold={active}>
          {value}
        </Text>
        {caret ? (
          <Text color={theme.muted} backgroundColor={bg}>
            {' ▾'}
          </Text>
        ) : null}{' '}
      </Text>
    </Clickable>
  );
}

export function Button({
  label,
  onClick,
  primary = false,
  hotkey,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  hotkey?: string;
}) {
  return (
    <Clickable onClick={() => onClick()} flexShrink={0}>
      <Text backgroundColor={primary ? theme.accent : theme.chipBg} color={primary ? theme.selFg : undefined} bold={primary}>
        {` ${label} `}
      </Text>
      {hotkey ? <Text color={theme.faint}> {hotkey}</Text> : null}
    </Clickable>
  );
}

/** Segmentschalter wie „Gesamt │ p.P.“. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <Box flexShrink={0}>
      {options.map((o, i) => (
        <Clickable key={o.value} onClick={() => onChange(o.value)}>
          <Text
            backgroundColor={o.value === value ? theme.accentBg : theme.chipBg}
            color={o.value === value ? theme.accent : theme.muted}
            bold={o.value === value}
          >
            {i > 0 ? '│' : ' '}
            {o.label}
            {i === options.length - 1 ? ' ' : ''}
          </Text>
        </Clickable>
      ))}
    </Box>
  );
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Clickable onClick={() => onChange(!on)} flexShrink={0}>
      <Text backgroundColor={on ? theme.accentBg : theme.chipBg} color={on ? theme.accent : theme.muted} bold={on}>
        {` ${on ? '■' : '□'} ${label} `}
      </Text>
    </Clickable>
  );
}

export function Tabs<T extends string | number>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; key?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <Box flexShrink={0}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <Clickable key={String(t.id)} onClick={() => onChange(t.id)} marginRight={1}>
            <Text backgroundColor={active ? theme.accent : undefined} color={active ? theme.selFg : theme.muted} bold={active}>
              {' '}
              {t.key ? (
                <Text color={active ? theme.selFg : theme.faint} backgroundColor={active ? theme.accent : undefined}>
                  {t.key}{' '}
                </Text>
              ) : null}
              {t.label}{' '}
            </Text>
          </Clickable>
        );
      })}
    </Box>
  );
}

export interface Hint {
  key: string;
  label: string;
}

/** Fußzeile mit Tastenhinweisen (Taste akzentuiert, Text gedimmt) und optionaler Meldung rechts. */
export function KeyHints({ hints, message, tone = 'info' }: { hints: Hint[]; message?: string | null; tone?: 'info' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? theme.bad : tone === 'warn' ? theme.warn : theme.accent;
  return (
    <Box paddingX={1} justifyContent="space-between" height={1}>
      <Text wrap="truncate">
        {hints.map((h, i) => (
          <Text key={i}>
            <Text color={theme.accent} bold>
              {h.key}
            </Text>
            <Text color={theme.muted}> {h.label}</Text>
            {i < hints.length - 1 ? '   ' : ''}
          </Text>
        ))}
      </Text>
      {message ? (
        <Box flexShrink={0} marginLeft={2}>
          <Text color={color} wrap="truncate">
            {message}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** Füllt den Rest einer Zeile mit Rahmenstrichen. */
function Rule({ color }: { color: string }) {
  return (
    <Box flexGrow={1} flexShrink={1} flexBasis={0} height={1} overflow="hidden">
      <Text color={color} wrap="wrap">
        {'─'.repeat(400)}
      </Text>
    </Box>
  );
}

/** Abgerundeter Rahmen mit Titel (links) und optionalem Zusatz (rechts) in der oberen Rahmenlinie. */
export function Panel({
  title,
  right,
  footer,
  focused = false,
  children,
  ...box
}: Omit<BoxProps, 'ref'> & {
  title?: React.ReactNode;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  focused?: boolean;
  children?: React.ReactNode;
}) {
  const color = focused ? theme.borderFocus : theme.border;
  return (
    <Box flexDirection="column" {...box}>
      <Box height={1} flexShrink={0}>
        <Text color={color}>╭─</Text>
        {title ? (
          <Box flexShrink={0}>
            <Text> </Text>
            {typeof title === 'string' ? <Text bold>{title}</Text> : title}
            <Text> </Text>
          </Box>
        ) : null}
        <Rule color={color} />
        {right ? (
          <Box flexShrink={0}>
            <Text> </Text>
            {typeof right === 'string' ? <Text color={theme.muted}>{right}</Text> : right}
            <Text> </Text>
          </Box>
        ) : null}
        <Text color={color}>─╮</Text>
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="round"
        borderTop={false}
        borderBottom={!footer}
        borderColor={color}
        overflow="hidden"
      >
        {/* nicht stauchen, sondern abschneiden – sonst überlappen Zeilen in kleinen Terminals */}
        <Box flexDirection="column" flexShrink={0}>
          {children}
        </Box>
      </Box>
      {footer ? (
        <Box height={1} flexShrink={0}>
          <Text color={color}>╰─</Text>
          <Box flexShrink={0}>
            <Text> </Text>
            {footer}
            <Text> </Text>
          </Box>
          <Rule color={color} />
          <Text color={color}>─╯</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Zentrierter Dialog über der aktuellen Ansicht. Klickflächen darin liegen eine Ebene höher (modal);
 * ein Klick daneben schließt den Dialog.
 */
export function Dialog({
  title,
  width,
  height,
  screenCols,
  screenRows,
  onClose,
  children,
}: {
  title: string;
  width: number;
  height?: number;
  screenCols: number;
  screenRows: number;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const w = Math.min(width, screenCols - 2);
  const h = height ? Math.min(height, screenRows - 2) : undefined;
  const left = Math.max(0, Math.floor((screenCols - w) / 2));
  const top = Math.max(0, Math.floor((screenRows - (h ?? Math.min(screenRows - 2, 20))) / 2));
  return (
    <LayerContext.Provider value={1}>
      <Backdrop cols={screenCols} rows={screenRows} onClose={onClose} />
      <Box
        position="absolute"
        marginLeft={left}
        marginTop={top}
        width={w}
        {...(h ? { height: h } : {})}
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.accent}
        backgroundColor={theme.surface}
        paddingX={1}
      >
        <Box justifyContent="space-between" height={1}>
          <Text bold color={theme.accent}>
            {title}
          </Text>
          <Clickable onClick={() => onClose()}>
            <Text color={theme.muted}> ✕ </Text>
          </Clickable>
        </Box>
        {children}
      </Box>
    </LayerContext.Provider>
  );
}

function Backdrop({ cols, rows, onClose }: { cols: number; rows: number; onClose: () => void }) {
  const ref = useRef<DOMElement>(null);
  useClickable(ref, { onClick: () => onClose(), onWheel: () => undefined });
  return <Box ref={ref} position="absolute" width={cols} height={rows} />;
}

export type { LocalMouse };
