/**
 * Serielle Drossel: höchstens eine Anfrage gleichzeitig und ein Mindestabstand
 * zwischen zwei Anfragen. Hält die Last auf aida.de niedrig.
 */
export class RequestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private last = 0;

  constructor(private readonly minIntervalMs = 300) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        this.last = Date.now();
      }
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
}
