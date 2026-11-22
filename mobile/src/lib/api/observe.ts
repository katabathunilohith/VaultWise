/**
 * A hook on the API for features that want to hear when a named call succeeds, without touching the
 * screens that make it. Only the call's name is passed on, never its arguments. Nothing is wrapped
 * until someone asks, so an ordinary build calls the API directly.
 */
type Listener = (name: string) => void;

let listener: Listener | null = null;
let watched: ReadonlySet<string> = new Set();

export function observeApi(names: string[], fn: Listener) {
  watched = new Set(names);
  listener = fn;
}

export function observed<T>(name: string, value: T): T {
  if (!listener || typeof value !== "function" || !watched.has(name)) return value;
  const call = value as unknown as (...args: unknown[]) => unknown;
  const wrapped = (...args: unknown[]) => {
    const result = call(...args);
    void Promise.resolve(result).then(
      () => listener?.(name),
      () => {},
    );
    return result;
  };
  return wrapped as unknown as T;
}
