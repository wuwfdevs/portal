export type StorageKind = "local" | "session";

function area(kind: StorageKind): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    // Merely touching the property throws when site data is blocked.
    return null;
  }
}

/** Read a stored string; null when absent, or when storage is blocked/unavailable. */
export function safeGet(kind: StorageKind, key: string): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Store a string; false when storage is blocked, full, or unavailable (private mode). */
export function safeSet(kind: StorageKind, key: string, value: string): boolean {
  try {
    const storage = area(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Remove a stored key; never throws. */
export function safeRemove(kind: StorageKind, key: string): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
