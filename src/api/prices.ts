import { cabinGroupOf } from '../domain/cabins.js';
import { paxCount, paxList } from '../domain/pax.js';
import { ALL_TARIFF_CODES, isAllInTariff, tariffInfo } from '../domain/tariffs.js';
import type {
  Campaign,
  CruiseInfo,
  FlightLeg,
  Offer,
  Pax,
  PriceMatrix,
  TransportKind,
} from '../domain/types.js';
import type { PlayerFlightService, PlayerResponse } from './schemas.js';

/** Das SPA übergibt als Suchbeginn den Vortag (nT() im AIDA-Buchungs-SPA). */
export function yesterday(now = new Date()): string {
  const d = new Date(now.getTime() - 86_400_000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Ein Request liefert die komplette Preismatrix einer Reise:
 * alle Tarife × Kabinen-Unterkategorien × Anreisevarianten (inkl. Gabel- und Einzelflügen).
 */
export function buildPriceRequest(journeyId: string, pax: Pax, now = new Date()) {
  return {
    cruise: { journeyIdentifier: [journeyId], tariffTypes: ALL_TARIFF_CODES },
    detailLevel: ['FlightSegments', 'PriceDetails'],
    productTypes: ['Cruise', 'CruisePackage'],
    flight: { allowOpenJaw: true, allowOneway: true },
    period: { start: { preOffset: 0, date: yesterday(now), postOffset: 999 } },
    composition: 'none',
    passengers: paxList(pax).map(({ id, age }) => ({ id, age })),
  };
}

function toLeg(f: PlayerFlightService): FlightLeg {
  return {
    from: f.departureAirport,
    fromName: f.departureAirportName ?? f.departureAirport,
    to: f.arrivalAirport,
    toName: f.arrivalAirportName ?? f.arrivalAirport,
    depDate: f.departureDate ?? '',
    depTime: f.departureTime ?? '',
    arrDate: f.arrivalDate ?? '',
    arrTime: f.arrivalTime ?? '',
    cabinClass: f.cabinClass ?? '',
    segments: (f.flightSegments ?? []).map((s) => ({
      from: s.departureAirport,
      fromName: s.departureAirportName ?? s.departureAirport,
      to: s.arrivalAirport,
      toName: s.arrivalAirportName ?? s.arrivalAirport,
      depDate: s.departureDate ?? '',
      depTime: s.departureTime ?? '',
      arrDate: s.arrivalDate ?? '',
      arrTime: s.arrivalTime ?? '',
      airline: s.airline ?? '',
      airlineName: s.airlineName ?? s.airline ?? '',
      flightNumber: s.flightNumber ?? '',
    })),
  };
}

function transportKind(type: string | null | undefined, out?: FlightLeg, inb?: FlightLeg): TransportKind {
  if (out && inb) {
    if (type === 'Return' && out.from === inb.to) return 'return';
    if (type === 'Return' || type === 'ReturnOpenJaw' || !type) return out.from === inb.to ? 'return' : 'openjaw';
    return out.from === inb.to ? 'return' : 'openjaw';
  }
  if (out) return 'outbound';
  if (inb) return 'inbound';
  return 'none';
}

function includedLabel(serviceType: string | null | undefined, code: string | null | undefined): string {
  if (serviceType === 'RailAndFly') {
    if (code?.endsWith('1')) return 'Rail&Fly 1. Kl.';
    if (code?.endsWith('2')) return 'Rail&Fly 2. Kl.';
    return 'Rail&Fly';
  }
  return serviceType ?? code ?? '';
}

export function normalizePrices(raw: PlayerResponse, journeyId: string, pax: Pax, fetchedAt = Date.now()): PriceMatrix {
  const services = new Map(raw.services.map((s) => [s.id, s]));
  const cruiseSvc = raw.services.find((s) => s.cruiseService)?.cruiseService ?? undefined;
  const variants = new Map<string, NonNullable<typeof cruiseSvc>['cruiseVariants'][number]>();
  for (const s of raw.services) {
    for (const v of s.cruiseService?.cruiseVariants ?? []) variants.set(`${s.id}/${v.id}`, v);
  }

  const n = Math.max(1, paxCount(pax));
  const offers: Offer[] = [];
  let unavailable = 0;

  for (const p of raw.products) {
    const ref = p.serviceReferences.find((r) => r.serviceVariantId != null);
    const variant = ref ? variants.get(`${ref.serviceId}/${ref.serviceVariantId}`) : undefined;
    const price = p.priceInformation;
    if (!variant || !(price.amount > 0) || price.availability === 0) {
      unavailable++;
      continue;
    }

    const legs = p.serviceReferences
      .filter((r) => r !== ref)
      .map((r) => services.get(r.serviceId)?.flightService)
      .filter((f): f is PlayerFlightService => !!f);
    const outSvc = legs.find((f) => f.direction === 'Outbound');
    const inSvc = legs.find((f) => f.direction === 'Inbound');
    const outbound = outSvc ? toLeg(outSvc) : undefined;
    const inbound = inSvc ? toLeg(inSvc) : undefined;

    const details = price.priceDetails ?? [];
    const flightSupplement = details.find((d) => d.priceType === 'FlightSupplement')?.amount ?? 0;
    const earlyBird = details.find((d) => d.priceType === 'EarlyBird')?.amount ?? 0;
    const tariffCode = variant.cabin.tariffType;
    const cabinName = variant.cabin.cabinName ?? variant.cabin.cabinCode;

    const campaigns: Campaign[] = (p.campaigns ?? []).map((c) => {
      const out: Campaign = { code: c.code ?? '', name: c.name ?? c.code ?? '' };
      if (c.validity?.bookingDateTo) out.bookingDateTo = c.validity.bookingDateTo;
      return out;
    });

    const offer: Offer = {
      id: `${journeyId}:${p.id}`,
      journeyId,
      tariffCode,
      tariffName: tariffInfo(tariffCode, variant.cabin.tariffName ?? undefined).name,
      allIn: isAllInTariff(tariffCode),
      board: variant.board?.boardType ?? '',
      cabinCode: variant.cabin.cabinCode,
      cabinName,
      cabinType: variant.cabin.cabinType ?? '',
      cabinGroup: cabinGroupOf(variant.cabin.cabinType ?? undefined, variant.cabin.cabinTypeCode ?? undefined),
      flex: /^flex/i.test(cabinName),
      transport: transportKind(p.transportType, outbound, inbound),
      total: price.amount,
      perPerson: price.amount / n,
      passengerPrices: (price.passengerPrices ?? []).slice().sort((a, b) => a.id - b.id).map((x) => x.amount),
      flightSupplement,
      cruisePrice: price.amount - flightSupplement,
      earlyBird,
      campaigns,
      amenities: (p.amenities ?? []).map((a) => a.name ?? a.code ?? '').filter(Boolean),
      included: (p.includedServices ?? []).map((s) => includedLabel(s.serviceType, s.code)).filter(Boolean),
    };
    if (outbound) offer.outbound = outbound;
    if (inbound) offer.inbound = inbound;
    offers.push(offer);
  }

  const matrix: PriceMatrix = { journeyId, pax, offers, unavailable, fetchedAt };
  if (cruiseSvc) {
    const info: CruiseInfo = {
      journeyId: cruiseSvc.journeyIdentifier,
      shipName: cruiseSvc.shipName ?? '',
      shipCode: cruiseSvc.shipCode ?? '',
      startDate: cruiseSvc.startDate ?? '',
      endDate: cruiseSvc.endDate ?? '',
      routeName: cruiseSvc.location?.route?.name ?? cruiseSvc.location?.routeGroupCode ?? '',
    };
    const ci = cruiseSvc.properties?.find((x) => x.code === 'CheckInStart')?.name;
    const co = cruiseSvc.properties?.find((x) => x.code === 'CheckInEnd')?.name;
    if (ci) info.checkIn = co ? `${ci}–${co}` : ci;
    matrix.cruise = info;
  }
  return matrix;
}
