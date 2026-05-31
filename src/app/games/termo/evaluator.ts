export type TileEvaluation = 'correct' | 'present' | 'absent';

/**
 * Two-pass Wordle-style evaluator with correct duplicate-letter handling.
 *
 * Both `guess` and `solution` must be normalized (uppercase, no diacritics)
 * and exactly 5 characters long.
 *
 * Rule: each letter occurrence in the solution claims at most one tile in
 * the guess. Pass 1 assigns greens (exact-position) and decrements the
 * letter pool. Pass 2 walks left-to-right over remaining positions and
 * paints yellow when the pool still has stock, otherwise gray. See
 * docs/termo/engineering.md section 6 for the worked LLAMA/ALLOY example.
 */
export function evaluateGuess(guess: string, solution: string): TileEvaluation[] {
  if (guess.length !== 5 || solution.length !== 5) {
    throw new Error(
      `evaluateGuess: guess and solution must be length 5 (got ${guess.length}, ${solution.length})`,
    );
  }
  const result: TileEvaluation[] = ['absent', 'absent', 'absent', 'absent', 'absent'];
  const remaining: Record<string, number> = {};

  // Pass 1: exact-position matches (green). Only mismatched positions feed
  // the remaining-letter pool.
  for (let i = 0; i < 5; i++) {
    if (guess[i] === solution[i]) {
      result[i] = 'correct';
    } else {
      const ch = solution[i];
      remaining[ch] = (remaining[ch] ?? 0) + 1;
    }
  }

  // Pass 2: left-to-right, assign present where the pool still has stock.
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue;
    const ch = guess[i];
    if ((remaining[ch] ?? 0) > 0) {
      result[i] = 'present';
      remaining[ch]--;
    }
  }

  return result;
}
