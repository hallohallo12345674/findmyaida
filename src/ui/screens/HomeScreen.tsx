import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { isDeparted, type Favorite } from '../../domain/favorites.js';
import type { Departure } from '../../domain/types.js';
import { FavoriteList, type FavoriteItem } from '../components/FavoriteList.js';
import { BigLogo, LOGO_HEIGHT, SmallLogo } from '../components/Logo.js';
import { handleSearchKey, SearchLine, SuggestionLine } from '../components/SmartSearch.js';
import { Clickable, KeyHints } from '../components/ui.js';
import { homeLists, localDay, sortFavorites } from '../favorites.js';
import { baseQuery, withDefaultState } from '../settings.js';
import { dateWeekday, fit } from '../format.js';
import { useRegions } from '../hooks/data.js';
import { useKeys } from '../input.js';
import { windowAround } from '../layout.js';
import {
  acceptSuggestion,
  buildContext,
  EMPTY_QUERY,
  isEmptyQuery,
  removeChip,
  resolveCommands,
  suggest,
  type SlashCommand,
  type Suggestion,
  type TripQuery,
} from '../search/query.js';
import { BridgeStatus, SettingsLink, SetupHint, type Shell } from '../shell.js';
import { theme } from '../theme.js';
import { VERSION } from '../../version.js';

