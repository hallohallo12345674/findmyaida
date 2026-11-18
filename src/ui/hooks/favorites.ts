import { useEffect, useRef, useState } from 'react';
import type { AidaClient } from '../../api/client.js';
import { describeError } from '../../api/errors.js';
import type { TransportState } from '../../api/transport.js';
import { isDeparted, type Favorite } from '../../domain/favorites.js';
import type { PriceMatrix } from '../../domain/types.js';
import { checkGroupKey, localDay } from '../favorites.js';

/** Stand der Startprüfung je Reise + Belegung. */
export type CheckStatus = { kind: 'pending' } | { kind: 'loading' } | { kind: 'done' } | { kind: 'error'; text: string };

/**
 * Prüft beim App-Start einmal die Preise aller Favoriten: eine Abfrage je Reise und Belegung, nacheinander über
 * die gedrosselte Warteschlange des Clients (15-min-Cache inklusive). Abgefahrene Reisen werden nicht abgefragt.
 * Solange `paused` gilt (Startseite nicht sichtbar), wird keine neue Abfrage begonnen, damit ein geöffneter
 * Vergleich nicht hinter den Favoriten warten muss.
 */
export function useFavoriteChecks(
  client: AidaClient,
  favorites: Favorite[],
  bridge: TransportState,
  paused: boolean,
  onMatrix: (m: PriceMatrix) => void,
): Map<string, CheckStatus> {
  const [status, setStatus] = useState(() => new Map<string, CheckStatus>());
  const favRef = useRef(favorites);
  favRef.current = favorites;
  const onMatrixRef = useRef(onMatrix);
  onMatrixRef.current = onMatrix;
  const pausedRef = useRef(paused);
  const resume = useRef<(() => void) | null>(null);
  const started = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && resume.current) {
      resume.current();
      resume.current = null;
    }
  }, [paused]);

  useEffect(() => {
    if (bridge === 'waiting' || started.current) return;
    started.current = true;
    const today = localDay(new Date());
    const groups = new Map<string, Favorite>();
    for (const f of favRef.current) {
      if (!isDeparted(f, today) && !groups.has(checkGroupKey(f))) groups.set(checkGroupKey(f), f);
    }
    if (!groups.size) return;
    let alive = true;
    let finished = false;
    const set = (key: string, s: CheckStatus) =>
      setStatus((prev) => {
        const next = new Map(prev);
        next.set(key, s);
        return next;
      });
    setStatus(new Map([...groups.keys()].map((k) => [k, { kind: 'pending' } as CheckStatus])));
    const waitUntilResumed = () =>
      pausedRef.current ? new Promise<void>((r) => (resume.current = r)) : Promise.resolve();
    void (async () => {
      for (const [key, f] of groups) {
        await waitUntilResumed();
        if (!alive) return;
        set(key, { kind: 'loading' });
        try {
          const m = await client.getPrices(f.journeyId, f.pax);
          if (!alive) return;
          onMatrixRef.current(m);
          set(key, { kind: 'done' });
        } catch (e) {
          if (alive) set(key, { kind: 'error', text: describeError(e) });
        }
      }
      finished = true;
    })();
    return () => {
      alive = false;
      // Unterbrochen (z. B. Wechsel des Zugriffswegs): beim nächsten Verbinden neu starten; Erledigtes kommt
      // dann aus dem Cache.
      if (!finished) started.current = false;
    };
  }, [client, bridge]);

  return status;
}
