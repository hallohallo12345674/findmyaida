/** Anzahl Reisende je Kategorie (wie im AIDA-Buchungsprozess). */
export interface Pax {
  adults: number;
  juveniles: number;
  children: number;
  babies: number;
}

export interface Port {
  code: string;
  name: string;
  arrival?: string | null;
  departure?: string | null;
}

/** Ein buchbarer Termin (= JourneyIdentifier, z. B. PR07261128). */
export interface Departure {
  journeyId: string;
  routeKey: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  duration: number;
  shipCode: string;
  shipName: string;
  fromCity: string;
  toCity: string;
  flightIncluded: boolean;
  /** "ab"-Preis aus der Suche (gilt für 2 Erwachsene). */
  fromPrice?: number;
  fromPricePerPerson?: number;
  campaigns: string[];
}

/** Eine Route (Routengruppe) mit allen Terminen. */
export interface Route {
  key: string;
  title: string;
  routeCode: string;
  duration: number;
  flightIncluded: boolean;
  ports: Port[];
  departures: Departure[];
}

export interface Catalog {
  routes: Route[];
  departures: Departure[]; // alle Termine, eindeutig, nach Datum sortiert
  fetchedAt: number;
}

export type TransportKind = 'return' | 'openjaw' | 'outbound' | 'inbound' | 'none';

export interface FlightSegment {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  depDate: string;
  depTime: string;
  arrDate: string;
  arrTime: string;
  airline: string;
  airlineName: string;
  flightNumber: string;
}

export interface FlightLeg {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  depDate: string;
  depTime: string;
  arrDate: string;
  arrTime: string;
  cabinClass: string;
  segments: FlightSegment[];
}

export interface Campaign {
  code: string;
  name: string;
  bookingDateTo?: string;
}

/** Ein konkretes, buchbares Preisangebot. */
export interface Offer {
  id: string;
  journeyId: string;
  tariffCode: string;
  tariffName: string;
  allIn: boolean;
  board: string;
  cabinCode: string;
  cabinName: string;
  cabinType: string;
  cabinGroup: string;
  flex: boolean;
  transport: TransportKind;
  outbound?: FlightLeg;
  inbound?: FlightLeg;
  total: number;
  perPerson: number;
  passengerPrices: number[];
  flightSupplement: number;
  cruisePrice: number;
  earlyBird: number;
  campaigns: Campaign[];
  amenities: string[];
  included: string[];
}

export interface CruiseInfo {
  journeyId: string;
  shipName: string;
  shipCode: string;
  startDate: string;
  endDate: string;
  routeName: string;
  checkIn?: string;
}

export interface PriceMatrix {
  journeyId: string;
  pax: Pax;
  offers: Offer[];
  /** Produkte, die die API ohne Preis/Verfügbarkeit geliefert hat. */
  unavailable: number;
  cruise?: CruiseInfo;
  fetchedAt: number;
}

export interface Filters {
  tariffs: string[];
  cabinGroups: string[];
  transports: TransportKind[];
  depAirports: string[];
  arrAirports: string[];
}

export type ViewId = 1 | 2 | 3 | 4;
export type PriceMode = 'total' | 'pp';
