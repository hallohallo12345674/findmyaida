/** Suchanfrage der Reiseübersicht: gewählte Filter als Chips plus freier Text. Wird im Zustand gespeichert. */

export type FilterKind = 'region' | 'month' | 'duration' | 'ship' | 'state' | 'holiday';

export interface QueryChip {
  kind: FilterKind;
  /**
   * region: Code (VRKA) · month: YYYY-MM · duration: "min-max" · ship: Schiffscode (CO)
   * state: Länderkürzel (BY) · holiday: Ferienart (sommer)
   */
  value: string;
  /** Anzeige im Chip (bei Bundesländern platzsparend nur das Kürzel) */
  label: string;
  /** ausführliche Anzeige in der Vorschlagsliste (z. B. „Bayern“) */
  long?: string;
}

export interface TripQuery {
  chips: QueryChip[];
  text: string;
}

export const EMPTY_QUERY: TripQuery = { chips: [], text: '' };
