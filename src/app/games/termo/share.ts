import type { TileEvaluation } from './evaluator';

const EMOJI: Record<TileEvaluation, string> = {
  correct: '🟩',
  present: '🟨',
  absent: '⬜',
};

export interface ShareInput {
  status: 'won' | 'lost';
  puzzleNumber: number;
  guessCount: number; // number of submitted guesses
  evaluations: TileEvaluation[][];
}

/**
 * Build the textual share string. Never contains letters — only the puzzle
 * number, attempt count, and the emoji grid.
 *
 *     Termo 142 4/6
 *
 *     ⬜⬜🟨⬜⬜
 *     🟨⬜🟩⬜⬜
 *     🟩🟩🟩🟨⬜
 *     🟩🟩🟩🟩🟩
 */
export function buildShareString(input: ShareInput): string {
  const header =
    input.status === 'won'
      ? `Termo ${input.puzzleNumber} ${input.guessCount}/6`
      : `Termo ${input.puzzleNumber} X/6`;

  const grid = input.evaluations
    .map((row) => row.map((e) => EMOJI[e]).join(''))
    .join('\n');

  return `${header}\n\n${grid}`;
}
