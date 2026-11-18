import React from 'react';
import { Box, Text } from 'ink';
import { transportLabel } from '../../domain/compare.js';
import { priceDelta, type Favorite } from '../../domain/favorites.js';
import { paxCount, paxList, PAX_LABELS } from '../../domain/pax.js';
import { tariffInfo } from '../../domain/tariffs.js';
import type { FlightLeg, Offer, Pax } from '../../domain/types.js';
import { deltaTone, formatDelta } from '../favorites.js';
import { dateShort, dateWeekday, euro, euroDetail, fit, fitRight } from '../format.js';
import { theme } from '../theme.js';
import { Button, Clickable } from './ui.js';

interface Props {
  offer: Offer | undefined;
  pax: Pax;
  min: number;
  width: number;
  onBook: () => void;
  onCopy: () => void;
  /** Favorit zur angezeigten Konfiguration, falls gemerkt */
  favorite?: Favorite | undefined;
  onToggleFavorite?: () => void;
  deltaMode?: 'euro' | 'percent';
  /** Änderungen ab diesem Betrag farbig */
  threshold?: number;
}

interface DeltaOpts {
  mode: 'euro' | 'percent';
  threshold: number;
}

function deltaColor(d: number, threshold: number): string {
  const t = deltaTone(d, threshold);
  return t === 'down' ? theme.good : t === 'up' ? theme.bad : theme.muted;
}

/** Stern zum Merken: ☆ merken / ★ gemerkt. */
export function FavoriteStar({ active, onClick, short = false }: { active: boolean; onClick: () => void; short?: boolean }) {
  return (
    <Clickable onClick={onClick}>
      <Text color={active ? theme.favorite : theme.muted} bold={active}>
        {active ? '★' : '☆'}
        {short ? '' : active ? ' gemerkt' : ' merken'}
      </Text>
    </Clickable>
  );
}

/** Schmale Variante: „★ gemerkt 14.11. für 2.578 € · seitdem −120 €“ */
function FavoriteInline({ fav, opts }: { fav: Favorite; opts: DeltaOpts }) {
  const d = priceDelta(fav, fav.last);
  return (
    <Text>
      <Text color={theme.favorite}>★ </Text>
      <Text color={theme.muted}>
        gemerkt {dateShort(fav.savedAt.slice(0, 10))} für {euroDetail(fav.saved.total)}
      </Text>
      {d === null ? null : (
        <Text color={deltaColor(d, opts.threshold)}> · seitdem {formatDelta(d, fav.saved.total, opts.mode)}</Text>
      )}
      <Text>{'   '}</Text>
    </Text>
  );
}

/** Gemerkt-Block im Stil der Preiszeilen: Vergleichswert und Änderung seitdem (nur bei verfügbarem Angebot). */
function FavoriteLines({ fav, w, opts }: { fav: Favorite; w: number; opts: DeltaOpts }) {
  const d = priceDelta(fav, fav.last);
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.favorite}>★ </Text>
        <Text color={theme.muted}>{fit(`gemerkt ${dateShort(fav.savedAt.slice(0, 10))}`, Math.max(4, w - 14))}</Text>
        <Text>{fitRight(euroDetail(fav.saved.total), 12)}</Text>
      </Text>
      {d === null ? null : (
        <Text>
          <Text color={theme.muted}>{fit('  seitdem', Math.max(4, w - 12))}</Text>
          <Text color={deltaColor(d, opts.threshold)}>{fitRight(formatDelta(d, fav.saved.total, opts.mode), 12)}</Text>
        </Text>
      )}
    </Box>
  );
}

function flights(l: FlightLeg): string {
  return l.segments.map((s) => `${s.airline}${s.flightNumber}`).join(' + ') || '—';
}

function Kv({ label, value, w, strong, color }: { label: string; value: string; w: number; strong?: boolean; color?: string }) {
  return (
    <Text bold={!!strong}>
      <Text color={strong ? undefined : theme.muted}>{fit(label, Math.max(4, w - 12))}</Text>
      <Text color={color}>{fitRight(value, 12)}</Text>
    </Text>
  );
}

function Leg({ title, leg }: { title: string; leg: FlightLeg }) {
  const via = leg.segments.length > 1 ? ` via ${leg.segments.slice(0, -1).map((s) => s.to).join(', ')}` : '';
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.faint} bold>
          {title}
        </Text>
        <Text color={theme.muted}> {dateWeekday(leg.depDate)}</Text>
      </Text>
      <Text wrap="truncate">
        <Text bold>{flights(leg)}</Text>
        {'  '}
        {leg.depTime} {leg.from} → {leg.arrTime} {leg.to}
      </Text>
      <Text color={theme.muted} wrap="truncate">
        {[...new Set(leg.segments.map((s) => s.airlineName))].join('/')}
        {leg.cabinClass ? ` · ${leg.cabinClass}` : ''}
        {via}
      </Text>
    </Box>
  );
}

