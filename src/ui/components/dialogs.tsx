import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { cabinGroupLabel, cabinGroupOrder } from '../../domain/cabins.js';
import { DEFAULT_FILTERS, TRANSPORT_KINDS, airportsOf } from '../../domain/compare.js';
import { MAX_PAX_PER_CABIN, PAX_KEYS, PAX_LABELS, paxCount, paxSummary, samePax, validatePax } from '../../domain/pax.js';
import { tariffInfo, tariffOrder } from '../../domain/tariffs.js';
import type { Departure, Filters, Offer, Pax } from '../../domain/types.js';
import { dateDE, dateWeekday, fit, fitRight, num } from '../format.js';
import { useKeys } from '../input.js';
import { windowAround } from '../layout.js';
import { theme } from '../theme.js';
import { Button, Clickable, Dialog } from './ui.js';

interface DialogBase {
  cols: number;
  rows: number;
  onClose: () => void;
}

// ------------------------------------------------------------------ Filter

export type FilterSection = keyof Filters;

interface SectionDef {
  key: FilterSection;
  title: string;
  options: { value: string; label: string; disabled?: boolean }[];
}

export function filterSections(offers: Offer[], filters: Filters): SectionDef[] {
  const tariffs = [...new Set([...offers.map((o) => o.tariffCode), ...filters.tariffs])].sort(
    (a, b) => tariffOrder(a) - tariffOrder(b),
  );
  const groups = [...new Set([...offers.map((o) => o.cabinGroup), ...filters.cabinGroups])].sort(
    (a, b) => cabinGroupOrder(a) - cabinGroupOrder(b),
  );
  const airports = (dir: 'out' | 'in', sel: string[]) => {
    const list = airportsOf(offers, dir);
    for (const code of sel) if (!list.some((a) => a.code === code)) list.push({ code, name: code });
    return list.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }));
  };
  const short: Record<string, string> = {
    return: 'Hin- & Rückflug',
    openjaw: 'Gabelflug',
    outbound: 'nur Hinflug',
    inbound: 'nur Rückflug',
    none: 'Eigene Anreise',
  };
  return [
    {
      key: 'transports',
      title: 'Anreise',
      options: TRANSPORT_KINDS.map((t) => ({
        value: t.kind,
        label: short[t.kind] ?? t.label,
        disabled: !offers.some((o) => o.transport === t.kind),
      })),
    },
    { key: 'depAirports', title: 'Abflughafen', options: airports('out', filters.depAirports) },
    { key: 'arrAirports', title: 'Rückflughafen', options: airports('in', filters.arrAirports) },
    { key: 'tariffs', title: 'Tarif', options: tariffs.map((c) => ({ value: c, label: tariffInfo(c).name })) },
    { key: 'cabinGroups', title: 'Kabine', options: groups.map((g) => ({ value: g, label: cabinGroupLabel(g) })) },
  ];
}

/** Leere Auswahl bedeutet „alle“. Abwählen aus „alle“ heißt „alle außer diesem“. */
export function toggleValue(values: string[], v: string, all: string[]): string[] {
  const cur = values.length ? values : all;
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  if (!next.length || next.length === all.length) return [];
  return next;
}

