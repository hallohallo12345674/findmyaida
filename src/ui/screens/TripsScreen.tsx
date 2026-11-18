import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { holidayConflicts, type HolidayConflicts, type TripHolidays } from '../../domain/holidays.js';
import type { Departure } from '../../domain/types.js';
import type { TripSortField } from '../../store/state.js';
import { SmallLogo } from '../components/Logo.js';
import { handleSearchKey, SearchLine, SuggestionLine } from '../components/SmartSearch.js';
import { ConflictBox, HOLIDAY_COL_W, HolidayCell, HolidayTooltips, Preview } from '../components/tripParts.js';
import { Clickable, KeyHints, Panel } from '../components/ui.js';
import { dateWeekday, fit, fitRight, num } from '../format.js';
import { useRegions } from '../hooks/data.js';
import { useKeys } from '../input.js';
import { windowAround } from '../layout.js';
import {
  acceptSuggestion,
  buildContext,
  EMPTY_QUERY,
  filterTrips,
  hasOrphanHolidayCommand,
  holidayTypes,
  isEmptyQuery,
  regionCodes,
  stateCodes,
  removeChip,
  resolveCommands,
  suggest,
  type Suggestion,
  type TripQuery,
} from '../search/query.js';
import { buildIndex } from '../search.js';
import type { Rect } from '../mouse/MouseProvider.js';
import { baseQuery } from '../settings.js';
import { BridgeStatus, SettingsLink, SetupHint, type Shell } from '../shell.js';
import { theme } from '../theme.js';

type Entry = { kind: 'header'; label: string } | { kind: 'dep'; dep: Departure; key: string };

type Col = { field: TripSortField; label: string; w: number; right?: boolean };
const BASE_COLS: Col[] = [
  { field: 'date', label: 'DATUM', w: 13 },
  { field: 'route', label: 'ROUTE', w: 0 },
  { field: 'ship', label: 'SCHIFF', w: 11 },
  { field: 'duration', label: 'TAGE', w: 5, right: true },
  { field: 'price', label: 'AB p.P.', w: 10, right: true },
];
const HOLIDAY_COL: Col = { field: 'holiday', label: 'FERIEN', w: HOLIDAY_COL_W };

function sortDeps(list: Departure[], field: TripSortField, desc: boolean, holiday: Map<string, TripHolidays>): Departure[] {
  const cmp = (a: Departure, b: Departure): number => {
    switch (field) {
      case 'holiday':
        return (
          (holiday.get(a.journeyId)?.maxMissed ?? 999) - (holiday.get(b.journeyId)?.maxMissed ?? 999) ||
          a.startDate.localeCompare(b.startDate)
        );
      case 'date':
        return a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title);
      case 'route':
        return a.title.localeCompare(b.title) || a.startDate.localeCompare(b.startDate);
      case 'ship':
        return a.shipName.localeCompare(b.shipName) || a.startDate.localeCompare(b.startDate);
      case 'duration':
        return a.duration - b.duration || a.startDate.localeCompare(b.startDate);
      case 'price':
        return (a.fromPricePerPerson ?? 1e9) - (b.fromPricePerPerson ?? 1e9) || a.startDate.localeCompare(b.startDate);
    }
  };
  const out = list.slice().sort(cmp);
  return desc ? out.reverse() : out;
}

