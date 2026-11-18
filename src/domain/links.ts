import { tariffInfo } from './tariffs.js';
import type { Offer, Pax } from './types.js';

/** Adresse der AIDA-Website, auf der der Buchungsassistent liegt. */
export const AIDA_ORIGIN = 'https://aida.de';

/** Deeplink in den AIDA-Buchungsassistenten, vorbefüllt mit Tarif, Kabinentyp, Belegung und Flughäfen. */
export function bookingLink(o: Offer, pax: Pax): string {
  const tariff = tariffInfo(o.tariffCode, o.tariffName).url;
  const q = new URLSearchParams({
    adults: String(pax.adults),
    juveniles: String(pax.juveniles),
    children: String(pax.children),
    babies: String(pax.babies),
    cabin: o.cabinGroup,
  });
  if (o.outbound || o.inbound) q.set('flightType', 'air');
  if (o.outbound) q.set('depAirport', o.outbound.from);
  if (o.inbound) q.set('arrAirport', o.inbound.to);
  return `${AIDA_ORIGIN}/buchen/${encodeURIComponent(o.journeyId)}/${tariff}/meine-reise/reisende?${q.toString()}`;
}
