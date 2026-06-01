import { createStorage, type NamespacedStorage } from '../../../core';
import type { TileEvaluation } from './evaluator';
import type { GameStatus } from './state';
import { emptyStats, STATS_SCHEMA_VERSION, type TermoStats } from './stats';

const STORAGE_NS = 'arcade.termo';
const SCHEMA_VERSION = 1;

/**
 * Storage schema delta (v1 → v2):
 *
 *  v1 keys (unchanged): `daily`, `dailyMeta`, `infinite`, `infinite.6`,
 *  `infinite.7` — each tagged with `v: 1` and read/written exactly as
 *  before. v1 → v2 leaves these untouched.
 *
 *  v2 adds: a new top-level key `stats` holding a {@link TermoStats}
 *  blob tagged with `schemaVersion: 2`. This is a separate aggregate that
 *  tracks the player's overall record across daily + training; daily
 *  streak in `dailyMeta` is kept in parallel for backwards compat and to
 *  keep the share-string logic unchanged. On first read after the
 *  migration, stats default to zeros (we deliberately don't back-fill
 *  from v1 because pre-v2 data doesn't reliably record per-game
 *  outcomes).
 */

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
  /**
   * Read infinite-mode streak for the given word length. Each length has
   * its own namespaced key (e.g. `streak.infinite.5`, `streak.infinite.6`)
   * so a player's 6-letter streak doesn't reset when they play a 5-letter
   * game.
   */
  readInfinite(wordLength: number): StoredInfinite;
  writeInfinite(wordLength: number, data: Omit<StoredInfinite, 'v'>): void;
  /**
   * v2 stats blob — aggregated win/loss/streak/histogram across daily and
   * training games. Returns a fresh-zeroed object when missing.
   */
  readStats(): TermoStats;
  writeStats(stats: TermoStats): void;
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

function isValidStats(x: unknown): x is TermoStats {
  if (!x || typeof x !== 'object') return false;
  const s = x as Partial<TermoStats>;
  return (
    s.schemaVersion === STATS_SCHEMA_VERSION &&
    typeof s.played === 'number' &&
    typeof s.won === 'number' &&
    typeof s.currentStreak === 'number' &&
    typeof s.maxStreak === 'number' &&
    !!s.winsByAttempt &&
    typeof s.winsByAttempt === 'object' &&
    (s.lastPlayedPuzzle === null || typeof s.lastPlayedPuzzle === 'number')
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

/**
 * Storage key for the per-length infinite streak. Uses a stable scheme so
 * existing keys remain meaningful. For 5-letter we keep the legacy key
 * `infinite` to preserve any pre-existing streaks; for new lengths we use
 * `infinite.{N}`.
 */
export function infiniteStorageKey(wordLength: number): string {
  return wordLength === 5 ? 'infinite' : `infinite.${wordLength}`;
}

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
    readInfinite(wordLength): StoredInfinite {
      const raw = storage.get<unknown>(infiniteStorageKey(wordLength), null);
      if (!isValidInfinite(raw)) return { ...DEFAULT_INFINITE };
      return raw;
    },
    writeInfinite(wordLength, data): void {
      storage.set(infiniteStorageKey(wordLength), { v: SCHEMA_VERSION, ...data });
    },
    readStats(): TermoStats {
      const raw = storage.get<unknown>('stats', null);
      if (!isValidStats(raw)) return emptyStats();
      return raw;
    },
    writeStats(stats: TermoStats): void {
      storage.set('stats', { ...stats, schemaVersion: STATS_SCHEMA_VERSION });
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