export function TripsScreen({ shell }: { shell: Shell }) {
  const { s, cols, rows, catalog, bridge } = shell;
  const query = s.tripQuery;
  // Immer aktueller Stand, auch wenn mehrere Tasten vor dem nächsten Render ankommen.
  // Leer heißt: nur die Vorgabe aus den Einstellungen (Standard-Bundesland) oder gar nichts.
  const isBaseQuery = (q: TripQuery) => isEmptyQuery(q) || JSON.stringify(q) === JSON.stringify(baseQuery(shell.settings));
  const queryRef = useRef(query);
  queryRef.current = query;
  const setQuery = (q: TripQuery) => {
    queryRef.current = q;
    shell.update({ tripQuery: q });
  };
  const [sel, setSel] = useState(0);
  const [cursor, setCursor] = useState(0);

  const wanted = regionCodes(query);
  const { regions, ids, failed } = useRegions(shell.client, bridge, wanted);
  const ctx = useMemo(() => buildContext(catalog.catalog, regions), [catalog.catalog, regions]);
  const suggestions = useMemo(() => suggest(query, ctx), [query, ctx]);
  const index = useMemo(() => (catalog.catalog ? buildIndex(catalog.catalog) : []), [catalog.catalog]);

  const live = useMemo(() => resolveCommands(query, ctx), [query, ctx]);
  const { deps, pendingRegions, holiday } = useMemo(
    () =>
      catalog.catalog
        ? filterTrips(catalog.catalog, index, live, ids)
        : { deps: [], pendingRegions: [], holiday: new Map<string, TripHolidays>() },
    [catalog.catalog, index, live, ids],
  );
  // Schulferien: alles nur, solange mindestens ein Bundesland gewählt ist.
  const states = stateCodes(live);
  const holidayActive = states.length > 0;
  const types = holidayTypes(live);
  const sortField: TripSortField = s.tripSort.field === 'holiday' && !holidayActive ? 'date' : s.tripSort.field;
  const sorted = useMemo(() => sortDeps(deps, sortField, s.tripSort.desc, holiday), [deps, sortField, s.tripSort.desc, holiday]);
  const years = useMemo(
    () => [...new Set((catalog.catalog?.departures ?? []).map((d) => Number(d.startDate.slice(0, 4))))].sort(),
    [catalog.catalog],
  );
  const conflicts: HolidayConflicts | null = useMemo(
    () => (holidayActive && types.length ? holidayConflicts(states, types, years) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holidayActive, states.join(), types.join(), years],
  );
  const COLS: Col[] = holidayActive ? [BASE_COLS[0]!, BASE_COLS[1]!, HOLIDAY_COL, ...BASE_COLS.slice(2)] : BASE_COLS;
  // Hover-Tooltips (bzw. per Ctrl+T für die markierte Reise)
  const [tip, setTip] = useState<{ kind: 'common' | 'notice'; jid: string; rect: Rect; pinned?: boolean } | null>(null);
  useEffect(() => {
    if (!holidayActive) setTip(null);
  }, [holidayActive]);

  const entries: Entry[] = useMemo(() => {
    if (!isBaseQuery(query) || !s.recent.length || !catalog.catalog) {
      return sorted.map((dep) => ({ kind: 'dep' as const, dep, key: dep.journeyId }));
    }
    const rec = s.recent
      .map((jid) => catalog.catalog!.departures.find((d) => d.journeyId === jid))
      .filter((d): d is Departure => !!d)
      .slice(0, 5);
    return [
      { kind: 'header', label: 'ZULETZT ANGESEHEN' },
      ...rec.map((dep) => ({ kind: 'dep' as const, dep, key: `r-${dep.journeyId}` })),
      { kind: 'header', label: 'ALLE TERMINE' },
      ...sorted.map((dep) => ({ kind: 'dep' as const, dep, key: dep.journeyId })),
    ];
  }, [query, s.recent, sorted, catalog.catalog]);

  const selectable = entries.map((e, i) => (e.kind === 'dep' ? i : -1)).filter((i) => i >= 0);
  const cur = Math.max(0, Math.min(cursor, selectable.length - 1));
  const curEntry = entries[selectable[cur] ?? -1];
  const selected = curEntry && curEntry.kind === 'dep' ? curEntry.dep : undefined;
  // Per Tastatur geöffneter Tooltip gehört zur markierten Reise und schließt beim Weiterblättern.
  useEffect(() => {
    setTip((t) => (t?.pinned && t.jid !== selected?.journeyId ? null : t));
  }, [selected?.journeyId]);

  useEffect(() => setCursor(0), [query.text, query.chips.length, s.tripSort.field, s.tripSort.desc]);

  const move = (d: number) => setCursor((c) => Math.max(0, Math.min(selectable.length - 1, Math.min(c, selectable.length - 1) + d)));

  const accept = (sg: Suggestion) => {
    if (sg.type === 'slash') {
      if (sg.command === 'alle') setQuery(baseQuery(shell.settings));
      else if (sg.command === 'hilfe') {
        setQuery({ ...query, text: '' });
        shell.showHelp();
      } else if (sg.command === 'einstellungen') {
        setQuery({ ...query, text: '' });
        shell.openSettings();
      } else shell.exit();
      return;
    }
    setQuery(acceptSuggestion(queryRef.current, sg));
    setSel(0);
  };

  const sortBy = (field: TripSortField) =>
    shell.update({ tripSort: { field, desc: s.tripSort.field === field ? !s.tripSort.desc : false } });

  useKeys(
    (input, key) => {
      if (key.upArrow) return move(-1);
      if (key.downArrow) return move(1);
      if (key.pageUp) return move(-10);
      if (key.pageDown) return move(10);
      if (key.home) return setCursor(0);
      if (key.end) return setCursor(selectable.length - 1);
      const q = queryRef.current;
      if (key.return) {
        if (q.text.trim().startsWith('/')) {
          const first = suggest(q, ctx)[0];
          if (first) accept(first);
          return;
        }
        if (selected) shell.openTrip(selected.journeyId);
        return;
      }
      if (key.escape) {
        // Esc leert die Suche bis auf die Vorgabe (Standard-Bundesland), danach geht es zur Startseite.
        if (!isBaseQuery(q)) setQuery(baseQuery(shell.settings));
        else shell.go('home');
        return;
      }
      if (input === '?' && !q.text) return shell.showHelp();
      if (key.ctrl && input === 't') {
        // Tastatur: Gemeinsame Ferien → Amtlicher Hinweis (falls Schultage) → aus
        if (!holidayActive || !selected) return;
        const h = holiday.get(selected.journeyId);
        if (!h) return setTip(null);
        const next = !tip?.pinned || tip.jid !== selected.journeyId ? 'common' : tip.kind === 'common' && h.maxMissed > 0 ? 'notice' : null;
        return setTip(next ? { kind: next, jid: selected.journeyId, rect: { x: cols, y: 5, w: 0, h: 0 }, pinned: true } : null);
      }
      const r = handleSearchKey(q, suggest(q, ctx), sel, input, key);
      if (r.accept) return accept(r.accept);
      if (r.query) setQuery(r.query);
      if (r.sel !== undefined) setSel(r.sel);
    },
    { isActive: shell.active },
  );

  // ---------------------------------------------------------------- Layout
  const wide = cols >= 110;
  const previewW = wide ? Math.min(40, Math.floor(cols * 0.32)) : 0;
  const bodyH = rows - 1 - 4 - 1; // Kopf, Suchpanel, Fußzeile
  const listW = cols - previewW;
  const innerW = listW - 2;
  const routeW = Math.max(12, innerW - COLS.reduce((a, c) => a + c.w + 1, 0) - 1);
  const rowsVisible = Math.max(3, bodyH - 3);
  const [start, end] = windowAround(entries.length, selectable[cur] ?? 0, rowsVisible);
  const shown = entries.slice(start, end);

  const sortLabel = `${COLS.find((c) => c.field === sortField)?.label ?? ''} ${s.tripSort.desc ? '▼' : '▲'}`;
  const count = catalog.catalog ? `${sorted.length} ${sorted.length === 1 ? 'Termin' : 'Termine'}` : 'Reisen';
  const statusParts: { text: string; color: string }[] = [];
  if (pendingRegions.length) statusParts.push({ text: 'Region wird bei AIDA geladen …', color: theme.warn });
  else if (failed.some((f) => wanted.includes(f))) statusParts.push({ text: 'Region konnte nicht geladen werden', color: theme.warn });
  if (hasOrphanHolidayCommand(live)) statusParts.push({ text: '! Erst ein Bundesland wählen (land:)', color: theme.warn });
  for (const e of conflicts?.errors ?? []) statusParts.push({ text: `✕ ${e}`, color: theme.bad });
  for (const w of conflicts?.warnings ?? []) statusParts.push({ text: `! ${w}`, color: theme.warn });
  const status = statusParts.length ? (
    <Text wrap="truncate">
      {statusParts.map((p, i) => (
        <Text key={i} color={p.color}>
          {i > 0 ? '  ·  ' : ''}
          {p.text}
        </Text>
      ))}
    </Text>
  ) : null;

  const cell = (c: (typeof COLS)[number], text: string) => {
    const w = c.w || routeW;
    return c.right ? fitRight(text, w) : fit(text, w);
  };

  let listBody: React.ReactNode;
  if (!catalog.catalog) {
    listBody =
      bridge === 'waiting' ? (
        <Box paddingX={1}>
          <SetupHint via={shell.via} extensionDir={shell.extensionDir} />
        </Box>
      ) : (
        <Text color={catalog.error ? theme.bad : theme.muted}> {catalog.error ?? catalog.progress ?? 'Katalog wird geladen …'}</Text>
      );
  } else if (!sorted.length && conflicts && (conflicts.errors.length || conflicts.warnings.length)) {
    listBody = <ConflictBox conflicts={conflicts} states={states} />;
  } else if (!sorted.length) {
    listBody = (
      <Text color={theme.muted}>
        {' '}
        {pendingRegions.length ? 'Region wird geladen …' : 'Keine Reisen gefunden. Esc setzt die Suche zurück.'}
      </Text>
    );
  } else {
    listBody = (
      <Clickable flexDirection="column" flexGrow={1} onWheel={(dir) => move(dir * 3)}>
        <Box>
          <Text> </Text>
          {COLS.map((c) => (
            <Clickable key={c.field} onClick={() => sortBy(c.field)} marginRight={1}>
              <Text color={sortField === c.field ? theme.accent : theme.faint} bold>
                {cell(c, c.label + (sortField === c.field ? (s.tripSort.desc ? ' ▼' : ' ▲') : ''))}
              </Text>
            </Clickable>
          ))}
        </Box>
        {shown.map((e, i) => {
          if (e.kind === 'header')
            return (
              <Text key={`h-${start + i}`} color={theme.faint} bold>
                {' '}
                {e.label}
              </Text>
            );
          const idx = selectable.indexOf(start + i);
          const active = idx === cur;
          const d = e.dep;
          const head = cell(BASE_COLS[0]!, `${dateWeekday(d.startDate)}${d.startDate.slice(2, 4)}`) + ' ' + cell(BASE_COLS[1]!, d.title) + ' ';
          const tail =
            cell(BASE_COLS[2]!, d.shipName) +
            ' ' +
            cell(BASE_COLS[3]!, String(d.duration)) +
            ' ' +
            cell(BASE_COLS[4]!, d.fromPricePerPerson ? `${num(d.fromPricePerPerson)} €` : '');
          const bg = active ? theme.accentBg : undefined;
          const fg = active ? theme.accent : undefined;
          const h = holidayActive ? holiday.get(d.journeyId) : undefined;
          return (
            <Clickable
              key={e.key}
              onClick={(ev) => {
                if (active || ev.double) shell.openTrip(d.journeyId);
                else setCursor(idx);
              }}
            >
              <Text backgroundColor={bg} color={fg} bold={active}>
                {active ? '▌' : ' '}
                {head}
              </Text>
              {holidayActive ? (
                <HolidayCell
                  h={h}
                  bg={bg}
                  onHover={(kind, inside, rect) =>
                    setTip((t) =>
                      inside && rect ? { kind, jid: d.journeyId, rect } : t && !t.pinned && t.jid === d.journeyId && t.kind === kind ? null : t,
                    )
                  }
                />
              ) : null}
              <Text backgroundColor={bg} color={fg} bold={active}>
                {tail}
              </Text>
            </Clickable>
          );
        })}
      </Clickable>
    );
  }

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box paddingX={1} height={1} justifyContent="space-between">
        <Box>
          <Clickable onClick={() => shell.go('home')}>
            <SmallLogo />
          </Clickable>
          <Text color={theme.faint}>  ›  </Text>
          <Text bold>Reisen</Text>
        </Box>
        <Box flexShrink={0}>
          <SettingsLink shell={shell} />
          <BridgeStatus bridge={bridge} via={shell.via} extra={shell.demo ? 'Ausschnitt' : null} />
        </Box>
      </Box>
      <Box borderStyle="round" borderColor={theme.borderFocus} paddingX={1} flexDirection="column" height={4}>
        <SearchLine
          query={query}
          focused
          placeholder="Ziel, Hafen, Schiff, Datum … oder region: monat: dauer: schiff:"
          onRemoveChip={(i) => setQuery(removeChip(query, i))}
        />
        <SuggestionLine
          query={live}
          suggestions={suggestions}
          sel={sel}
          onAccept={accept}
          onInsertCommand={(cmd) =>
            setQuery({ ...query, text: (query.text && !query.text.endsWith(' ') ? `${query.text} ` : query.text) + cmd })
          }
          status={status ? <Text color={theme.warn}>{status}</Text> : undefined}
          rightHint={selected ? '⏎ Preise vergleichen' : undefined}
        />
      </Box>
      <Box height={bodyH}>
        <Panel title={count} right={`sortiert: ${sortLabel}`} width={listW} height={bodyH}>
          {listBody}
        </Panel>
        {wide ? (
          <Panel title="Vorschau" width={previewW} height={bodyH}>
            {selected && catalog.catalog ? <Preview dep={selected} shell={shell} height={bodyH - 2} width={previewW - 4} /> : null}
          </Panel>
        ) : null}
      </Box>
      <KeyHints
        hints={[
          { key: '↑↓', label: 'wählen' },
          { key: '⏎', label: 'Preise vergleichen' },
          { key: 'Tab', label: 'Vorschlag' },
          { key: 'Esc', label: isBaseQuery(query) ? 'Startseite' : 'Suche leeren' },
          ...(holidayActive ? [{ key: 'Ctrl+T', label: 'Ferien-Info' }] : []),
          { key: '?', label: 'Hilfe' },
        ]}
        message={shell.message?.text ?? null}
        tone={shell.message?.tone ?? 'info'}
      />
      {tip && holidayActive ? <HolidayTooltips tip={tip} h={holiday.get(tip.jid)} cols={cols} rows={rows} /> : null}
    </Box>
  );
}
