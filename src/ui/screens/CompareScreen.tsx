import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { routeOf } from '../../api/catalog.js';
import { cabinGroupLabel } from '../../domain/cabins.js';
import { DEFAULT_FILTERS, SORT_FIELDS, isDefaultFilters, shortCabinName, transportLabel, type SortField } from '../../domain/compare.js';
import { configOf, favoriteId } from '../../domain/favorites.js';
import { bookingLink } from '../../domain/links.js';
import { paxSummary, samePax } from '../../domain/pax.js';
import { tariffInfo } from '../../domain/tariffs.js';
import type { Departure, Filters, Pax, TransportKind, ViewId } from '../../domain/types.js';
import { DatesDialog, FilterDialog, PaxDialog, type FilterSection } from '../components/dialogs.js';
import { FavoriteStar, Inspector, InspectorBar } from '../components/Inspector.js';
import { OfferTable } from '../components/OfferTable.js';
import { PivotTable } from '../components/PivotTable.js';
import { Chip, Clickable, KeyHints, Panel, Segmented, Tabs, Toggle } from '../components/ui.js';
import { dateWeekday, euro, num, timeOf } from '../format.js';
import { tripOf } from '../favorites.js';
import { userDefaultFilters } from '../settings.js';
import { usePriceMatrix } from '../hooks/data.js';
import { useKeys } from '../input.js';
import { VIEWS, computeView, drillFromCell, focusFromCell, type Drill } from '../model.js';
import { BridgeStatus, SettingsLink, SetupHint, type Shell } from '../shell.js';
import { copyText, openUrl } from '../system.js';
import { theme } from '../theme.js';

type DialogState = { kind: 'filter'; section: FilterSection } | { kind: 'pax' } | { kind: 'dates' } | null;

const TRANSPORT_SHORT: Record<TransportKind, string> = {
  return: 'Hin+Rück',
  openjaw: 'Gabel',
  outbound: 'nur Hin',
  inbound: 'nur Rück',
  none: 'eigene',
};

