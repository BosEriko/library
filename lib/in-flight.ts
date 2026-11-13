const pending = new Map<string, Promise<unknown>>();

export function inFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = pending.get(key);

  if (running) {
    return running as Promise<T>;
  }

  const promise = run().finally(() => pending.delete(key));

  pending.set(key, promise);

  return promise;
}
