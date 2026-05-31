export interface NamespacedStorage {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clearNamespace(): void;
}

/**
 * Namespaced localStorage helper with safe try/catch around every access so
 * private-mode Safari (and any other environment that throws on storage access)
 * silently degrades instead of crashing the game.
 *
 * Keys are stored as `${namespace}.${key}` (e.g. `arcade.pacman.highScore`).
 */
export function createStorage(namespace: string): NamespacedStorage {
  const ns = namespace.endsWith('.') ? namespace.slice(0, -1) : namespace;
  const full = (key: string): string => `${ns}.${key}`;

  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = localStorage.getItem(full(key));
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    set<T>(key: string, value: T): void {
      try {
        localStorage.setItem(full(key), JSON.stringify(value));
      } catch {
        /* ignore */
      }
    },
    remove(key: string): void {
      try {
        localStorage.removeItem(full(key));
      } catch {
        /* ignore */
      }
    },
    clearNamespace(): void {
      try {
        const prefix = `${ns}.`;
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) toRemove.push(k);
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
      } catch {
        /* ignore */
      }
    },
  };
}
