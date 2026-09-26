// Structural sharing for freshly fetched JSON.
//
// A refetch always produces brand-new objects, even when nothing changed, which invalidates every
// useMemo / React.memo keyed on them. reconcile() walks `next` alongside `prev` and hands back the
// *previous* reference for every subtree that is deep-equal, so only the parts that genuinely
// changed get a new identity (and an entirely unchanged payload returns `prev` itself, letting
// React skip the state update altogether).

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function reconcile<T>(prev: T, next: T): T {
  if (Object.is(prev, next)) return prev;

  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length;
    const merged = next.map((item, index) => {
      const kept = index < prev.length ? reconcile(prev[index], item) : item;
      if (kept !== prev[index]) same = false;
      return kept;
    });
    return (same ? prev : merged) as unknown as T;
  }

  if (isPlainObject(prev) && isPlainObject(next)) {
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    let same = prevKeys.length === nextKeys.length;
    const merged: Record<string, unknown> = {};
    for (const key of nextKeys) {
      const hadKey = Object.prototype.hasOwnProperty.call(prev, key);
      const kept = hadKey ? reconcile(prev[key], next[key]) : next[key];
      merged[key] = kept;
      if (!hadKey || kept !== prev[key]) same = false;
    }
    return (same ? prev : merged) as unknown as T;
  }

  return next;
}
