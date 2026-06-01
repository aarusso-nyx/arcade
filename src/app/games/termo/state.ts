import { evaluateGuess, type TileEvaluation } from './evaluator';

export type GameStatus = 'playing' | 'won' | 'lost';
export type KeyState = TileEvaluation | 'unseen';
export type GameMode = 'daily' | 'infinite';

export interface GameState {
  mode: GameMode;
  /** Word length for this game (5, 6, or 7). */
  wordLength: number;
  /** Max guesses for this game; equals `wordLength + 1`. */
  maxAttempts: number;
  solution: string; // normalized, length === wordLength
  solutionAccented: string; // for end-of-game reveal display
  puzzleNumber: number | null; // daily only

  guesses: string[];
  evaluations: TileEvaluation[][];

  currentRow: number;
  currentInput: string;

  status: GameStatus;
  keyStates: Record<string, KeyState>;
}

export type Action =
  | { type: 'TYPE_LETTER'; letter: string }
  | { type: 'BACKSPACE' }
  | { type: 'SUBMIT' };

export type Effect =
  | { type: 'SHAKE_ROW'; row: number }
  | { type: 'TOAST'; message: string }
  | { type: 'FLIP_REVEAL'; row: number }
  | { type: 'BOUNCE_WIN'; row: number }
  | { type: 'PERSIST' }
  /**
   * Emitted on the SUBMIT that flips the game out of `playing` (won OR lost).
   * The orchestrator decides whether the outcome counts toward player stats
   * (archived daily plays are skipped); the reducer just signals the event.
   */
  | { type: 'STATS_UPDATED'; won: boolean; attempts: number };

export interface ReduceResult {
  state: GameState;
  effects: Effect[];
}

/**
 * Daily-mode default. Daily puzzles are 5-letter only by convention; only
 * infinite/training mode supports the variable-length selector.
 */
export const DEFAULT_WORD_LENGTH = 5;
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Max attempts for a game with the given word length: N + 1. */
export function maxAttemptsFor(wordLength: number): number {
  return wordLength + 1;
}

export interface ValidGuessSource {
  has(word: string): boolean;
}

const KEY_RANK: Record<KeyState, number> = {
  unseen: 0,
  absent: 1,
  present: 2,
  correct: 3,
};

export function bumpKeyState(prev: KeyState, next: TileEvaluation): KeyState {
  return KEY_RANK[next] > KEY_RANK[prev] ? next : prev;
}

export function emptyKeyStates(): Record<string, KeyState> {
  const out: Record<string, KeyState> = {};
  for (const ch of ALPHABET) out[ch] = 'unseen';
  return out;
}

export interface InitOptions {
  mode: GameMode;
  solution: string;
  solutionAccented?: string;
  puzzleNumber?: number | null;
  /** Defaults to the length of `solution`. */
  wordLength?: number;
}

export function createInitialState(opts: InitOptions): GameState {
  const wordLength = opts.wordLength ?? opts.solution.length;
  return {
    mode: opts.mode,
    wordLength,
    maxAttempts: maxAttemptsFor(wordLength),
    solution: opts.solution,
    solutionAccented: opts.solutionAccented ?? opts.solution,
    puzzleNumber: opts.puzzleNumber ?? null,
    guesses: [],
    evaluations: [],
    currentRow: 0,
    currentInput: '',
    status: 'playing',
    keyStates: emptyKeyStates(),
  };
}

/**
 * Replay an already-submitted set of evaluations into a fresh keyStates map.
 * Used when rehydrating a daily game from localStorage.
 */
export function replayKeyStates(
  guesses: string[],
  evaluations: TileEvaluation[][],
): Record<string, KeyState> {
  const ks = emptyKeyStates();
  for (let r = 0; r < guesses.length; r++) {
    const g = guesses[r];
    const ev = evaluations[r];
    for (let c = 0; c < g.length; c++) {
      ks[g[c]] = bumpKeyState(ks[g[c]], ev[c]);
    }
  }
  return ks;
}

function isLetter(s: string): boolean {
  return s.length === 1 && s >= 'A' && s <= 'Z';
}

export function reduce(
  state: GameState,
  action: Action,
  validGuesses: ValidGuessSource,
): ReduceResult {
  if (state.status !== 'playing') {
    return { state, effects: [] };
  }

  switch (action.type) {
    case 'TYPE_LETTER': {
      if (!isLetter(action.letter)) return { state, effects: [] };
      if (state.currentInput.length >= state.wordLength) return { state, effects: [] };
      return {
        state: { ...state, currentInput: state.currentInput + action.letter },
        effects: [],
      };
    }

    case 'BACKSPACE': {
      if (state.currentInput.length === 0) return { state, effects: [] };
      return {
        state: {
          ...state,
          currentInput: state.currentInput.slice(0, -1),
        },
        effects: [],
      };
    }

    case 'SUBMIT': {
      if (state.currentInput.length < state.wordLength) {
        return {
          state,
          effects: [
            { type: 'SHAKE_ROW', row: state.currentRow },
            { type: 'TOAST', message: 'letras faltando' },
          ],
        };
      }
      const guess = state.currentInput;
      if (!validGuesses.has(guess)) {
        return {
          state,
          effects: [
            { type: 'SHAKE_ROW', row: state.currentRow },
            { type: 'TOAST', message: 'palavra inválida' },
          ],
        };
      }

      const evaluation = evaluateGuess(guess, state.solution);
      const newGuesses = [...state.guesses, guess];
      const newEvaluations = [...state.evaluations, evaluation];
      const newRow = state.currentRow + 1;

      // Update keyboard color states.
      const newKeyStates = { ...state.keyStates };
      for (let c = 0; c < state.wordLength; c++) {
        const ch = guess[c];
        newKeyStates[ch] = bumpKeyState(newKeyStates[ch], evaluation[c]);
      }

      const isWin = evaluation.every((e) => e === 'correct');
      const isLoss = !isWin && newRow >= state.maxAttempts;
      const newStatus: GameStatus = isWin ? 'won' : isLoss ? 'lost' : 'playing';

      const effects: Effect[] = [
        { type: 'FLIP_REVEAL', row: state.currentRow },
      ];
      if (isWin) effects.push({ type: 'BOUNCE_WIN', row: state.currentRow });
      effects.push({ type: 'PERSIST' });
      if (isWin || isLoss) {
        effects.push({
          type: 'STATS_UPDATED',
          won: isWin,
          attempts: newGuesses.length,
        });
      }

      return {
        state: {
          ...state,
          guesses: newGuesses,
          evaluations: newEvaluations,
          currentRow: newRow,
          currentInput: '',
          status: newStatus,
          keyStates: newKeyStates,
        },
        effects,
      };
    }
  }
}
