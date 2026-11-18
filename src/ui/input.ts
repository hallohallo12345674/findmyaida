import { useInput, type Key } from 'ink';
import { isMouseSequence } from './mouse/parse.js';

/** Wie useInput, aber Mausfolgen werden verworfen (sonst landen sie z. B. im Suchfeld). */
export function useKeys(handler: (input: string, key: Key) => void, opts: { isActive?: boolean } = {}): void {
  useInput((input, key) => {
    if (isMouseSequence(input)) return;
    handler(input, key);
  }, opts);
}

/** Druckbares Zeichen, das in ein Eingabefeld gehört. */
export function isPrintable(input: string, key: Key): boolean {
  return (
    !!input &&
    !key.ctrl &&
    !key.meta &&
    !key.tab &&
    !key.return &&
    !key.escape &&
    !key.backspace &&
    !key.delete &&
    !key.upArrow &&
    !key.downArrow &&
    !key.leftArrow &&
    !key.rightArrow &&
    !/[\x00-\x1f]/.test(input)
  );
}
