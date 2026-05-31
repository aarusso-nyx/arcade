import { createStorage, type NamespacedStorage } from '../../../core';
import type { TileEvaluation } from './evaluator';
import type { GameStatus } from './state';

const STORAGE_NS = 'arcade.termo';
const SCHEMA_VERSION = 1;

export interface StoredDaily {
  v: number;
  puzzleNumber: number;
  guesses: string[];
  evaluations: TileEvaluation[][];
  status: GameStatus;
  savedAt: number;
}

export interface HistoryEntry {
  puzzle: number;
  won: boolean;
  attempts: number | null;
}

export interface StoredDailyMeta {
  v: number;
  lastCompletedPuzzleNumber: number | null;
  currentStreak: number;
  maxStreak: number;
  history: HistoryEntry[];
}

export interface StoredInfinite {
  v: number;
  bestStreak: number;
  currentStreak: number;
}

export interface TermoStorage {
  readDaily(): StoredDaily | null;
  writeDaily(data: Omit<StoredDaily, 'v' | 'savedAt'>): void;
  clearDaily(): void;
  readDailyMeta(): StoredDailyMeta;
  writeDailyMeta(meta: Omit<StoredDailyMeta, 'v'>): void;
  readInfinite(): StoredInfinite;
  writeInfinite(data: Omit<StoredInfinite, 'v'>): void;
}

function isValidDaily(x: unknown): x is StoredDaily {
  if (!x || typeof x !== 'object') return false;
  const d = x as Partial<StoredDaily>;
  return (
    d.v === SCHEMA_VERSION &&
    typeof d.puzzleNumber === 'number' &&
    Array.isArray(d.guesses) &&
    Array.isArray(d.evaluations) &&
    typeof d.status === 'string'
  );
}

function isValidMeta(x: unknown): x is StoredDailyMeta {
  if (!x || typeof x !== 'object') return false;
  const m = x as Partial<StoredDailyMeta>;
  return (
    m.v === SCHEMA_VERSION &&
    typeof m.currentStreak === 'number' &&
    typeof m.maxStreak === 'number' &&
    Array.isArray(m.history)
  );
}

function isValidInfinite(x: unknown): x is StoredInfinite {
  if (!x || typeof x !== 'object') return false;
  const i = x as Partial<StoredInfinite>;
  return (
    i.v === SCHEMA_VERSION &&
    typeof i.bestStreak === 'number' &&
    typeof i.currentStreak === 'number'
  );
}

const DEFAULT_META: StoredDailyMeta = {
  v: SCHEMA_VERSION,
  lastCompletedPuzzleNumber: null,
  currentStreak: 0,
  maxStreak: 0,
  history: [],
};

const DEFAULT_INFINITE: StoredInfinite = {
  v: SCHEMA_VERSION,
  bestStreak: 0,
  currentStreak: 0,
};

export function createTermoStorage(
  storage: NamespacedStorage = createStorage(STORAGE_NS),
): TermoStorage {
  return {
    readDaily(): StoredDaily | null {
      const raw = storage.get<unknown>('daily', null);
      if (!isValidDaily(raw)) return null;
      return raw;
    },
    writeDaily(data): void {
      const payload: StoredDaily = {
        v: SCHEMA_VERSION,
        savedAt: Date.now(),
        ...data,
      };
      storage.set('daily', payload);
    },
    clearDaily(): void {
      storage.remove('daily');
    },
    readDailyMeta(): StoredDailyMeta {
      const raw = storage.get<unknown>('dailyMeta', null);
      if (!isValidMeta(raw)) return { ...DEFAULT_META };
      return raw;
    },
    writeDailyMeta(meta): void {
      storage.set('dailyMeta', { v: SCHEMA_VERSION, ...meta });
    },
    readInfinite(): StoredInfinite {
      const raw = storage.get<unknown>('infinite', null);
      if (!isValidInfinite(raw)) return { ...DEFAULT_INFINITE };
      return raw;
    },
    writeInfinite(data): void {
      storage.set('infinite', { v: SCHEMA_VERSION, ...data });
    },
  };
}

/**
 * Pure helper: compute updated dailyMeta after a daily game completes.
 * - On win: bump currentStreak if puzzleNumber == lastCompleted+1, else reset to 1.
 * - On loss: currentStreak = 0.
 * - maxStreak = max(maxStreak, currentStreak).
 * - Append to history (capped at last 30).
 */
export function nextDailyMeta(
  prev: StoredDailyMeta,
  puzzleNumber: number,
  won: boolean,
  attempts: number | null,
): StoredDailyMeta {
  let currentStreak: number;
  if (won) {
    if (prev.lastCompletedPuzzleNumber === puzzleNumber - 1) {
      currentStreak = prev.currentStreak + 1;
    } else {
      currentStreak = 1;
    }
  } else {
    currentStreak = 0;
  }
  const maxStreak = Math.max(prev.maxStreak, currentStreak);
  const entry: HistoryEntry = { puzzle: puzzleNumber, won, attempts };
  // Avoid duplicating an entry for the same puzzle (e.g. on re-completion attempts).
  const history = [
    entry,
    ...prev.history.filter((h) => h.puzzle !== puzzleNumber),
  ].slice(0, 30);
  return {
    v: SCHEMA_VERSION,
    lastCompletedPuzzleNumber: puzzleNumber,
    currentStreak,
    maxStreak,
    history,
  };
}
