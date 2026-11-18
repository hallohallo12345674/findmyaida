/**
 * offline: keine Verbindung zur Chrome-Erweiterung · unreachable: aida.de bzw. der Zugriffsweg ist nicht erreichbar;
 * die Meldung des Auslösers ist dann schon der Text für Nutzer.
 */
export type ApiErrorKind = 'blocked' | 'http' | 'parse' | 'offline' | 'timeout' | 'nodata' | 'unreachable';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.kind) {
      case 'blocked':
        return 'aida.de hat die Anfrage abgelehnt (Bot-Schutz). Öffne aida.de im Browser, prüfe die Seite und versuche es mit r erneut.';
      case 'offline':
        return 'Keine Browser-Verbindung. Chrome mit der Erweiterung „FindMyAIDA Bridge“ öffnen.';
      case 'timeout':
        return 'Zeitüberschreitung bei der Anfrage an aida.de.';
      case 'nodata':
        return e.message;
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}
