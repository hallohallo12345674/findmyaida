import React from 'react';
import { Box, Text } from 'ink';
import { shortCabinName, transportLabel, type SortField } from '../../domain/compare.js';
import { tariffInfo } from '../../domain/tariffs.js';
import type { FlightLeg, Offer, PriceMode } from '../../domain/types.js';
import { dateWeekday, fit, fitRight, num, signedEuro } from '../format.js';
import { windowAround } from '../layout.js';
import { theme } from '../theme.js';
import { Clickable } from './ui.js';

interface Props {
  offers: Offer[];
  index: number;
  width: number;
  height: number;
  priceMode: PriceMode;
  showDelta: boolean;
  min: number;
  sortField: SortField;
  sortDesc: boolean;
  onSelect: (i: number) => void;
  onSort: (f: SortField) => void;
  onWheel: (dir: -1 | 1) => void;
}

export function legShort(l: FlightLeg | undefined): string {
  if (!l) return '';
  const s = l.segments[0];
  const fn = s ? `${s.airline}${s.flightNumber}` : '';
  return `${fn} ${dateWeekday(l.depDate).slice(0, 2)} ${l.depTime}`.trim();
}

interface Col {
  id: string;
  title: string;
  w: number;
  right?: boolean;
  sort?: SortField;
  get: (o: Offer) => string;
}

export function OfferTable(p: Props) {
  if (!p.offers.length) {
    return (
      <Box paddingX={1}>
        <Text color={theme.muted}>Keine Angebote für diese Auswahl.</Text>
      </Box>
    );
  }
  const price = (o: Offer) => (p.priceMode === 'pp' ? o.perPerson : o.total);
  const minVal = p.priceMode === 'pp' ? Math.min(...p.offers.map((o) => o.perPerson)) : p.min;
  const all: Col[] = [
    { id: 'tariff', title: 'TARIF', w: 11, sort: 'tariff', get: (o) => tariffInfo(o.tariffCode, o.tariffName).short },
    { id: 'cabin', title: 'KABINE', w: 22, sort: 'cabin', get: (o) => `${shortCabinName(o.cabinName)} ${o.cabinCode}` },
    { id: 'transport', title: 'ANREISE', w: 17, sort: 'transport', get: (o) => transportLabel(o) },
    { id: 'out', title: 'HINFLUG', w: 16, sort: 'departure', get: (o) => legShort(o.outbound) },
    { id: 'in', title: 'RÜCKFLUG', w: 16, get: (o) => legShort(o.inbound) },
    { id: 'price', title: p.priceMode === 'pp' ? 'P.P.' : 'GESAMT', w: 9, right: true, sort: 'price', get: (o) => num(price(o)) },
    {
      id: 'delta',
      title: 'Δ',
      w: 7,
      right: true,
      get: (o) => (price(o) === minVal ? '' : signedEuro(price(o) - minVal).replace(' €', '')),
    },
  ];
  let cols = p.showDelta ? all : all.filter((c) => c.id !== 'delta');
  const total = () => cols.reduce((a, c) => a + c.w + 1, 0) + 3;
  for (const drop of ['in', 'out', 'delta']) {
    if (total() <= p.width) break;
    cols = cols.filter((c) => c.id !== drop);
  }
  const size = Math.max(1, p.height - 2);
  const [start, end] = windowAround(p.offers.length, p.index, size);
  const rows = p.offers.slice(start, end);
  const cell = (c: Col, s: string) => (c.right ? fitRight(s, c.w) : fit(s, c.w));

  return (
    <Clickable flexDirection="column" paddingX={1} onWheel={(d) => p.onWheel(d)}>
      <Box height={1}>
        <Text> </Text>
        {cols.map((c) => {
          const active = c.sort === p.sortField;
          const label = active ? `${c.title} ${p.sortDesc ? '▼' : '▲'}` : c.title;
          return (
            <Clickable key={c.id} {...(c.sort ? { onClick: () => p.onSort(c.sort!) } : {})} marginRight={1}>
              <Text color={active ? theme.accent : theme.faint} bold>
                {cell(c, label)}
              </Text>
            </Clickable>
          );
        })}
      </Box>
      {rows.map((o, i) => {
        const idx = start + i;
        const sel = idx === p.index;
        const best = o.total === p.min;
        const line = cols.map((c) => cell(c, c.get(o))).join(' ');
        return (
          <Clickable key={o.id} onClick={() => p.onSelect(idx)}>
            {sel ? (
              <Text backgroundColor={theme.selBg} color={theme.selFg} bold>
                {'▌'}
                {line}{' '}
              </Text>
            ) : (
              <Text color={best ? theme.good : undefined}>
                {' '}
                {line}
              </Text>
            )}
          </Clickable>
        );
      })}
    </Clickable>
  );
}
