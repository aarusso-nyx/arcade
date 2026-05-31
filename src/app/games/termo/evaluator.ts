export type TileEvaluation = 'correct' | 'present' | 'absent';

/**
 * Two-pass Wordle-style evaluator with correct duplicate-letter handling.
 *
 * Both `guess` and `solution` must be normalized (uppercase, no diacritics)
 * and exactly the same length. The algorithm is length-agnostic — it works
 * for 5-, 6-, 7- (or any) letter words.
 *
 * Rule: each letter occurrence in the solution claims at most one tile in
 * the guess. Pass 1 assigns greens (exact-position) and decrements the
 * letter pool. Pass 2 walks left-to-right over remaining positions and
 * paints yellow when the pool still has stock, otherwise gray. See
 * docs/termo/engineering.md section 6 for the worked LLAMA/ALLOY example.
 */
export function evaluateGuess(guess: string, solution: string): TileEvaluation[] {
  if (guess.length !== solution.length || guess.length === 0) {
    throw new Error(
      `evaluateGuess: guess and solution must have equal non-zero length (got ${guess.length}, ${solution.length})`,
    );
  }
  const n = guess.length;
  const result: TileEvaluation[] = new Array(n).fill('absent');
  const remaining: Record<string, number> = {};

  // Pass 1: exact-position matches (green). Only mismatched positions feed
  // the remaining-letter pool.
  for (let i = 0; i < n; i++) {
    if (guess[i] === solution[i]) {
      result[i] = 'correct';
    } else {
      const ch = solution[i];
      remaining[ch] = (remaining[ch] ?? 0) + 1;
    }
  }

  // Pass 2: left-to-right, assign present where the pool still has stock.
  for (let i = 0; i < n; i++) {
    if (result[i] === 'correct') continue;
    const ch = guess[i];
    if ((remaining[ch] ?? 0) > 0) {
      result[i] = 'present';
      remaining[ch]--;
    }
  }

  return result;
}
