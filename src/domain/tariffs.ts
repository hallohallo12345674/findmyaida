export interface TariffInfo {
  code: string;
  name: string;
  short: string;
  /** Pfadsegment im Buchungs-Deeplink (aida.de/buchen/{JID}/{url}/...). */
  url: string;
}

export const TARIFFS: TariffInfo[] = [
  { code: 'LIG', name: 'LIGHT', short: 'LIGHT', url: 'LIGHT' },
  { code: 'CLA', name: 'CLASSIC', short: 'CLASSIC', url: 'CLASSIC' },
  { code: 'IND', name: 'PREMIUM', short: 'PREMIUM', url: 'PREMIUM' },
  { code: 'VAR', name: 'VARIO', short: 'VARIO', url: 'VARIO' },
  { code: 'PAU', name: 'PAUSCHAL', short: 'PAUSCHAL', url: 'PAUSCHAL' },
  { code: 'SEE', name: 'SEETOURS', short: 'SEETOURS', url: 'SEETOURS' },
  { code: 'CLAAI', name: 'CLASSIC ALL IN', short: 'CLASSIC AI', url: 'CLASSICAI' },
  { code: 'INDAI', name: 'PREMIUM ALL IN', short: 'PREMIUM AI', url: 'PREMIUMAI' },
  { code: 'VARAI', name: 'VARIO ALL IN', short: 'VARIO AI', url: 'VARIOAI' },
  { code: 'PAUAI', name: 'PAUSCHAL ALL IN', short: 'PAUSCH. AI', url: 'PAUSCHALAI' },
  { code: 'SEEAI', name: 'SEETOURS ALL IN', short: 'SEET. AI', url: 'SEETOURSAI' },
  { code: 'COMAI', name: 'COMFORT ALL IN', short: 'COMFORT AI', url: 'COMFORTAI' },
];

/** Alle Tarifcodes, die bei der Preisabfrage angefragt werden. Unbekannte Codes ignoriert die API. */
export const ALL_TARIFF_CODES = TARIFFS.map((t) => t.code);

const byCode = new Map(TARIFFS.map((t) => [t.code, t]));

export function tariffInfo(code: string, apiName?: string): TariffInfo {
  return (
    byCode.get(code) ?? {
      code,
      name: apiName ?? code,
      short: (apiName ?? code).slice(0, 10),
      url: apiName ?? code,
    }
  );
}

export function tariffOrder(code: string): number {
  const i = TARIFFS.findIndex((t) => t.code === code);
  return i === -1 ? 999 : i;
}

export function isAllInTariff(code: string): boolean {
  return code.endsWith('AI');
}
