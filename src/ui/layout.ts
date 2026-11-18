/**
 * Sichtbarer Ausschnitt [start, ende) einer Liste mit `total` Einträgen, wenn `size` Zeilen Platz haben.
 * Der Cursor steht möglichst in der Mitte; am Listenende bleibt der Ausschnitt gefüllt.
 */
export function windowAround(total: number, cursor: number, size: number): [number, number] {
  if (total <= size) return [0, total];
  let start = Math.max(0, cursor - Math.floor(size / 2));
  start = Math.min(start, total - size);
  return [start, start + size];
}