export function FilterDialog({
  offers,
  filters,
  initial,
  onApply,
  defaults = DEFAULT_FILTERS,
  ...base
}: DialogBase & {
  offers: Offer[];
  filters: Filters;
  initial: FilterSection;
  onApply: (f: Filters) => void;
  /** Ziel von „Zurücksetzen“: die Standardfilter aus den Einstellungen */
  defaults?: Filters;
}) {
  const [draft, setDraft] = useState<Filters>(filters);
  const sections = filterSections(offers, draft);
  const [sec, setSec] = useState(Math.max(0, sections.findIndex((s) => s.key === initial)));
  const [item, setItem] = useState(0);
  const cur = sections[sec]!;
  const values = (s: SectionDef) => draft[s.key] as string[];
  const toggle = (s: SectionDef, v: string) =>
    setDraft({ ...draft, [s.key]: toggleValue(values(s), v, s.options.map((o) => o.value)) });

  useKeys((input, key) => {
    if (key.escape) return base.onClose();
    if (key.return) return onApply(draft);
    if (key.leftArrow) {
      setSec((sec + sections.length - 1) % sections.length);
      return setItem(0);
    }
    if (key.rightArrow || key.tab) {
      setSec((sec + 1) % sections.length);
      return setItem(0);
    }
    if (key.upArrow) return setItem(Math.max(0, item - 1));
    if (key.downArrow) return setItem(Math.min(cur.options.length - 1, item + 1));
    const opt = cur.options[item];
    if (input === ' ' && opt) return toggle(cur, opt.value);
    if (input === 'o' && opt) return setDraft({ ...draft, [cur.key]: [opt.value] });
    if (input === 'a') return setDraft({ ...draft, [cur.key]: [] });
    if (input === 'x') return setDraft(defaults);
  });

  const width = Math.min(base.cols - 4, 112);
  const secW = Math.max(20, Math.floor((width - 4) / sections.length));
  const fits = Math.max(1, Math.floor((width - 4) / secW));
  let s0 = Math.max(0, sec - Math.floor(fits / 2));
  s0 = Math.min(s0, Math.max(0, sections.length - fits));
  const visible = sections.slice(s0, s0 + fits);
  const maxOpts = Math.max(...sections.map((s) => s.options.length), 1);
  const listH = Math.min(maxOpts, Math.max(3, base.rows - 12));

  return (
    <Dialog title="Filter" width={width} screenCols={base.cols} screenRows={base.rows} onClose={base.onClose}>
      <Box marginTop={1}>
        {s0 > 0 ? <Text color={theme.faint}>‹ </Text> : null}
        {visible.map((s) => {
          const si = sections.indexOf(s);
          const focusedSec = si === sec;
          const vals = values(s);
          return (
            <Box key={s.key} flexDirection="column" width={secW} paddingRight={2}>
              <Clickable
                onClick={() => {
                  setSec(si);
                  setItem(0);
                }}
              >
                <Text bold color={focusedSec ? theme.accent : theme.muted}>
                  {s.title.toUpperCase()}
                  <Text color={theme.faint} bold={false}>
                    {vals.length ? ` ${vals.length}` : ' alle'}
                  </Text>
                </Text>
              </Clickable>
              {s.options.length === 0 ? <Text color={theme.faint}>—</Text> : null}
              {s.options.slice(0, listH).map((o, oi) => {
                const on = !vals.length || vals.includes(o.value);
                const active = focusedSec && oi === item;
                return (
                  <Clickable
                    key={o.value}
                    onClick={() => {
                      setSec(si);
                      setItem(oi);
                      toggle(s, o.value);
                    }}
                  >
                    <Text backgroundColor={active ? theme.accentBg : undefined} wrap="truncate">
                      <Text color={on ? theme.accent : theme.faint} backgroundColor={active ? theme.accentBg : undefined}>
                        {on ? '■ ' : '□ '}
                      </Text>
                      <Text color={o.disabled ? theme.faint : undefined} backgroundColor={active ? theme.accentBg : undefined}>
                        {fit(o.label, secW - 4)}
                      </Text>
                    </Text>
                  </Clickable>
                );
              })}
            </Box>
          );
        })}
        {s0 + fits < sections.length ? <Text color={theme.faint}> ›</Text> : null}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Text color={theme.faint} wrap="truncate">
          Leertaste/Klick umschalten · o nur dieses · a alle · ←→ Bereich
        </Text>
        <Box flexShrink={0}>
          <Button label="Zurücksetzen" onClick={() => setDraft(defaults)} />
          <Text> </Text>
          <Button label="Übernehmen ⏎" primary onClick={() => onApply(draft)} />
        </Box>
      </Box>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Belegung

const PRESETS: Pax[] = [
  { adults: 2, juveniles: 0, children: 0, babies: 0 },
  { adults: 1, juveniles: 0, children: 0, babies: 0 },
  { adults: 3, juveniles: 0, children: 0, babies: 0 },
  { adults: 2, juveniles: 0, children: 1, babies: 0 },
  { adults: 2, juveniles: 0, children: 2, babies: 0 },
  { adults: 2, juveniles: 1, children: 0, babies: 0 },
];

export function PaxDialog({ pax: initial, history, onApply, ...base }: DialogBase & { pax: Pax; history: Pax[]; onApply: (p: Pax) => void }) {
  const [pax, setPax] = useState<Pax>(initial);
  const [row, setRow] = useState(0);
  const quick = [...history, ...PRESETS].filter((x, i, arr) => arr.findIndex((y) => samePax(x, y)) === i).slice(0, 9);
  const err = validatePax(pax);
  const change = (k: keyof Pax, d: number) => {
    const n = pax[k] + d;
    if (n < 0 || (d > 0 && paxCount(pax) >= MAX_PAX_PER_CABIN)) return;
    setPax({ ...pax, [k]: n });
  };
  useKeys((input, key) => {
    if (key.escape) return base.onClose();
    if (key.return) {
      if (!err) onApply(pax);
      return;
    }
    if (key.upArrow) return setRow(Math.max(0, row - 1));
    if (key.downArrow) return setRow(Math.min(PAX_KEYS.length - 1, row + 1));
    const k = PAX_KEYS[row]!;
    if (key.rightArrow || input === '+') return change(k, 1);
    if (key.leftArrow || input === '-') return change(k, -1);
    const n = Number(input);
    if (n >= 1 && n <= quick.length) onApply(quick[n - 1]!);
  });
  return (
    <Dialog title="Belegung der Kabine" width={52} screenCols={base.cols} screenRows={base.rows} onClose={base.onClose}>
      <Box flexDirection="column" marginTop={1}>
        {PAX_KEYS.map((k, i) => (
          <Box key={k}>
            <Clickable onClick={() => setRow(i)} width={26}>
              <Text color={i === row ? theme.accent : undefined} bold={i === row}>
                {PAX_LABELS[k].many.padEnd(12)}
                <Text color={theme.faint} bold={false}>
                  {PAX_LABELS[k].ages}
                </Text>
              </Text>
            </Clickable>
            <Clickable onClick={() => change(k, -1)}>
              <Text backgroundColor={theme.chipBg}> − </Text>
            </Clickable>
            <Text bold>{` ${pax[k]} `}</Text>
            <Clickable onClick={() => change(k, 1)}>
              <Text backgroundColor={theme.chipBg}> + </Text>
            </Clickable>
          </Box>
        ))}
        <Text color={err ? theme.bad : theme.good}>{err ?? `→ ${paxSummary(pax)}`}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.faint} bold>
          SCHNELLWAHL
        </Text>
        {quick.map((q, i) => (
          <Clickable key={i} onClick={() => onApply(q)}>
            <Text>
              <Text color={theme.accent}>{i + 1}</Text> {paxSummary(q)}
              {samePax(q, initial) ? <Text color={theme.faint}> (aktuell)</Text> : null}
            </Text>
          </Clickable>
        ))}
      </Box>
      <Box marginTop={1} justifyContent="flex-end">
        <Button label="Abbrechen" onClick={base.onClose} />
        <Text> </Text>
        <Button label="Übernehmen ⏎" primary onClick={() => !err && onApply(pax)} />
      </Box>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Termine

export function DatesDialog({
  departures,
  current,
  onSelect,
  ...base
}: DialogBase & { departures: Departure[]; current: string; onSelect: (d: Departure) => void }) {
  const [cursor, setCursor] = useState(Math.max(0, departures.findIndex((d) => d.journeyId === current)));
  useKeys((_input, key) => {
    if (key.escape) return base.onClose();
    if (key.return) {
      const d = departures[cursor];
      if (d) onSelect(d);
      return;
    }
    if (key.upArrow) setCursor(Math.max(0, cursor - 1));
    if (key.downArrow) setCursor(Math.min(departures.length - 1, cursor + 1));
  });
  const [start, end] = windowAround(departures.length, cursor, Math.max(3, base.rows - 8));
  return (
    <Dialog title="Termine dieser Route" width={62} screenCols={base.cols} screenRows={base.rows} onClose={base.onClose}>
      <Box flexDirection="column" marginTop={1}>
        {departures.length === 0 ? <Text color={theme.muted}>Keine weiteren Termine bekannt.</Text> : null}
        {departures.slice(start, end).map((d, i) => {
          const idx = start + i;
          const active = idx === cursor;
          const isCur = d.journeyId === current;
          return (
            <Clickable key={d.journeyId} onClick={() => onSelect(d)}>
              <Text backgroundColor={active ? theme.accentBg : undefined} color={isCur ? theme.accent : undefined}>
                {active ? '▸ ' : '  '}
                {fit(`${dateWeekday(d.startDate)}${d.startDate.slice(2, 4)} – ${dateDE(d.endDate)}`, 26)}
                {fit(d.shipName, 12)}
                <Text color={theme.muted} backgroundColor={active ? theme.accentBg : undefined}>
                  {fitRight(d.fromPricePerPerson ? `ab ${num(d.fromPricePerPerson)} € p.P.` : '', 18)}
                </Text>
              </Text>
            </Clickable>
          );
        })}
      </Box>
      <Text color={theme.faint}>„ab“-Preise aus der Suche (2 Erwachsene)</Text>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Hilfe

const HELP: [string, [string, string][]][] = [
  [
    'Start & Reisen',
    [
      ['Tippen', 'Ziel, Hafen, Schiff, Datum oder Reisenummer suchen'],
      ['region: monat:', 'Befehle, außerdem dauer: und schiff:, z. B. „dauer:8-14“'],
      ['land: ferien:', 'Schulferien, z. B. „land:by ferien:sommer“ · Ctrl+T Details'],
      ['Tab  ←→', 'Vorschlag übernehmen / wechseln'],
      ['⏎', 'suchen bzw. Preise der gewählten Reise vergleichen'],
      ['/alle /hilfe', 'alle Reisen, Hilfe, /einstellungen (auch ⚙ oben), /beenden'],
      ['↓  ⌫', 'Startseite: Favoriten und Zuletzt · Favorit entfernen'],
      ['Esc', 'Suche leeren, danach zurück'],
    ],
  ],
  [
    'Vergleich',
    [
      ['1–4  Tab', 'Kabine × Tarif · Anreise × Tarif · Anreise × Kabine · Angebote'],
      ['←↑↓→', 'Zelle wählen (die Auswahl gilt in allen Ansichten)'],
      ['⏎ / Esc', 'Angebote der Zelle / zurück'],
      ['<  >', 'festgehaltene Kabine bzw. Tarif wechseln (Ansicht 2/3)'],
      ['−  +  D', 'vorheriger / nächster Termin, Terminliste'],
      ['f  a t k F', 'Filter (Anreise, Tarif, Kabine, Rückflughafen), x zurücksetzen'],
      ['b  p  d  u', 'Belegung · Preis gesamt/p.P. · Differenz · Unterkategorien'],
      ['s  S', 'Angebote sortieren (Feld / Richtung)'],
      ['o  y  r  m', 'buchen im Browser · Link kopieren · neu laden · merken ★'],
      ['/  Esc', 'zurück zu den Reisen'],
    ],
  ],
  [
    'Maus',
    [
      ['Klick', 'Zelle, Zeile, Tab, Chip oder Button auswählen'],
      ['Doppelklick', 'Reise öffnen bzw. Angebote der Zelle anzeigen'],
      ['Mausrad', 'Listen und Tabellen scrollen'],
      ['Klick daneben', 'Dialog schließen'],
    ],
  ],
];

export function HelpDialog(base: DialogBase) {
  useKeys(() => base.onClose());
  return (
    <Dialog title="Hilfe" width={84} screenCols={base.cols} screenRows={base.rows} onClose={base.onClose}>
      {HELP.map(([title, rows]) => (
        <Box key={title} flexDirection="column" marginTop={1}>
          <Text color={theme.faint} bold>
            {title.toUpperCase()}
          </Text>
          {rows.map(([k, v]) => (
            <Text key={k} wrap="truncate">
              <Text color={theme.accent} bold>
                {k.padEnd(16)}
              </Text>
              <Text>{v}</Text>
            </Text>
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={theme.faint} wrap="wrap">
          Preise live aus der AIDA-Preisengine (AIDA Flug). Wunschflug, Bahn und Versicherungen sind nicht enthalten. Beliebige
          Taste schließt.
        </Text>
      </Box>
    </Dialog>
  );
}
