import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useStdin, type DOMElement } from 'ink';
import { parseSgrMouse, type MouseEvent } from './parse.js';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LocalMouse extends MouseEvent {
  /** Koordinaten relativ zur linken oberen Ecke des Elements */
  lx: number;
  ly: number;
  double: boolean;
  rect: Rect;
}

export interface ClickHandlers {
  onClick?: (e: LocalMouse) => void;
  /** dir: -1 = nach oben, 1 = nach unten */
  onWheel?: (dir: -1 | 1, e: LocalMouse) => void;
  /** Maus betritt (true) bzw. verlässt (false) das Element – nur bei Bewegungsmeldungen (1003). */
  onHover?: (inside: boolean, e: LocalMouse | null) => void;
}

interface Region {
  id: number;
  ref: React.RefObject<DOMElement | null>;
  layer: number;
  handlers: React.RefObject<ClickHandlers>;
}

interface MouseApi {
  register(r: Omit<Region, 'id'>): () => void;
}

const MouseContext = createContext<MouseApi | null>(null);

/** Absolute Position eines Ink-Elements, berechnet wie in Inks render-node-to-output. */
export function absoluteRect(node: DOMElement | null | undefined): Rect | null {
  const yoga = node?.yogaNode;
  if (!node || !yoga) return null;
  let x = 0;
  let y = 0;
  let n: DOMElement | undefined = node;
  while (n) {
    if (n.yogaNode) {
      x += n.yogaNode.getComputedLeft();
      y += n.yogaNode.getComputedTop();
    }
    n = n.parentNode;
  }
  return { x, y, w: yoga.getComputedWidth(), h: yoga.getComputedHeight() };
}

/**
 * Sucht die Region unter dem Mauszeiger: nur die oberste Ebene zählt (Dialoge sind modal),
 * innerhalb der Ebene gewinnt das kleinste Element, bei Gleichstand das zuletzt registrierte.
 */
export function hitTest<T extends { layer: number; rect: Rect | null }>(regions: T[], x: number, y: number): T | null {
  const live = regions.filter((r) => r.rect && r.rect.w > 0 && r.rect.h > 0);
  if (!live.length) return null;
  const top = Math.max(...live.map((r) => r.layer));
  let best: T | null = null;
  for (const r of live) {
    if (r.layer !== top) continue;
    const { x: rx, y: ry, w, h } = r.rect!;
    if (x < rx || y < ry || x >= rx + w || y >= ry + h) continue;
    if (!best || w * h <= best.rect!.w * best.rect!.h) best = r;
  }
  return best;
}

export function MouseProvider({ children }: { children: React.ReactNode }) {
  const { internal_eventEmitter } = useStdin() as unknown as {
    internal_eventEmitter?: { on(e: string, f: (s: string) => void): void; removeListener(e: string, f: (s: string) => void): void };
  };
  const regions = useRef(new Map<number, Region>());
  const nextId = useRef(1);
  const lastClick = useRef<{ x: number; y: number; t: number } | null>(null);
  const hovered = useRef<Region | null>(null);

  const api = useMemo<MouseApi>(
    () => ({
      register(r) {
        const id = nextId.current++;
        regions.current.set(id, { ...r, id });
        return () => {
          if (hovered.current?.id === id) hovered.current = null;
          regions.current.delete(id);
        };
      },
    }),
    [],
  );

  useEffect(() => {
    if (!internal_eventEmitter) return;
    const onInput = (data: string) => {
      const ev = parseSgrMouse(data);
      if (!ev) return;
      if (ev.kind === 'move' || ev.kind === 'drag') return handleHover(ev);
      if (ev.kind !== 'down' && ev.kind !== 'wheelUp' && ev.kind !== 'wheelDown') return;
      if (ev.kind === 'down' && ev.button !== 0) return;
      const list = [...regions.current.values()]
        .filter((r) => (ev.kind === 'down' ? r.handlers.current?.onClick : r.handlers.current?.onWheel))
        .map((r) => ({ ...r, rect: absoluteRect(r.ref.current) }));
      // Modal-Regel: Ebene anhand aller Regionen bestimmen, nicht nur der passenden.
      const allLayers = [...regions.current.values()]
        .filter((r) => {
          const rect = absoluteRect(r.ref.current);
          return rect && rect.w > 0 && rect.h > 0;
        })
        .map((r) => r.layer);
      const topLayer = allLayers.length ? Math.max(...allLayers) : 0;
      const hit = hitTest(
        list.filter((r) => r.layer === topLayer),
        ev.x,
        ev.y,
      );
      let double = false;
      if (ev.kind === 'down') {
        const now = Date.now();
        const lc = lastClick.current;
        double = !!lc && now - lc.t < 400 && Math.abs(lc.x - ev.x) <= 1 && lc.y === ev.y;
        lastClick.current = double ? null : { x: ev.x, y: ev.y, t: now };
      }
      if (!hit || !hit.rect) return;
      const local: LocalMouse = { ...ev, lx: ev.x - hit.rect.x, ly: ev.y - hit.rect.y, double, rect: hit.rect };
      const h = hit.handlers.current;
      if (ev.kind === 'down') h?.onClick?.(local);
      else h?.onWheel?.(ev.kind === 'wheelUp' ? -1 : 1, local);
    };
    // Hover: nur Ein-/Austritt melden, damit nur bei Wechsel neu gerendert wird.
    const handleHover = (ev: ReturnType<typeof parseSgrMouse> & object) => {
      const live = [...regions.current.values()].map((r) => ({ ...r, rect: absoluteRect(r.ref.current) }));
      const layers = live.filter((r) => r.rect && r.rect.w > 0 && r.rect.h > 0).map((r) => r.layer);
      const topLayer = layers.length ? Math.max(...layers) : 0;
      const hit = hitTest(
        live.filter((r) => r.layer === topLayer && r.handlers.current?.onHover),
        ev.x,
        ev.y,
      );
      const prev = hovered.current;
      if (prev && hit && prev.id === hit.id) return;
      if (prev) prev.handlers.current?.onHover?.(false, null);
      hovered.current = hit ?? null;
      if (hit?.rect) {
        hit.handlers.current?.onHover?.(true, { ...ev, lx: ev.x - hit.rect.x, ly: ev.y - hit.rect.y, double: false, rect: hit.rect });
      }
    };
    internal_eventEmitter.on('input', onInput);
    return () => internal_eventEmitter.removeListener('input', onInput);
  }, [internal_eventEmitter]);

  return <MouseContext.Provider value={api}>{children}</MouseContext.Provider>;
}

/** Macht ein Box-Element klickbar. Die Position wird erst beim Klick gemessen. */
export function useClickable(ref: React.RefObject<DOMElement | null>, handlers: ClickHandlers, layer?: number): void {
  const api = useContext(MouseContext);
  const ctxLayer = useContext(LayerContext);
  const l = layer ?? ctxLayer;
  const h = useRef<ClickHandlers>(handlers);
  h.current = handlers;
  useEffect(() => {
    if (!api) return;
    return api.register({ ref, layer: l, handlers: h });
  }, [api, ref, l]);
}

/** Aktuelle Dialog-Ebene: Klickflächen in Dialogen liegen eine Ebene höher und sind modal. */
export const LayerContext = createContext(0);