export function CompareScreen({ shell }: { shell: Shell }) {
  const { s, update, cols, rows, bridge, catalog } = shell;
  const prices = usePriceMatrix(shell.client, s.journeyId, s.pax, bridge);
  const matrix = prices.matrix;
  const [drill, setDrill] = useState<Drill | null>(null);
  const [listIndex, setListIndex] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);

  const current: Departure | undefined = useMemo(
    () => catalog.catalog?.departures.find((d) => d.journeyId === s.journeyId),
    [catalog.catalog, s.journeyId],
  );
  const routeDeps = useMemo(
    () => (catalog.catalog && current ? (routeOf(catalog.catalog, current)?.departures ?? []) : []),
    [catalog.catalog, current],
  );

  const vm = useMemo(
    () =>
      computeView({
        matrix,
        filters: s.filters,
        view: s.view,
        expand: s.expand,
        focus: s.focus,
        drill,
        listIndex,
        sortField: s.sortField,
        sortDesc: s.sortDesc,
      }),
    [matrix, s.filters, s.view, s.expand, s.focus, drill, listIndex, s.sortField, s.sortDesc],
  );
  const selected = vm.selected;
  // Standardfilter aus den Einstellungen (Heimatflughäfen, Anreiseart)
  const defaultFilters = useMemo(() => userDefaultFilters(shell.settings), [shell.settings]);

  // Favoriten: Stern bezieht sich auf die angezeigte Konfiguration; geladene Preise aktualisieren Favoriten.
  const favorite = selected ? shell.favorites.find((f) => f.id === favoriteId(configOf(selected, s.pax, s.expand))) : undefined;
  const { observePrices } = shell;
  useEffect(() => {
    if (matrix) observePrices(matrix);
  }, [matrix, observePrices]);
  const toggleFavorite = () => {
    if (!selected || !matrix) return shell.notify('Kein Angebot gewählt.', 'warn');
    const fav = shell.toggleFavorite(selected, matrix.offers, tripOf(selected.journeyId, current, matrix.cruise));
    if (fav) shell.notify(`Gemerkt · ${euro(fav.saved.total)} als Vergleichspreis`);
    else if (favorite) shell.notify('Aus den Favoriten entfernt.');
  };

  // ---------------------------------------------------------------- Aktionen
  const selectDeparture = (d: Departure) => {
    shell.openTrip(d.journeyId);
    setDrill(null);
    setListIndex(0);
    setDialog(null);
  };
  const stepDate = (delta: number) => {
    if (!current || routeDeps.length < 2) return shell.notify('Keine weiteren Termine dieser Route bekannt.', 'warn');
    const i = routeDeps.findIndex((d) => d.journeyId === current.journeyId);
    const next = routeDeps[i + delta];
    if (next) selectDeparture(next);
    else shell.notify(delta > 0 ? 'Letzter Termin dieser Route.' : 'Erster Termin dieser Route.', 'warn');
  };
  const setView = (v: ViewId) => {
    if (v !== 4) setDrill(null);
    update({ view: v });
  };
  const applyPax = (p: Pax) => {
    update({ pax: p, paxHistory: [p, ...s.paxHistory.filter((x) => !samePax(x, p))].slice(0, 6) });
    setDialog(null);
  };
  const applyFilters = (f: Filters) => {
    update({ filters: f });
    setDialog(null);
  };
  const selectCell = (r: number, c: number) => update({ focus: focusFromCell(vm, s.view, r, c, s.focus) });
  const moveCursor = (dr: number, dc: number) => {
    if (s.view === 4) {
      const len = vm.list?.length ?? 0;
      setListIndex(Math.max(0, Math.min(len - 1, vm.listIndex + dr)));
      return;
    }
    const p = vm.pivot;
    if (!p) return;
    selectCell(Math.max(0, Math.min(p.rows.length - 1, vm.row + dr)), Math.max(0, Math.min(p.cols.length - 1, vm.col + dc)));
  };
  const drillDown = () => {
    if (s.view === 4) return;
    const d = drillFromCell(vm, s.view);
    if (d) {
      setDrill(d);
      setListIndex(0);
      update({ view: 4 });
    }
  };
  const back = () => {
    if (s.view === 4 && drill) {
      update({ view: drill.fromView });
      setDrill(null);
    } else shell.go('trips');
  };
  const cyclePinned = (delta: number) => {
    const pin = vm.pinned;
    if (!pin) return;
    const i = pin.options.findIndex((o) => o.key === pin.key);
    const next = pin.options[(i + delta + pin.options.length) % pin.options.length];
    if (next) update({ focus: pin.dim === 'cabin' ? { ...s.focus, cabin: next.key } : { ...s.focus, tariff: next.key } });
  };
  const book = () => {
    if (!selected) return;
    openUrl(bookingLink(selected, s.pax));
    shell.notify('Buchungsassistent im Browser geöffnet.');
  };
  const copy = () => {
    if (!selected) return;
    const url = bookingLink(selected, s.pax);
    shell.notify(copyText(url) ? 'Buchungslink kopiert.' : url);
  };
  const sortBy = (f: SortField) => update({ sortField: f, sortDesc: s.sortField === f ? !s.sortDesc : false });

  useKeys(
    (input, key) => {
      if (input === 'q') return shell.exit();
      if (input === '?') return shell.showHelp();
      if (input === '/') return shell.go('trips');
      if (input >= '1' && input <= '4') return setView(Number(input) as ViewId);
      if (key.tab) return setView((((s.view - 1 + (key.shift ? 3 : 1)) % 4) + 1) as ViewId);
      if (key.shift && key.leftArrow) return stepDate(-1);
      if (key.shift && key.rightArrow) return stepDate(1);
      if (input === '-') return stepDate(-1);
      if (input === '+') return stepDate(1);
      if (key.upArrow) return moveCursor(-1, 0);
      if (key.downArrow) return moveCursor(1, 0);
      if (key.leftArrow) return moveCursor(0, -1);
      if (key.rightArrow) return moveCursor(0, 1);
      if (key.pageUp) return moveCursor(-10, 0);
      if (key.pageDown) return moveCursor(10, 0);
      if (input === '<' || input === ',') return cyclePinned(-1);
      if (input === '>' || input === '.') return cyclePinned(1);
      if (key.return) return drillDown();
      if (key.escape) return back();
      if (input === 'u') return update({ expand: !s.expand });
      if (input === 'f') return setDialog({ kind: 'filter', section: 'depAirports' });
      if (input === 'a') return setDialog({ kind: 'filter', section: 'transports' });
      if (input === 't') return setDialog({ kind: 'filter', section: 'tariffs' });
      if (input === 'k') return setDialog({ kind: 'filter', section: 'cabinGroups' });
      if (input === 'F') return setDialog({ kind: 'filter', section: 'arrAirports' });
      if (input === 'x') {
        update({ filters: defaultFilters });
        return shell.notify('Filter zurückgesetzt.');
      }
      if (input === 'b') return setDialog({ kind: 'pax' });
      if (input === 'D') return setDialog({ kind: 'dates' });
      if (input === 'p') return update({ priceMode: s.priceMode === 'total' ? 'pp' : 'total' });
      if (input === 'd') return update({ showDelta: !s.showDelta });
      if (input === 's') {
        const i = SORT_FIELDS.findIndex((f) => f.field === s.sortField);
        const next = SORT_FIELDS[(i + 1) % SORT_FIELDS.length]!;
        update({ sortField: next.field });
        return shell.notify(`Sortierung: ${next.label}`);
      }
      if (input === 'S') return update({ sortDesc: !s.sortDesc });
      if (input === 'r') {
        prices.reload();
        return shell.notify('Preise werden neu geladen …');
      }
      if (input === 'R') return catalog.reload();
      if (input === 'o') return book();
      if (input === 'y') return copy();
      if (input === 'm') return toggleFavorite();
    },
    { isActive: shell.active && dialog === null },
  );

  // ---------------------------------------------------------------- Layout
  const spacer = rows >= 30;
  const headerH = 4 + (spacer ? 1 : 0);
  const bodyH = Math.max(6, rows - headerH - 1);
  const side = cols >= 110;
  const inspW = side ? Math.max(34, Math.min(42, Math.floor(cols * 0.3))) : 0;
  const barH = side ? 0 : 6;
  const mainW = cols - inspW;
  const mainH = bodyH - barH;

  const title = current?.title ?? matrix?.cruise?.routeName ?? s.journeyId ?? '';
  const ship = current?.shipName ?? matrix?.cruise?.shipName ?? '';
  const startIso = current?.startDate ?? matrix?.cruise?.startDate ?? '';
  const f = s.filters;
  const defaultTransports = JSON.stringify(f.transports) === JSON.stringify(defaultFilters.transports);

  // Panel-Titel je Ansicht (ersetzt die frühere Erklärzeile)
  let panelTitle: React.ReactNode = VIEWS.find((v) => v.id === s.view)?.label;
  let panelRight: string | undefined;
  if (s.view === 1) {
    panelTitle = s.expand ? 'Unterkategorie × Tarif' : 'Kabine × Tarif';
    panelRight = 'günstigster Preis je Zelle · Kürzel = Flughafen';
  } else if ((s.view === 2 || s.view === 3) && vm.pinned) {
    panelTitle = (
      <Box>
        <Text bold>{s.view === 2 ? 'Anreise × Tarif' : 'Anreise × Kabine'}</Text>
        <Text color={theme.faint}>{'  ·  '}</Text>
        <Text color={theme.muted}>{vm.pinned.dim === 'cabin' ? 'Kabine ' : 'Tarif '}</Text>
        <Clickable onClick={() => cyclePinned(-1)}>
          <Text color={theme.accent}>‹ </Text>
        </Clickable>
        <Text bold color={theme.accent}>
          {vm.pinned.label}
        </Text>
        <Clickable onClick={() => cyclePinned(1)}>
          <Text color={theme.accent}> ›</Text>
        </Clickable>
      </Box>
    );
    panelRight = '< > wechseln';
  } else if (s.view === 4) {
    const parts: string[] = [];
    if (drill?.cabin) {
      const sub = vm.all.find((o) => o.cabinCode === drill.cabin && o.cabinGroup !== drill.cabin);
      parts.push(sub ? `${shortCabinName(sub.cabinName)} ${sub.cabinCode}` : cabinGroupLabel(drill.cabin));
    }
    if (drill?.tariff) parts.push(tariffInfo(drill.tariff).name);
    if (drill?.transport) {
      const o = vm.list?.[0];
      parts.push(o ? transportLabel(o) : drill.transport);
    }
    panelTitle = (
      <Box>
        <Text bold>Angebote ({num(vm.list?.length ?? 0)})</Text>
        {drill ? (
          <>
            <Text>{'  '}</Text>
            <Clickable onClick={() => back()}>
              <Text backgroundColor={theme.accentBg} color={theme.accent}>
                {` ${parts.join(' · ')} ✕ `}
              </Text>
            </Clickable>
          </>
        ) : null}
      </Box>
    );
    panelRight = `sortiert: ${SORT_FIELDS.find((x) => x.field === s.sortField)?.label ?? ''} ${s.sortDesc ? '▼' : '▲'}`;
  }
  const notices = vm.notices.join(' · ');

  let main: React.ReactNode;
  const innerW = mainW - 2;
  const innerH = mainH - 2;
  if (!s.journeyId) {
    main = <Text color={theme.muted}> Keine Reise gewählt.</Text>;
  } else if (!matrix && bridge === 'waiting') {
    main = (
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.warn} bold>
          {shell.via === 'bridge' ? 'Warte auf die Verbindung zu Chrome …' : 'Zugriffsweg wird gewechselt …'}
        </Text>
        <SetupHint via={shell.via} extensionDir={shell.extensionDir} />
      </Box>
    );
  } else if (prices.error && !matrix) {
    main = (
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.bad}>{prices.error.text}</Text>
        <Text color={theme.muted}>r erneut versuchen · Esc andere Reise · b andere Belegung</Text>
      </Box>
    );
  } else if (!matrix) {
    main = <Text color={theme.accent}> Preise werden aus dem AIDA-Buchungsprozess geladen …</Text>;
  } else if (matrix.offers.length === 0) {
    main = (
      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.warn}>Für {paxSummary(s.pax)} ist diese Reise derzeit nicht buchbar.</Text>
        <Text color={theme.muted}>Mit b eine andere Belegung wählen oder mit − + einen anderen Termin.</Text>
      </Box>
    );
  } else if (s.view === 4) {
    main = (
      <OfferTable
        offers={vm.list ?? []}
        index={vm.listIndex}
        width={innerW}
        height={innerH}
        priceMode={s.priceMode}
        showDelta={s.showDelta}
        min={vm.min}
        sortField={s.sortField}
        sortDesc={s.sortDesc}
        onSelect={setListIndex}
        onSort={sortBy}
        onWheel={(d) => moveCursor(d * 3, 0)}
      />
    );
  } else if (vm.pivot) {
    main = (
      <PivotTable
        pivot={vm.pivot}
        row={vm.row}
        col={vm.col}
        rowHeader={s.view === 1 ? (s.expand ? 'Unterkategorie' : 'Kabine') : 'Anreise'}
        width={innerW}
        height={innerH}
        priceMode={s.priceMode}
        showDelta={s.showDelta}
        showTag={s.view === 1}
        globalMin={vm.min}
        onCell={(r, c, activate) => {
          selectCell(r, c);
          if (activate) {
            const d = drillFromCell({ ...vm, row: r, col: c }, s.view);
            if (d) {
              setDrill(d);
              setListIndex(0);
              update({ view: 4 });
            }
          }
        }}
        onWheel={(d) => moveCursor(d, 0)}
      />
    );
  }

  const dlg = dialog;
  let dialogNode: React.ReactNode = null;
  const base = { cols, rows, onClose: () => setDialog(null) };
  if (dlg?.kind === 'filter') {
    dialogNode = (
      <FilterDialog
        {...base}
        offers={vm.all}
        filters={s.filters}
        initial={dlg.section}
        onApply={applyFilters}
        defaults={defaultFilters}
      />
    );
  } else if (dlg?.kind === 'pax') {
    dialogNode = <PaxDialog {...base} pax={s.pax} history={s.paxHistory} onApply={applyPax} />;
  } else if (dlg?.kind === 'dates') {
    dialogNode = <DatesDialog {...base} departures={routeDeps} current={s.journeyId ?? ''} onSelect={selectDeparture} />;
  }

  const routeIdx = current ? routeDeps.findIndex((d) => d.journeyId === current.journeyId) : -1;

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      {/* Titelleiste */}
      <Box paddingX={1} height={1} justifyContent="space-between">
        <Box flexShrink={1} overflow="hidden">
          <Clickable onClick={() => shell.go('trips')} flexShrink={0}>
            <Text color={theme.accent}>‹ Reisen</Text>
          </Clickable>
          <Text>{'   '}</Text>
          <Text bold wrap="truncate">
            {title}
            <Text color={theme.muted} bold={false}>
              {ship ? ` · ${ship}` : ''}
              {current ? ` · ${current.duration} Tage` : ''}
            </Text>
          </Text>
        </Box>
        <Box flexShrink={0} marginLeft={2}>
          {prices.loading ? <Text color={theme.accent}>⟳ lädt  </Text> : null}
          <SettingsLink shell={shell} />
          <BridgeStatus bridge={bridge} via={shell.via} extra={matrix ? `Stand ${timeOf(matrix.fetchedAt)}` : null} />
        </Box>
      </Box>
      {/* Steuerleiste: Termin, Belegung, Kennzahlen */}
      <Box paddingX={1} height={1} justifyContent="space-between">
        <Box>
          <Clickable onClick={() => stepDate(-1)}>
            <Text color={routeIdx > 0 ? theme.accent : theme.faint}> ◂ </Text>
          </Clickable>
          <Clickable onClick={() => setDialog({ kind: 'dates' })}>
            <Text bold backgroundColor={theme.chipBg}>
              {` ${startIso ? `${dateWeekday(startIso)}${startIso.slice(0, 4)}` : '—'} `}
              <Text color={theme.muted} backgroundColor={theme.chipBg}>
                ▾{' '}
              </Text>
            </Text>
          </Clickable>
          <Clickable onClick={() => stepDate(1)}>
            <Text color={routeIdx >= 0 && routeIdx < routeDeps.length - 1 ? theme.accent : theme.faint}> ▸ </Text>
          </Clickable>
          {routeDeps.length > 1 ? <Text color={theme.faint}>{` ${routeIdx + 1}/${routeDeps.length}`}</Text> : null}
          <Text>{'    '}</Text>
          <Chip label="Belegung" value={paxSummary(s.pax)} onClick={() => setDialog({ kind: 'pax' })} />
        </Box>
        {matrix && matrix.offers.length ? (
          <Text>
            <Text color={theme.muted}>ab </Text>
            <Text bold color={theme.good}>
              {euro(vm.min)}
            </Text>
            <Text color={theme.muted}>{`  ·  ${num(vm.filtered.length)} von ${num(vm.all.length)} Angeboten`}</Text>
          </Text>
        ) : null}
      </Box>
      {spacer ? <Box height={1} /> : null}
      {/* Ansichten und Anzeigeoptionen */}
      <Box paddingX={1} height={1} justifyContent="space-between">
        <Tabs
          tabs={VIEWS.map((v) => ({ id: v.id, label: v.id === 4 ? 'Angebote' : v.label, key: String(v.id) }))}
          value={s.view}
          onChange={(v) => setView(v)}
        />
        <Box flexShrink={0}>
          <Segmented
            options={[
              { value: 'total', label: 'Gesamt' },
              { value: 'pp', label: 'p.P.' },
            ]}
            value={s.priceMode}
            onChange={(v) => update({ priceMode: v })}
          />
          <Text> </Text>
          <Toggle label="Δ" on={s.showDelta} onChange={(v) => update({ showDelta: v })} />
          <Text> </Text>
          <Toggle label="Unterkat." on={s.expand} onChange={(v) => update({ expand: v })} />
        </Box>
      </Box>
      {/* Filter */}
      <Box paddingX={1} height={1} overflow="hidden">
        <Chip
          label="Anreise"
          value={f.transports.length ? f.transports.map((k) => TRANSPORT_SHORT[k]).join(', ') : 'alle'}
          active={!defaultTransports}
          onClick={() => setDialog({ kind: 'filter', section: 'transports' })}
        />
        <Text> </Text>
        <Chip
          label="Ab"
          value={f.depAirports.length ? f.depAirports.join(', ') : 'alle'}
          active={f.depAirports.length > 0}
          onClick={() => setDialog({ kind: 'filter', section: 'depAirports' })}
        />
        <Text> </Text>
        <Chip
          label="Zurück"
          value={f.arrAirports.length ? f.arrAirports.join(', ') : 'alle'}
          active={f.arrAirports.length > 0}
          onClick={() => setDialog({ kind: 'filter', section: 'arrAirports' })}
        />
        <Text> </Text>
        <Chip
          label="Tarif"
          value={f.tariffs.length ? f.tariffs.map((t) => tariffInfo(t).short).join(', ') : 'alle'}
          active={f.tariffs.length > 0}
          onClick={() => setDialog({ kind: 'filter', section: 'tariffs' })}
        />
        <Text> </Text>
        <Chip
          label="Kabine"
          value={f.cabinGroups.length ? f.cabinGroups.map(cabinGroupLabel).join(', ') : 'alle'}
          active={f.cabinGroups.length > 0}
          onClick={() => setDialog({ kind: 'filter', section: 'cabinGroups' })}
        />
        {!isDefaultFilters(f, defaultFilters) ? (
          <Clickable onClick={() => update({ filters: defaultFilters })} marginLeft={2} flexShrink={0}>
            <Text color={theme.muted}>✕ Filter zurücksetzen</Text>
          </Clickable>
        ) : null}
      </Box>
      {/* Inhalt */}
      <Box height={bodyH} flexDirection={side ? 'row' : 'column'}>
        <Panel
          title={panelTitle}
          {...(panelRight ? { right: panelRight } : {})}
          {...(notices ? { footer: <Text color={theme.warn}>{notices}</Text> } : {})}
          width={mainW}
          height={mainH}
          focused
        >
          {main}
        </Panel>
        {side ? (
          <Panel
            title="Angebot"
            width={inspW}
            height={bodyH}
            {...(matrix && selected ? { right: <FavoriteStar active={!!favorite} onClick={toggleFavorite} /> } : {})}
          >
            {matrix ? (
              <Inspector
                offer={selected}
                pax={s.pax}
                min={vm.min}
                width={inspW - 2}
                onBook={book}
                onCopy={copy}
                favorite={favorite}
                deltaMode={shell.settings.deltaMode}
                threshold={shell.settings.deltaThreshold}
              />
            ) : null}
          </Panel>
        ) : (
          <Panel width={cols} height={barH}>
            {matrix ? (
              <InspectorBar
                offer={selected}
                pax={s.pax}
                min={vm.min}
                onBook={book}
                onCopy={copy}
                favorite={favorite}
                onToggleFavorite={toggleFavorite}
                deltaMode={shell.settings.deltaMode}
                threshold={shell.settings.deltaThreshold}
              />
            ) : null}
          </Panel>
        )}
      </Box>
      <KeyHints
        hints={[
          { key: '←↑↓→', label: 'Auswahl' },
          { key: '⏎', label: s.view === 4 ? 'Esc zurück' : 'Angebote' },
          { key: '1–4', label: 'Ansicht' },
          { key: 'f', label: 'Filter' },
          { key: 'b', label: 'Belegung' },
          { key: '− +', label: 'Termin' },
          { key: 'o', label: 'Buchen' },
          { key: 'm', label: 'Merken' },
          { key: '?', label: 'Hilfe' },
        ]}
        message={shell.message?.text ?? (prices.error && matrix ? prices.error.text : null)}
        tone={shell.message?.tone ?? (prices.error ? 'bad' : 'info')}
      />
      {dialogNode}
    </Box>
  );
}

