import React from 'react';
import { Box, Text } from 'ink';
import { routeOf } from '../../api/catalog.js';
import { holidayLabel, type ConflictYear, type HolidayConflicts, type HolidayType, type TripHolidays } from '../../domain/holidays.js';
import type { Departure } from '../../domain/types.js';
import { dateDE, dateShort, fit, num, width } from '../format.js';
import type { Rect } from '../mouse/MouseProvider.js';
import type { Shell } from '../shell.js';
import { theme } from '../theme.js';
import { commonTip, fitTypeLabel, missedLabel, noticeTip, Tooltip } from './HolidayTips.js';
import { Clickable } from './ui.js';

/* Bausteine der Reiseübersicht: Ferienspalte mit Tooltips, Erklärbox bei Ferienkonflikten, Vorschau. */

/** Breite der Spalte FERIEN in der Reiseliste. */
export const HOLIDAY_COL_W = 19;

/** FERIEN-Zelle mit zwei Hover-Bereichen: Ferienname (Gemeinsame Ferien) und rote Schultage (Amtlicher Hinweis). */
export function HolidayCell({
  h,
  bg,
  onHover,
}: {
  h: TripHolidays | undefined;
  bg: string | undefined;
  onHover: (kind: 'common' | 'notice', inside: boolean, rect: Rect | null) => void;
}) {
  if (!h) return <Text backgroundColor={bg}>{' '.repeat(HOLIDAY_COL_W + 1)}</Text>;
  const ok = h.maxMissed === 0;
  const label = `${ok ? '✓ ' : ''}${fitTypeLabel(h)}`;
  const missed = ok ? '' : ` · ${missedLabel(h)}`;
  const shownLabel = fit(label, Math.max(4, HOLIDAY_COL_W - width(missed))).trimEnd();
  const pad = Math.max(0, HOLIDAY_COL_W - width(shownLabel) - width(missed)) + 1;
  return (
    <Box flexShrink={0}>
      <Clickable onHover={(inside, ev) => onHover('common', inside, ev?.rect ?? null)}>
        <Text backgroundColor={bg} color={ok ? theme.good : undefined}>
          {shownLabel}
        </Text>
      </Clickable>
      {missed ? (
        <Clickable onHover={(inside, ev) => onHover('notice', inside, ev?.rect ?? null)}>
          <Text backgroundColor={bg} color={theme.bad} bold>
            {missed}
          </Text>
        </Clickable>
      ) : null}
      <Text backgroundColor={bg}>{' '.repeat(pad)}</Text>
    </Box>
  );
}

/** Tooltip zur FERIEN-Zelle: per Hover an der Zelle, per Tastatur rechts oben. */
export function HolidayTooltips({
  tip,
  h,
  cols,
  rows,
}: {
  tip: { kind: 'common' | 'notice'; rect: Rect; pinned?: boolean };
  h: TripHolidays | undefined;
  cols: number;
  rows: number;
}) {
  if (!h) return null;
  const width = Math.min(64, cols - 4);
  const anchorY = tip.pinned ? 5 : tip.rect.y;
  // Platz unter bzw. über der Zelle, je nachdem wo mehr frei ist
  const room = tip.pinned ? rows - 6 : Math.max(rows - 1 - (tip.rect.y + tip.rect.h), anchorY);
  const t = tip.kind === 'notice' ? noticeTip(h, width, room) : commonTip(h, width);
  if (!t) return null;
  // Per Tastatur geöffnet: rechts oben über der Vorschau
  const anchor = tip.pinned ? { x: Math.max(0, cols - width - 1), y: 5, w: width, h: 0 } : tip.rect;
  return (
    <Tooltip anchor={anchor} cols={cols} rows={rows} width={width} height={t.height} title={t.title} tone={tip.kind === 'notice' ? 'bad' : 'info'}>
      {t.body}
    </Tooltip>
  );
}

