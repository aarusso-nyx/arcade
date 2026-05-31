/**
 * Deterministic daily-puzzle selection.
 *
 * Every player on the same local-calendar date sees the same solution,
 * computed as a pure function of `now` and the solutions list. Local
 * midnight (not UTC) is the rollover boundary — this matches term.ooo
 * and feels right for a Brazilian audience.
 *
 * Once chosen, LAUNCH_DATE must NEVER change — doing so would renumber
 * every past puzzle and break shared score strings.
 */

/** Frozen at first deploy. Puzzle #1 corresponds to this local-midnight. */
export const LAUNCH_DATE = new Date(2026, 0, 1); // 2026-01-01, local midnight

export const MS_PER_DAY = 86_400_000;

/** Local-midnight of the given Date. */
function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 1-indexed puzzle number for the given local-calendar date.
 * Returns >= 1; clamps to 1 when `now` is before LAUNCH_DATE.
 */
export function dailyPuzzleNumber(now: Date = new Date()): number {
  const today = localMidnight(now);
  const launch = localMidnight(LAUNCH_DATE);
  const diffMs = today.getTime() - launch.getTime();
  const n = Math.floor(diffMs / MS_PER_DAY) + 1;
  return n < 1 ? 1 : n;
}

/** 0-based index into the solutions list for the given date. */
export function dailySolutionIndex(now: Date, solutionsLen: number): number {
  if (solutionsLen <= 0) {
    throw new Error('dailySolutionIndex: solutions list is empty');
  }
  return (dailyPuzzleNumber(now) - 1) % solutionsLen;
}

export function dailySolution(now: Date, solutions: string[]): string {
  return solutions[dailySolutionIndex(now, solutions.length)];
}

/**
 * Milliseconds from `now` until the next local midnight (used for the
 * post-game countdown).
 */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
