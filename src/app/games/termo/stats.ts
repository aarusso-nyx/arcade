/**
 * Pure stats computation for Termo.
 *
 * Stats are aggregated across all word lengths (5/6/7) because they describe
 * the player, not the difficulty. They are updated on game completion
 * (won OR lost) for non-archived daily / training games. The histogram is
 * keyed by guess count, so a 5-letter win in 4 lands in the same bin as a
 * 7-letter win in 4 — this matches the "win distribution" idiom from Wordle.
 */

export const STATS_SCHEMA_VERSION = 2;

export interface TermoStats {
  schemaVersion: 2;
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  /**
   * Win distribution: index = number of guesses used (1..maxAttempts),
   * value = count of wins at that attempt count. Combined across lengths.
   */
  winsByAttempt: Record<number, number>;
  lastPlayedPuzzle: number | null;
}

export function emptyStats(): TermoStats {
  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    winsByAttempt: {},
    lastPlayedPuzzle: null,
  };
}

export interface StatsOutcome {
  won: boolean;
  /** Guesses used. For a loss pass the loss row count (or 0). */
  attempts: number;
  /**
   * Daily puzzle number, or null for training / infinite games.
   * Used to detect a consecutive-day continuation of the streak.
   */
  puzzleNumber: number | null;
}

/**
 * Apply an outcome to a stats object and return the new stats.
 *
 * Streak rules:
 *  - Win that continues from `lastPlayedPuzzle + 1` daily → currentStreak + 1.
 *  - Win after a non-consecutive daily (gap or first ever) → currentStreak = 1.
 *  - Win on a training game (no puzzleNumber) → currentStreak + 1 (counts
 *    toward the player's streak; the orchestrator decides whether to call
 *    this for training).
 *  - Loss → currentStreak = 0.
 *
 * Archived daily plays must NOT be passed here — they don't count toward
 * stats; the orchestrator gates that.
 */
export function applyOutcome(prev: TermoStats, outcome: StatsOutcome): TermoStats {
  const played = prev.played + 1;
  const won = prev.won + (outcome.won ? 1 : 0);

  let currentStreak: number;
  if (outcome.won) {
    if (
      outcome.puzzleNumber !== null &&
      prev.lastPlayedPuzzle !== null &&
      outcome.puzzleNumber === prev.lastPlayedPuzzle + 1
    ) {
      currentStreak = prev.currentStreak + 1;
    } else if (outcome.puzzleNumber === null) {
      // Training win — extend streak without a daily-number check.
      currentStreak = prev.currentStreak + 1;
    } else {
      currentStreak = 1;
    }
  } else {
    currentStreak = 0;
  }

  const maxStreak = Math.max(prev.maxStreak, currentStreak);

  const winsByAttempt = { ...prev.winsByAttempt };
  if (outcome.won && outcome.attempts > 0) {
    winsByAttempt[outcome.attempts] = (winsByAttempt[outcome.attempts] ?? 0) + 1;
  }

  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    played,
    won,
    currentStreak,
    maxStreak,
    winsByAttempt,
    lastPlayedPuzzle:
      outcome.puzzleNumber !== null ? outcome.puzzleNumber : prev.lastPlayedPuzzle,
  };
}

/** Win % rounded to nearest integer, 0 when nothing played. */
export function winPercent(s: TermoStats): number {
  if (s.played === 0) return 0;
  return Math.round((s.won / s.played) * 100);
}

/** Max bin count across winsByAttempt, or 0 if none. */
export function maxBin(s: TermoStats): number {
  let m = 0;
  for (const v of Object.values(s.winsByAttempt)) {
    if (v > m) m = v;
  }
  return m;
}
