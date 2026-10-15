/**
 * A tiny typed event emitter. Node's EventEmitter is untyped and throws on an "error" event
 * without listeners; services here only need on/emit with typed payloads.
 */
// biome-ignore lint/suspicious/noExplicitAny: listener maps are keyed by arbitrary signatures.
type Listeners = Record<string, (...args: any[]) => void>;

export class Emitter<E extends Listeners> {
  private readonly map = new Map<keyof E, Set<E[keyof E]>>();

  /** Subscribe; returns the unsubscribe function. */
  on<K extends keyof E>(event: K, fn: E[K]): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  emit<K extends keyof E>(event: K, ...args: Parameters<E[K]>): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (error) {
        console.error(`Listener for "${String(event)}" failed:`, error);
      }
    }
  }
}
