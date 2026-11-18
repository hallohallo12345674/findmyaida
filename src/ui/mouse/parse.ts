export type MouseKind = 'down' | 'up' | 'drag' | 'move' | 'wheelUp' | 'wheelDown';

export interface MouseEvent {
  /** 0-basierte Spalte */
  x: number;
  /** 0-basierte Zeile */
  y: number;
  /** 0 links, 1 Mitte, 2 rechts, -1 unbekannt */
  button: number;
  kind: MouseKind;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

// SGR-Mausprotokoll (xterm 1006): ESC [ < b ; x ; y (M|m). useInput liefert die Folge ohne ESC.
const SGR = /^\x1b?\[<(\d+);(\d+);(\d+)([Mm])$/;

export function isMouseSequence(input: string): boolean {
  return SGR.test(input);
}

export function parseSgrMouse(seq: string): MouseEvent | null {
  const m = SGR.exec(seq);
  if (!m) return null;
  const b = Number(m[1]);
  const x = Number(m[2]) - 1;
  const y = Number(m[3]) - 1;
  const release = m[4] === 'm';
  const mods = { shift: (b & 4) !== 0, meta: (b & 8) !== 0, ctrl: (b & 16) !== 0 };
  if (b & 64) {
    return { x, y, button: -1, kind: (b & 3) === 0 ? 'wheelUp' : 'wheelDown', ...mods };
  }
  const button = b & 3;
  if (b & 32) {
    return { x, y, button: button === 3 ? -1 : button, kind: button === 3 ? 'move' : 'drag', ...mods };
  }
  return { x, y, button, kind: release ? 'up' : 'down', ...mods };
}

/**
 * Escape-Folgen zum Ein- und Ausschalten des Mausmodus: Klicks (1000), Ziehen (1002),
 * jede Bewegung für Hover (1003) und SGR-Koordinaten (1006).
 */
export const MOUSE_ON = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';
export const MOUSE_OFF = '\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l';
/** Nur Klicks, Ziehen und Mausrad (Einstellung „Infos beim Überfahren“ aus) */
export const MOUSE_CLICKS_ON = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
export const HOVER_ON = '\x1b[?1003h';
export const HOVER_OFF = '\x1b[?1003l';
