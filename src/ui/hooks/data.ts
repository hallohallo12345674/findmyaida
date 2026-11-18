import { useCallback, useEffect, useRef, useState } from 'react';
import { useStdout } from 'ink';
import type { AidaClient } from '../../api/client.js';
import { ApiError, describeError } from '../../api/errors.js';
import type { AccessPath, TransportState } from '../../api/transport.js';
import { samePax } from '../../domain/pax.js';
import type { Catalog, Pax, PriceMatrix } from '../../domain/types.js';

export function useBridgeState(client: AidaClient): TransportState {
  const [state, setState] = useState<TransportState>(client.transport.getState());
  useEffect(() => client.transport.onStateChange(setState), [client]);
  return state;
}

/** Aktueller Zugriffsweg. Er kann sich während der Sitzung ändern, wenn aida.de einen Weg ablehnt. */
export function useAccessPath(client: AidaClient): AccessPath {
  const [via, setVia] = useState<AccessPath>(client.transport.kind);
  useEffect(() => client.transport.onStateChange(() => setVia(client.transport.kind)), [client]);
  return via;
}

export function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ cols: stdout.columns || 100, rows: stdout.rows || 30 });
  useEffect(() => {
    const on = () => setSize({ cols: stdout.columns || 100, rows: stdout.rows || 30 });
    stdout.on('resize', on);
    return () => {
      stdout.off('resize', on);
    };
  }, [stdout]);
  return size;
}

export interface CatalogState {
  catalog: Catalog | null;
  progress: string | null;
  error: string | null;
  reload: () => void;
}

export function useCatalog(client: AidaClient, bridge: TransportState): CatalogState {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (force = false) => {
      setProgress('Katalog wird geladen …');
      setError(null);
      try {
        const c = await client.getCatalog({
          force,
          onProgress: (d, t) => setProgress(`Katalog wird geladen … ${d}/${t}`),
        });
        setCatalog(c);
        setProgress(null);
      } catch (e) {
        setProgress(null);
        setError(describeError(e));
      }
    },
    [client],
  );
  useEffect(() => {
    if (bridge !== 'waiting' && !catalog) void load();
  }, [bridge, catalog, load]);
  return {
    catalog,
    progress,
    error,
    reload: () => {
      setCatalog(null);
      void load(true);
    },
  };
}

export interface PriceState {
  matrix: PriceMatrix | null;
  loading: boolean;
  error: { text: string; offline: boolean } | null;
  reload: () => void;
}

/** Lädt die Preismatrix für Reise + Belegung; veraltete Antworten werden verworfen. */
export function usePriceMatrix(
  client: AidaClient,
  journeyId: string | undefined,
  pax: Pax,
  bridge: TransportState,
): PriceState {
  const [matrix, setMatrix] = useState<PriceMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PriceState['error']>(null);
  const [token, setToken] = useState(0);
  const tokenRef = useRef(0);
  const forceRef = useRef(false);

  useEffect(() => {
    if (!journeyId) return;
    const force = forceRef.current;
    forceRef.current = false;
    const t = ++tokenRef.current;
    const cached = force ? null : client.peekPrices(journeyId, pax);
    if (cached) {
      setMatrix(cached);
      setError(null);
      setLoading(false);
      return;
    }
    if (bridge === 'waiting') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    client
      .getPrices(journeyId, pax, force)
      .then((m) => {
        if (t === tokenRef.current) setMatrix(m);
      })
      .catch((e: unknown) => {
        if (t === tokenRef.current)
          setError({ text: describeError(e), offline: e instanceof ApiError && e.kind === 'offline' });
      })
      .finally(() => {
        if (t === tokenRef.current) setLoading(false);
      });
  }, [client, journeyId, pax, bridge, token]);

  const valid = !!matrix && matrix.journeyId === journeyId && samePax(matrix.pax, pax);
  return {
    matrix: valid ? matrix : null,
    loading,
    error,
    reload: () => {
      forceRef.current = true;
      setToken((x) => x + 1);
    },
  };
}

/** Regionen (Namen aus search.filter.json) und – bei Bedarf – die Reisen je Region. */
export function useRegions(client: AidaClient, bridge: TransportState, wanted: string[]) {
  const [regions, setRegions] = useState<{ code: string; name: string }[]>([]);
  const [ids, setIds] = useState<Map<string, Set<string>>>(new Map());
  const [failed, setFailed] = useState<string[]>([]);
  const loadingRef = useRef(new Set<string>());

  useEffect(() => {
    if (bridge === 'waiting' || regions.length) return;
    client
      .getFilters()
      .then((f) => setRegions(f.regions.map((r) => ({ code: r.code, name: r.marketingName || r.name }))))
      .catch(() => undefined);
  }, [client, bridge, regions.length]);

  const key = wanted.join(',');
  useEffect(() => {
    if (bridge === 'waiting') return;
    for (const code of wanted) {
      if (ids.has(code) || loadingRef.current.has(code)) continue;
      loadingRef.current.add(code);
      client
        .getRegionJourneyIds(code)
        .then((list) => setIds((m) => new Map(m).set(code, new Set(list))))
        .catch(() => {
          setFailed((f) => [...f, code]);
          setIds((m) => new Map(m).set(code, new Set()));
        })
        .finally(() => loadingRef.current.delete(code));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, bridge, key]);

  return { regions, ids, failed };
}