/** Angebotsdetails als aufgeräumte Karte (Seitenleiste rechts). */
export function Inspector({ offer, pax, min, width, onBook, onCopy, favorite, deltaMode = 'euro', threshold = 0 }: Props) {
  if (!offer) {
    return (
      <Box paddingX={1}>
        <Text color={theme.muted} wrap="wrap">
          Für diese Kombination gibt es kein Angebot. Mit den Pfeiltasten oder per Klick eine andere Zelle wählen.
        </Text>
      </Box>
    );
  }
  const w = width - 2;
  const t = tariffInfo(offer.tariffCode, offer.tariffName);
  const people = paxList(pax);
  const diff = offer.total - min;
  const extras = [...offer.included, ...offer.amenities];
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={theme.accent} wrap="truncate">
        {t.name}
      </Text>
      <Text bold wrap="truncate">
        {offer.cabinName} <Text color={theme.faint}>{offer.cabinCode}</Text>
      </Text>
      <Text color={theme.muted} wrap="truncate">
        {offer.transport === 'none' ? 'Eigene An- und Abreise' : `Flug ${transportLabel(offer)}`}
      </Text>
      <Box height={1} />
      <Kv label="Gesamt" value={euroDetail(offer.total)} w={w} strong />
      {paxCount(pax) > 1 ? <Kv label="pro Person" value={euroDetail(offer.perPerson)} w={w} /> : null}
      <Text color={theme.border}>{'─'.repeat(Math.max(4, w))}</Text>
      <Kv label="Kreuzfahrt" value={euroDetail(offer.cruisePrice)} w={w} />
      {offer.flightSupplement ? <Kv label="Flug" value={euroDetail(offer.flightSupplement)} w={w} /> : null}
      {offer.earlyBird ? <Kv label="Frühbucher" value={euroDetail(offer.earlyBird)} w={w} color={theme.good} /> : null}
      <Text color={diff === 0 ? theme.good : theme.muted} wrap="truncate">
        {diff === 0 ? '✓ günstigstes Angebot' : `+${euro(diff)} zum günstigsten`}
      </Text>
      {favorite ? <FavoriteLines fav={favorite} w={w} opts={{ mode: deltaMode, threshold }} /> : null}
      <Box height={1} />
      <Box>
        <Button label="Buchen ↗" primary onClick={onBook} />
        <Text> </Text>
        <Button label="Link ⧉" onClick={onCopy} />
      </Box>
      <Box height={1} />
      {offer.outbound ? <Leg title="HINFLUG" leg={offer.outbound} /> : null}
      {offer.inbound ? <Leg title="RÜCKFLUG" leg={offer.inbound} /> : null}
      {offer.campaigns.length || extras.length || people.length > 1 ? <Box height={1} /> : null}
      {offer.campaigns.map((c) => (
        <Text key={c.code} color={theme.warn} wrap="truncate">
          {c.name}
          {c.bookingDateTo ? ` · buchbar bis ${dateShort(c.bookingDateTo)}` : ''}
        </Text>
      ))}
      {extras.length ? (
        <Text color={theme.muted} wrap="wrap">
          {extras.join(' · ')}
        </Text>
      ) : null}
      {people.length > 1 ? (
        <Text color={theme.faint} wrap="wrap">
          {offer.passengerPrices.map((v, i) => `${PAX_LABELS[people[i]?.type ?? 'adults'].short} ${euroDetail(v)}`).join(' · ')}
        </Text>
      ) : null}
    </Box>
  );
}

/** Kompakte Variante für schmale Terminals (unter der Tabelle). */
export function InspectorBar({
  offer,
  pax,
  min,
  onBook,
  onCopy,
  favorite,
  onToggleFavorite,
  deltaMode = 'euro',
  threshold = 0,
}: Omit<Props, 'width'>) {
  if (!offer) {
    return (
      <Box paddingX={1}>
        <Text color={theme.muted}>Für diese Kombination gibt es kein Angebot.</Text>
      </Box>
    );
  }
  const t = tariffInfo(offer.tariffCode, offer.tariffName);
  const diff = offer.total - min;
  const leg = (l: FlightLeg | undefined, label: string) =>
    l ? `${label} ${flights(l)} ${dateWeekday(l.depDate).slice(0, 2)} ${l.depTime} ${l.from}→${l.to}` : '';
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text wrap="truncate">
          <Text bold color={theme.accent}>
            {t.name}
          </Text>
          <Text> · {offer.cabinName} </Text>
          <Text color={theme.faint}>{offer.cabinCode}</Text>
          <Text color={theme.muted}> · {transportLabel(offer)}</Text>
        </Text>
        <Box flexShrink={0}>
          {onToggleFavorite ? <FavoriteStar active={!!favorite} onClick={onToggleFavorite} /> : null}
          <Text> </Text>
          <Button label="Buchen ↗" primary onClick={onBook} />
          <Text> </Text>
          <Button label="Link ⧉" onClick={onCopy} />
        </Box>
      </Box>
      <Text wrap="truncate">
        <Text bold>Gesamt {euroDetail(offer.total)}</Text>
        {paxCount(pax) > 1 ? <Text color={theme.muted}> · p.P. {euroDetail(offer.perPerson)}</Text> : null}
        <Text color={theme.muted}> · Kreuzfahrt {euroDetail(offer.cruisePrice)}</Text>
        {offer.flightSupplement ? <Text color={theme.muted}> · Flug {euroDetail(offer.flightSupplement)}</Text> : null}
        {offer.earlyBird ? <Text color={theme.good}> · Frühbucher {euroDetail(offer.earlyBird)}</Text> : null}
        <Text color={diff === 0 ? theme.good : theme.faint}>{diff === 0 ? ' · ✓ günstigstes' : ` · +${euro(diff)}`}</Text>
      </Text>
      <Text color={theme.muted} wrap="truncate">
        {[leg(offer.outbound, 'Hin'), leg(offer.inbound, 'Rück')].filter(Boolean).join('   ') || 'Eigene An- und Abreise'}
      </Text>
      <Text color={theme.warn} wrap="truncate">
        {favorite ? <FavoriteInline fav={favorite} opts={{ mode: deltaMode, threshold }} /> : null}
        {offer.campaigns.map((c) => `${c.name}${c.bookingDateTo ? ` bis ${dateShort(c.bookingDateTo)}` : ''}`).join(', ')}
        <Text color={theme.muted}>{[...offer.included, ...offer.amenities].length ? `  ${[...offer.included, ...offer.amenities].join(' · ')}` : ''}</Text>
      </Text>
    </Box>
  );
}
