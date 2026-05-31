import {
  createTermoStorage,
  infiniteStorageKey,
  nextDailyMeta,
  type StoredDailyMeta,
} from './persistence';
import type { NamespacedStorage } from '../../../core';

function fakeStorage(): NamespacedStorage & { _data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    _data: data,
    get<T>(k: string, dflt: T): T {
      return Object.prototype.hasOwnProperty.call(data, k) ? (data[k] as T) : dflt;
    },
    set<T>(k: string, v: T): void {
      data[k] = v;
    },
    remove(k: string): void {
      delete data[k];
    },
    clearNamespace(): void {
      for (const k of Object.keys(data)) delete data[k];
    },
  } as NamespacedStorage & { _data: Record<string, unknown> };
}

const FRESH: StoredDailyMeta = {
  v: 1,
  lastCompletedPuzzleNumber: null,
  currentStreak: 0,
  maxStreak: 0,
  history: [],
};

describe('nextDailyMeta', () => {
  it('starts the streak on first win', () => {
    const out = nextDailyMeta(FRESH, 1, true, 3);
    expect(out.currentStreak).toBe(1);
    expect(out.maxStreak).toBe(1);
    expect(out.lastCompletedPuzzleNumber).toBe(1);
    expect(out.history[0]).toEqual({ puzzle: 1, won: true, attempts: 3 });
  });

  it('continues the streak across consecutive days', () => {
    let m = FRESH;
    m = nextDailyMeta(m, 1, true, 3);
    m = nextDailyMeta(m, 2, true, 4);
    m = nextDailyMeta(m, 3, true, 2);
    expect(m.currentStreak).toBe(3);
    expect(m.maxStreak).toBe(3);
  });

  it('resets the streak when a day is skipped', () => {
    let m = FRESH;
    m = nextDailyMeta(m, 1, true, 3);
    m = nextDailyMeta(m, 2, true, 4);
    m = nextDailyMeta(m, 5, true, 5);
    expect(m.currentStreak).toBe(1);
    expect(m.maxStreak).toBe(2);
  });

  it('zeroes the streak on a loss', () => {
    let m = FRESH;
    m = nextDailyMeta(m, 1, true, 3);
    m = nextDailyMeta(m, 2, false, null);
    expect(m.currentStreak).toBe(0);
    expect(m.maxStreak).toBe(1);
  });

  it('caps history at 30', () => {
    let m = FRESH;
    for (let i = 1; i <= 40; i++) {
      m = nextDailyMeta(m, i, true, 4);
    }
    expect(m.history.length).toBe(30);
    expect(m.history[0].puzzle).toBe(40);
    expect(m.history[29].puzzle).toBe(11);
  });
});

describe('infiniteStorageKey', () => {
  it('uses the legacy unsuffixed key for length 5', () => {
    expect(infiniteStorageKey(5)).toBe('infinite');
  });

  it('uses suffixed keys for new lengths', () => {
    expect(infiniteStorageKey(6)).toBe('infinite.6');
    expect(infiniteStorageKey(7)).toBe('infinite.7');
  });
});

describe('createTermoStorage infinite (per-length)', () => {
  it('reads default when nothing stored', () => {
    const ns = fakeStorage();
    const s = createTermoStorage(ns);
    expect(s.readInfinite(5)).toEqual({ v: 1, bestStreak: 0, currentStreak: 0 });
    expect(s.readInfinite(6)).toEqual({ v: 1, bestStreak: 0, currentStreak: 0 });
  });

  it('writes and reads streaks per length independently', () => {
    const ns = fakeStorage();
    const s = createTermoStorage(ns);
    s.writeInfinite(5, { bestStreak: 3, currentStreak: 2 });
    s.writeInfinite(6, { bestStreak: 1, currentStreak: 1 });
    s.writeInfinite(7, { bestStreak: 10, currentStreak: 5 });

    expect(s.readInfinite(5).currentStreak).toBe(2);
    expect(s.readInfinite(6).currentStreak).toBe(1);
    expect(s.readInfinite(7).currentStreak).toBe(5);
    expect(s.readInfinite(7).bestStreak).toBe(10);

    // Mutating one length must not touch another.
    s.writeInfinite(6, { bestStreak: 0, currentStreak: 0 });
    expect(s.readInfinite(5).currentStreak).toBe(2);
    expect(s.readInfinite(7).currentStreak).toBe(5);
  });

  it('persists 5-letter streak under the legacy key for backwards compat', () => {
    const ns = fakeStorage();
    const s = createTermoStorage(ns);
    s.writeInfinite(5, { bestStreak: 4, currentStreak: 4 });
    expect(ns._data['infinite']).toBeDefined();
    expect(ns._data['infinite.5']).toBeUndefined();
  });

  it('uses suffixed key for 6/7-letter streaks', () => {
    const ns = fakeStorage();
    const s = createTermoStorage(ns);
    s.writeInfinite(6, { bestStreak: 1, currentStreak: 1 });
    s.writeInfinite(7, { bestStreak: 1, currentStreak: 1 });
    expect(ns._data['infinite.6']).toBeDefined();
    expect(ns._data['infinite.7']).toBeDefined();
    expect(ns._data['infinite']).toBeUndefined();
  });
});
