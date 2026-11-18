import { z } from 'zod';

/*
 * Tolerante Schemas für die AIDA-Antworten: nur die Felder, die das Tool nutzt.
 * Unbekannte Felder werden ignoriert, fehlende optionale Felder sind erlaubt.
 */

const str = z.string().nullish();
const num = z.number().nullish();

// ---------- search.filter.json ----------
const NamedCode = z.object({ name: z.string(), code: z.string(), marketingName: str });
export const FilterResponse = z.object({
  cruise: z.array(NamedCode).default([]),
  airport: z.array(NamedCode).default([]),
  regions: z.array(NamedCode).default([]),
  ports: z.array(NamedCode).default([]),
  firstCheckInDate: str,
  lastCheckOutDate: str,
});
export type FilterResponse = z.infer<typeof FilterResponse>;

// ---------- search.cruise.json ----------
const CatalogPort = z.object({
  code: z.string(),
  name: str,
  departureDateTime: str,
  arrivalDateTime: str,
});

const CatalogCampaign = z.object({ code: str, name: str });

const CatalogVariant = z.object({
  journeyIdentifier: z.string(),
  fromCity: str,
  toCity: str,
  startDate: z.string(),
  endDate: z.string(),
  ship: z.object({ name: z.string(), code: z.string() }),
  duration: z.number(),
  amount: num,
  amountPerPerson: num,
  flightIncluded: z.boolean().nullish(),
  campaigns: z.array(CatalogCampaign).nullish(),
});

const CatalogItem = z.object({
  routeGroupCode: z.string(),
  routeCode: z.string(),
  title: z.string(),
  duration: z.number(),
  flightIncluded: z.boolean().nullish(),
  ports: z.array(CatalogPort).default([]),
  cruiseItemVariant: z.array(CatalogVariant).default([]),
});

export const CatalogResponse = z.object({
  resultsTotal: z.number(),
  totalPages: z.number(),
  success: z.boolean().nullish(),
  cruiseItems: z.array(CatalogItem).default([]),
});
export type CatalogResponse = z.infer<typeof CatalogResponse>;
export type CatalogItem = z.infer<typeof CatalogItem>;

// ---------- player.proxy.json (SearchHub) ----------
const FlightSegment = z.object({
  departureAirport: z.string(),
  departureAirportName: str,
  arrivalAirport: z.string(),
  arrivalAirportName: str,
  departureDate: str,
  departureTime: str,
  arrivalDate: str,
  arrivalTime: str,
  airline: str,
  airlineName: str,
  flightNumber: str,
});

const FlightService = z.object({
  departureAirport: z.string(),
  departureAirportName: str,
  arrivalAirport: z.string(),
  arrivalAirportName: str,
  departureDate: str,
  departureTime: str,
  arrivalDate: str,
  arrivalTime: str,
  cabinClass: str,
  direction: str,
  flightSegments: z.array(FlightSegment).nullish(),
});

const CruiseVariant = z.object({
  id: z.number(),
  cabin: z.object({
    cabinCode: z.string(),
    cabinName: str,
    cabinType: str,
    cabinTypeCode: str,
    tariffType: z.string(),
    tariffName: str,
  }),
  board: z.object({ boardType: str }).nullish(),
});

const CruiseService = z.object({
  journeyIdentifier: z.string(),
  startDate: str,
  endDate: str,
  shipCode: str,
  shipName: str,
  properties: z.array(z.object({ code: z.string(), name: str })).nullish(),
  location: z
    .object({ route: z.object({ name: str }).nullish(), routeGroupCode: str })
    .nullish(),
  cruiseVariants: z.array(CruiseVariant).default([]),
});

const Service = z.object({
  id: z.number(),
  cruiseService: CruiseService.nullish(),
  flightService: FlightService.nullish(),
});

const Product = z.object({
  id: z.number(),
  productType: z.string(),
  serviceReferences: z.array(z.object({ serviceId: z.number(), serviceVariantId: num })),
  priceInformation: z.object({
    amount: z.number(),
    availability: num,
    passengerPrices: z.array(z.object({ id: z.number(), amount: z.number() })).nullish(),
    priceDetails: z.array(z.object({ priceType: z.string(), amount: num })).nullish(),
  }),
  campaigns: z
    .array(
      z.object({
        code: str,
        name: str,
        validity: z.object({ bookingDateTo: str }).nullish(),
      }),
    )
    .nullish(),
  amenities: z.array(z.object({ code: str, name: str })).nullish(),
  includedServices: z.array(z.object({ serviceType: str, code: str })).nullish(),
  transportType: str,
});

export const PlayerResponse = z.object({
  processInfo: z
    .object({
      success: z.boolean().nullish(),
      processMessages: z
        .array(z.object({ messageType: str, messageCode: str, message: str }))
        .nullish(),
    })
    .nullish(),
  paging: z.object({ resultsTotal: num }).nullish(),
  products: z.array(Product).default([]),
  services: z.array(Service).default([]),
});
export type PlayerResponse = z.infer<typeof PlayerResponse>;
export type PlayerProduct = z.infer<typeof Product>;
export type PlayerFlightService = z.infer<typeof FlightService>;
