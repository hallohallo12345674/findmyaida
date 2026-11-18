import React from 'react';
import { Box, Text } from 'ink';
import { cellKey, type Pivot } from '../../domain/compare.js';
import type { Offer, PriceMode } from '../../domain/types.js';
import { fit, fitRight, num, signedEuro, width } from '../format.js';
import { windowAround } from '../layout.js';
import { theme } from '../theme.js';
import { Clickable } from './ui.js';

export function transportTag(o: Offer): string {
  switch (o.transport) {
    case 'return':
      return o.outbound!.from;
    case 'openjaw':
      return `${o.outbound!.from}/${o.inbound!.to}`;
    case 'outbound':
      return `${o.outbound!.from}→`;
    case 'inbound':
      return `→${o.inbound!.to}`;
    default:
      return 'eig.';
  }
}

interface Props {
  pivot: Pivot;
  row: number;
  col: number;
  rowHeader: string;
  width: number;
  height: number;
  priceMode: PriceMode;
  showDelta: boolean;
  showTag: boolean;
  globalMin: number;
  /** Klick auf Zelle (r, c). double = Doppelklick oder erneuter Klick auf die gewählte Zelle. */
  onCell: (r: number, c: number, activate: boolean) => void;
  onWheel: (dir: -1 | 1) => void;
}

export function PivotTable(p: Props) {
  const { pivot } = p;
  if (!pivot.rows.length || !pivot.cols.length) {
    return (
      <Box paddingX={1}>
        <Text color={theme.muted}>Keine Angebote für diese Auswahl. Filter anpassen oder zurücksetzen.</Text>
      </Box>
    );
  }
  const labelW =
    Math.min(26, Math.max(p.rowHeader.length, ...pivot.rows.map((r) => width(r.label) + (r.sub ? r.sub.length + 1 : 0)))) + 3;
  const tagW = p.showTag ? Math.max(0, ...[...pivot.cells.values()].map((o) => transportTag(o).length + 1)) : 0;
  const colW = Math.max(7 + tagW, ...pivot.cols.map((c) => width(c.label) + 1)) + 2;
  const maxCols = Math.max(1, Math.floor((p.width - labelW - 3) / colW));
  const [c0, c1] = windowAround(pivot.cols.length, p.col, maxCols);
  const [r0, r1] = windowAround(pivot.rows.length, p.row, Math.max(1, p.height - 2));
  const cols = pivot.cols.slice(c0, c1);
  const value = (o: Offer) => (p.priceMode === 'pp' ? o.perPerson : o.total);
  const minVal = p.priceMode === 'pp' ? Math.min(...[...pivot.cells.values()].map((o) => o.perPerson)) : pivot.min;

  return (
    <Clickable flexDirection="column" paddingX={1} onWheel={(dir) => p.onWheel(dir)}>
      <Box height={1}>
        <Text color={theme.faint}>{fit(p.rowHeader.toUpperCase(), labelW)}</Text>
        <Text color={theme.faint}>{c0 > 0 ? '‹' : ' '}</Text>
        {cols.map((c, i) => {
          const ci = c0 + i;
          const active = ci === p.col;
          return (
            <Clickable key={c.key} onClick={() => p.onCell(p.row, ci, false)} width={colW}>
              <Text color={active ? theme.accent : theme.muted} bold>
                {fitRight(c.label, colW - 1)}
              </Text>
            </Clickable>
          );
        })}
        <Text color={theme.faint}>{c1 < pivot.cols.length ? ' ›' : ''}</Text>
      </Box>
      {pivot.rows.slice(r0, r1).map((r, ri) => {
        const rowIdx = r0 + ri;
        const activeRow = rowIdx === p.row;
        return (
          <Box key={r.key} height={1}>
            <Clickable onClick={() => p.onCell(rowIdx, p.col, false)} width={labelW}>
              <Text color={activeRow ? theme.accent : undefined} bold={activeRow}>
                {fit(`${activeRow ? '▸ ' : '  '}${r.label}`, labelW - (r.sub ? r.sub.length + 1 : 0))}
                {r.sub ? <Text color={theme.faint}>{` ${r.sub}`}</Text> : null}
              </Text>
            </Clickable>
            <Text> </Text>
            {cols.map((c, i) => {
              const ci = c0 + i;
              const o = pivot.cells.get(cellKey(r.key, c.key));
              const sel = activeRow && ci === p.col;
              const click = (ev: { double: boolean }) => p.onCell(rowIdx, ci, sel || ev.double);
              if (!o) {
                return (
                  <Clickable key={c.key} onClick={click} width={colW}>
                    <Text color={theme.faint} backgroundColor={sel ? theme.accentBg : undefined}>
                      {fitRight('—', colW - 1)}{' '}
                    </Text>
                  </Clickable>
                );
              }
              const v = value(o);
              const main = p.showDelta && v !== minVal ? signedEuro(v - minVal).replace(' €', '') : num(v);
              const tag = p.showTag ? ` ${transportTag(o)}` : '';
              const best = o.total === p.globalMin;
              const pad = Math.max(0, colW - 1 - main.length - tag.length);
              if (sel) {
                return (
                  <Clickable key={c.key} onClick={click} width={colW}>
                    <Text backgroundColor={theme.selBg} color={theme.selFg} bold>
                      {' '.repeat(pad)}
                      {main}
                      {tag}{' '}
                    </Text>
                  </Clickable>
                );
              }
              return (
                <Clickable key={c.key} onClick={click} width={colW}>
                  <Text>
                    {' '.repeat(pad)}
                    <Text color={best ? theme.good : undefined} bold={best}>
                      {main}
                    </Text>
                    <Text color={theme.faint}>{tag}</Text>{' '}
                  </Text>
                </Clickable>
              );
            })}
          </Box>
        );
      })}
      {r1 < pivot.rows.length || r0 > 0 ? (
        <Text color={theme.faint}>
          {'  '}
          {r0 + 1}–{r1} von {pivot.rows.length}
        </Text>
      ) : null}
    </Clickable>
  );
}