/** Startseite im Stil von OpenCode: Logo, Schnellsuche, „Alle Reisen“, Favoriten, zuletzt angesehen. */
export function HomeScreen({ shell }: { shell: Shell }) {
  const { s, cols, rows, catalog, bridge } = shell;
  const [query, setQueryState] = useState<TripQuery>(EMPTY_QUERY);
  // Immer aktueller Stand, auch wenn mehrere Tasten vor dem nächsten Render ankommen.
  const queryRef = useRef(query);
  queryRef.current = query;
  const setQuery = (q: TripQuery) => {
    queryRef.current = q;
    setQueryState(q);
  };
  const [sel, setSel] = useState(0);
  const [focus, setFocus] = useState<'input' | 'list'>('input');
  // Cursor über Favoriten und „Zuletzt angesehen“ zusammen
  const [listIdx, setListIdx] = useState(0);
  // Auf der Startseite entfernte Favoriten bleiben bis zum Verlassen sichtbar und lassen sich zurückholen.
  const [ghosts, setGhosts] = useState<Favorite[]>([]);
  const today = useMemo(() => localDay(new Date()), []);

  const { regions } = useRegions(shell.client, bridge, []);
  const ctx = useMemo(() => buildContext(catalog.catalog, regions), [catalog.catalog, regions]);
  const suggestions = useMemo(() => suggest(query, ctx), [query, ctx]);
  const live = useMemo(() => resolveCommands(query, ctx), [query, ctx]);

  // Höhe ohne Listen: Logo, Untertitel, Suchfeld, Befehle, „Alle Reisen“, Status
  const fixedH = (logo: number) => logo + 1 + 1 + 3 + 1 + 1 + 1 + (bridge === 'waiting' ? 3 : 1);
  // Großes Logo nur, wenn es samt Suche hineinpasst; sonst die einzeilige Wortmarke.
  const { settings } = shell;
  const compact = rows < 24 || cols < 50 || fixedH(LOGO_HEIGHT) > rows - 1;
  // Großes Logo nur, wenn eingeschaltet und genug Platz ist.
  const logoH = compact || !settings.bigLogo ? 1 : LOGO_HEIGHT;

  const favItems: FavoriteItem[] = useMemo(
    () =>
      sortFavorites(
        [
          ...shell.favorites.map((fav) => ({ fav, ghost: false })),
          ...ghosts.filter((g) => !shell.favorites.some((f) => f.id === g.id)).map((fav) => ({ fav, ghost: true })),
        ].filter((x) => !settings.hideDeparted || !isDeparted(x.fav, today)),
        settings.favoriteSort,
        today,
      ),
    [shell.favorites, ghosts, today, settings.hideDeparted, settings.favoriteSort],
  );
  // Favoriten haben Vorrang; „Zuletzt angesehen“ bekommt den Rest (höchstens drei).
  const lists = compact
    ? { favorites: 0, more: false, recent: 0, height: 0 }
    : homeLists(rows - 1 - fixedH(logoH), favItems.length, s.recent.length, settings.recentCount);
  const recent: (Departure | { journeyId: string; title: string })[] = s.recent
    .map((jid) => catalog.catalog?.departures.find((d) => d.journeyId === jid) ?? { journeyId: jid, title: jid })
    .slice(0, lists.recent);
  const favTotal = lists.favorites ? favItems.length : 0;
  const entries = favTotal + recent.length;
  const cursor = Math.min(listIdx, Math.max(0, entries - 1));
  const favCursor = focus === 'list' && cursor < favTotal ? cursor : -1;
  const [favStart, favEnd] = windowAround(favTotal, Math.max(0, favCursor), lists.favorites);
  useEffect(() => {
    if (focus === 'list' && !entries) setFocus('input');
  }, [focus, entries]);

  const openEntry = (i: number) => {
    if (i < favTotal) {
      const item = favItems[i];
      if (item && !item.ghost) shell.openFavorite(item.fav);
      return;
    }
    const r = recent[i - favTotal];
    if (r) shell.openTrip(r.journeyId);
  };
  const toggleGhost = (i: number) => {
    const item = favItems[i];
    if (!item) return;
    if (item.ghost) {
      shell.restoreFavorite(item.fav);
      setGhosts((g) => g.filter((x) => x.id !== item.fav.id));
    } else {
      setGhosts((g) => [...g.filter((x) => x.id !== item.fav.id), item.fav]);
      shell.removeFavorite(item.fav.id);
    }
  };

  const runSlash = (cmd: SlashCommand) => {
    if (cmd === 'alle') {
      shell.update({ tripQuery: baseQuery(settings) });
      shell.go('trips');
    } else if (cmd === 'hilfe') {
      setQuery(EMPTY_QUERY);
      shell.showHelp();
    } else if (cmd === 'einstellungen') {
      setQuery(EMPTY_QUERY);
      shell.openSettings();
    } else shell.exit();
  };

  const accept = (sg: Suggestion) => {
    if (sg.type === 'slash') return runSlash(sg.command);
    setQuery(acceptSuggestion(queryRef.current, sg));
    setSel(0);
  };

  const submit = () => {
    const query = queryRef.current;
    const word = query.text.trim();
    if (word.startsWith('/')) {
      const first = suggest(query, ctx).find((x) => x.type === 'slash');
      if (first && first.type === 'slash') return runSlash(first.command);
      return shell.notify(`Unbekannter Befehl ${word}`, 'warn');
    }
    const resolved = withDefaultState(isEmptyQuery(query) ? EMPTY_QUERY : resolveCommands(query, ctx), settings);
    shell.update({ tripQuery: resolved });
    shell.go('trips');
  };

  useKeys(
    (input, key) => {
      if (focus === 'list') {
        if (key.upArrow) {
          if (cursor === 0) setFocus('input');
          else setListIdx(cursor - 1);
          return;
        }
        if (key.downArrow) return setListIdx(Math.min(entries - 1, cursor + 1));
        if (key.pageUp) return setListIdx(Math.max(0, cursor - 5));
        if (key.pageDown) return setListIdx(Math.min(entries - 1, cursor + 5));
        if (key.return) return openEntry(cursor);
        if (key.backspace || key.delete) {
          if (cursor < favTotal) toggleGhost(cursor);
          return;
        }
        if (key.escape) return setFocus('input');
        if (input === '?') return shell.showHelp();
        // Tippen springt zurück ins Suchfeld
        setFocus('input');
      }
      if (key.downArrow) {
        if (entries) {
          setFocus('list');
          setListIdx(0);
        }
        return;
      }
      if (key.return) return submit();
      if (key.escape) {
        setQuery(EMPTY_QUERY);
        return;
      }
      const q = queryRef.current;
      if (input === '?' && isEmptyQuery(q)) return shell.showHelp();
      const r = handleSearchKey(q, suggest(q, ctx), sel, input, key);
      if (r.accept) return accept(r.accept);
      if (r.query) setQuery(r.query);
      if (r.sel !== undefined) setSel(r.sel);
    },
    { isActive: shell.active },
  );

  const boxW = Math.max(30, Math.min(72, cols - 6));
  const status = catalog.error ?? catalog.progress;
  // Inhalt vertikal mittig ausrichten
  const contentH = fixedH(logoH) + lists.height;
  const top = Math.max(0, Math.floor((rows - 1 - contentH) / 2));

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box flexDirection="column" alignItems="center" flexGrow={1} paddingTop={top}>
        {logoH === 1 ? <SmallLogo /> : <BigLogo />}
        <Text color={theme.muted}>
          Preisvergleich für AIDA-Kreuzfahrten
          {shell.demo ? <Text color={theme.warn}> · Demo-Daten (Ausschnitt)</Text> : null}
        </Text>
        <Box height={1} />
        <Box
          width={boxW}
          borderStyle="round"
          borderColor={focus === 'input' ? theme.borderFocus : theme.border}
          paddingX={1}
          flexDirection="column"
        >
          <SearchLine
            query={query}
            focused={focus === 'input'}
            placeholder={settings.sayings ? shell.saying : 'Reise suchen oder Befehl eingeben …'}
            onRemoveChip={(i) => setQuery(removeChip(query, i))}
          />
        </Box>
        <Box width={boxW - 2}>
          <SuggestionLine
            query={live}
            suggestions={suggestions}
            sel={sel}
            onAccept={accept}
            onInsertCommand={(cmd) => {
              setQuery({ ...query, text: (query.text && !query.text.endsWith(' ') ? `${query.text} ` : query.text) + cmd });
              setFocus('input');
            }}
            rightHint="⏎ suchen"
          />
        </Box>
        <Box height={1} />
        <Box width={boxW - 2}>
          <Clickable onClick={() => runSlash('alle')}>
            <Text color={theme.accent}>→ Alle Reisen anzeigen</Text>
          </Clickable>
          <Box flexGrow={1} />
          <Text color={theme.faint}>⏎ bei leerer Eingabe</Text>
        </Box>
        {favTotal ? (
          <Box flexDirection="column" width={boxW - 2} marginTop={1}>
            <Box>
              <Text color={theme.faint} bold>
                FAVORITEN
              </Text>
              <Text color={theme.faint}> {shell.favorites.length}</Text>
            </Box>
            <FavoriteList
              items={favItems}
              start={favStart}
              end={favEnd}
              cursor={favCursor}
              width={boxW - 2}
              checks={shell.favoriteChecks}
              today={today}
              deltaMode={settings.deltaMode}
              threshold={settings.deltaThreshold}
              onClick={(i, double) => {
                if (double || (focus === 'list' && cursor === i)) return openEntry(i);
                setFocus('list');
                setListIdx(i);
              }}
              onToggle={toggleGhost}
              onWheel={(dir) => {
                setFocus('list');
                setListIdx(Math.max(0, Math.min(favTotal - 1, (favCursor < 0 ? favStart : favCursor) + dir)));
              }}
            />
            {lists.more ? (
              <Text color={theme.faint}>
                {favStart ? `↑ ${favStart} weitere  ` : ''}
                {favTotal - favEnd ? `↓ ${favTotal - favEnd} weitere` : ''}
              </Text>
            ) : null}
          </Box>
        ) : null}
        {recent.length ? (
          <Box flexDirection="column" width={boxW - 2} marginTop={1}>
            <Text color={theme.faint} bold>
              ZULETZT ANGESEHEN
            </Text>
            {recent.map((r, i) => {
              const active = focus === 'list' && favTotal + i === cursor;
              const d = 'startDate' in r ? r : null;
              const line = d
                ? `${fit(dateWeekday(d.startDate) + d.startDate.slice(2, 4), 12)} ${fit(d.title, Math.max(10, boxW - 30))} ${d.shipName}`
                : r.title;
              return (
                <Clickable key={r.journeyId} onClick={() => shell.openTrip(r.journeyId)}>
                  <Text
                    backgroundColor={active ? theme.accentBg : undefined}
                    color={active ? theme.accent : undefined}
                    wrap="truncate"
                  >
                    {active ? '▸ ' : '  '}
                    {line}
                  </Text>
                </Clickable>
              );
            })}
          </Box>
        ) : null}
        <Box width={boxW - 2} marginTop={1} flexDirection="column">
          {bridge === 'waiting' ? (
            <SetupHint via={shell.via} extensionDir={shell.extensionDir} />
          ) : status ? (
            <Text color={catalog.error ? theme.bad : theme.muted}>{status}</Text>
          ) : null}
        </Box>
      </Box>
      <Box justifyContent="space-between">
        <KeyHints
          hints={[
            ...(focus === 'list'
              ? [
                  { key: '⏎', label: 'öffnen' },
                  ...(cursor < favTotal ? [{ key: '⌫', label: favItems[cursor]?.ghost ? 'zurückholen' : 'entfernen' }] : []),
                  { key: 'Esc', label: 'Suche' },
                ]
              : [
                  { key: '⏎', label: 'suchen' },
                  { key: 'Tab', label: 'Vorschlag' },
                  ...(entries ? [{ key: '↓', label: favTotal ? 'Favoriten' : 'Zuletzt' }] : []),
                ]),
            { key: '?', label: 'Hilfe' },
            { key: 'Ctrl+C', label: 'Ende' },
          ]}
          message={shell.message?.text ?? null}
          tone={shell.message?.tone ?? 'info'}
        />
        <Box flexShrink={0} paddingX={1}>
          <SettingsLink shell={shell} />
          <BridgeStatus bridge={bridge} via={shell.via} extra={`v${VERSION}`} />
        </Box>
      </Box>
    </Box>
  );
}