/** Erklärbox, wenn Ferienkonflikte zu einer leeren Liste führen. */
export function ConflictBox({ conflicts, states }: { conflicts: HolidayConflicts; states: string[] }) {
  const byType = new Map<HolidayType, ConflictYear[]>();
  for (const y of conflicts.years) byType.set(y.type, [...(byType.get(y.type) ?? []), y]);
  return (
    <Box flexDirection="column" paddingX={1}>
      {conflicts.errors.map((e, i) => (
        <Text key={`e${i}`} color={theme.bad} bold wrap="wrap">
          ✕ {e}
        </Text>
      ))}
      {conflicts.warnings.map((w, i) => (
        <Text key={`w${i}`} color={theme.warn} wrap="wrap">
          ! {w}
        </Text>
      ))}
      {[...byType.entries()].map(([type, ys]) => (
        <Box key={type} flexDirection="column" marginTop={1}>
          <Text color={theme.faint} bold>
            {holidayLabel(type).toUpperCase()} JE JAHR
          </Text>
          {ys.map((y) => (
            <Text key={y.year} wrap="truncate">
              <Text bold>{y.year}  </Text>
              {y.perState.map((p, i) => (
                <Text key={p.state}>
                  {i > 0 ? <Text color={theme.faint}>  ·  </Text> : null}
                  <Text bold>{p.state} </Text>
                  {p.period ? `${dateShort(p.period.start)}–${dateShort(p.period.end)}` : <Text color={theme.faint}>keine</Text>}
                </Text>
              ))}
              {y.common ? (
                <Text color={theme.good}>
                  {'  '}✓ gemeinsam {dateShort(y.common.start)}–{dateShort(y.common.end)}
                </Text>
              ) : states.length > 1 ? (
                <Text color={theme.bad}>{'  '}✕ keine gemeinsame Zeit</Text>
              ) : null}
            </Text>
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={theme.muted} wrap="wrap">
          Tipp: andere Ferienart wählen, ein Bundesland entfernen (✕ am Chip) oder den ferien:-Filter weglassen.
        </Text>
      </Box>
    </Box>
  );
}

/** Vorschau der markierten Reise: Eckdaten, Route und weitere Termine derselben Route. */
export function Preview({ dep, shell, height, width }: { dep: Departure; shell: Shell; height: number; width: number }) {
  const route = routeOf(shell.catalog.catalog!, dep);
  const ports = (route?.ports ?? []).map((p) => p.name).filter((n, i, a) => n !== a[i - 1]);
  const others = route?.departures ?? [];
  const portRows = Math.max(1, height - 9);
  const shownPorts = ports.length > portRows ? [...ports.slice(0, portRows - 1), `… ${ports.length - portRows + 1} weitere`] : ports;
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold wrap="truncate">
        {dep.title}
      </Text>
      <Text color={theme.muted} wrap="truncate">
        {dep.shipName} · {dep.duration} Tage · {dateDE(dep.startDate)}
      </Text>
      <Text wrap="truncate">
        {dep.fromPricePerPerson ? (
          <>
            <Text color={theme.good} bold>
              ab {num(dep.fromPricePerPerson)} € p.P.
            </Text>
            <Text color={theme.faint}> (2 Erw.)</Text>
          </>
        ) : (
          <Text color={theme.faint}>Preis bei Auswahl</Text>
        )}
        {dep.campaigns.length ? <Text color={theme.warn}> · {dep.campaigns[0]}</Text> : null}
      </Text>
      <Box height={1} />
      <Text color={theme.faint} bold>
        ROUTE
      </Text>
      {shownPorts.map((p, i) => (
        <Text key={i} color={p === 'Seetag' ? theme.faint : undefined} wrap="truncate">
          {i === 0 ? '◉ ' : i === shownPorts.length - 1 ? '◉ ' : '│ '}
          {p}
        </Text>
      ))}
      {others.length > 1 ? (
        <>
          <Box height={1} />
          <Text color={theme.faint} bold>
            WEITERE TERMINE
          </Text>
          <Box flexWrap="wrap" width={width}>
            {others.slice(0, 12).map((o) => (
              <Clickable key={o.journeyId} onClick={() => shell.openTrip(o.journeyId)} marginRight={1}>
                <Text
                  backgroundColor={o.journeyId === dep.journeyId ? theme.accentBg : theme.chipBg}
                  color={o.journeyId === dep.journeyId ? theme.accent : undefined}
                >
                  {` ${dateShort(o.startDate)}${o.startDate.slice(2, 4)} `}
                </Text>
              </Clickable>
            ))}
          </Box>
        </>
      ) : null}
    </Box>
  );
}
