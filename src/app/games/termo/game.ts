import {
  createInitialState,
  reduce,
  replayKeyStates,
  type Action,
  type Effect,
  type GameMode,
  type GameState,
  type ValidGuessSource,
} from './state';
import { dailyPuzzleNumber, dailySolution } from './daily';
import { evaluateGuess } from './evaluator';
import {
  createTermoStorage,
  nextDailyMeta,
  type TermoStorage,
} from './persistence';
import { buildShareString } from './share';
import type { WordLists } from './wordlist';

export interface TermoGame {
  state(): GameState;
  dispatch(action: Action): Effect[];
  /**
   * Switch into the given mode. Daily mode rehydrates today's progress (or
   * starts fresh); infinite mode picks a new random solution every time.
   * Returns the resulting effects (typically empty).
   */
  setMode(mode: GameMode): void;
  newInfinite(): void;
  shareString(): string | null;
  countdownMs(): number;
}

export interface TermoOptions {
  lists: WordLists;
  storage?: TermoStorage;
  now?: () => Date;
  rng?: () => number;
  initialMode?: GameMode;
}

const MS_PER_DAY = 86_400_000;

function nextLocalMidnightMs(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

function pickRandomSolution(
  lists: WordLists,
  rng: () => number,
): { solution: string; accented: string } {
  const idx = Math.floor(rng() * lists.solutions.length);
  return {
    solution: lists.solutions[idx],
    accented: lists.solutionsAccented[idx] ?? lists.solutions[idx],
  };
}

export function createTermoGame(opts: TermoOptions): TermoGame {
  const { lists } = opts;
  const storage = opts.storage ?? createTermoStorage();
  const now = opts.now ?? ((): Date => new Date());
  const rng = opts.rng ?? Math.random;
  const validGuesses: ValidGuessSource = lists.validGuesses;

  if (lists.solutions.length === 0) {
    throw new Error('createTermoGame: solutions list is empty');
  }

  let state: GameState = createDailyState();

  function createDailyState(): GameState {
    const puzzleNumber = dailyPuzzleNumber(now());
    const idx = (puzzleNumber - 1) % lists.solutions.length;
    const solution = lists.solutions[idx];
    const accented = lists.solutionsAccented[idx] ?? solution;

    const fresh = createInitialState({
      mode: 'daily',
      solution,
      solutionAccented: accented,
      puzzleNumber,
    });

    const stored = storage.readDaily();
    if (stored && stored.puzzleNumber === puzzleNumber) {
      // Rehydrate.
      fresh.guesses = stored.guesses.slice();
      fresh.evaluations = stored.evaluations.map((row) => row.slice());
      fresh.currentRow = stored.guesses.length;
      fresh.currentInput = '';
      fresh.status = stored.status;
      fresh.keyStates = replayKeyStates(fresh.guesses, fresh.evaluations);
    } else if (stored && stored.puzzleNumber !== puzzleNumber) {
      // Stale daily — clear it so we don't leak yesterday's progress.
      storage.clearDaily();
    }

    return fresh;
  }

  function createInfiniteState(): GameState {
    const { solution, accented } = pickRandomSolution(lists, rng);
    return createInitialState({
      mode: 'infinite',
      solution,
      solutionAccented: accented,
      puzzleNumber: null,
    });
  }

  function persistDaily(): void {
    if (state.mode !== 'daily' || state.puzzleNumber === null) return;
    storage.writeDaily({
      puzzleNumber: state.puzzleNumber,
      guesses: state.guesses,
      evaluations: state.evaluations,
      status: state.status,
    });
  }

  function applyEndOfGameForDaily(): void {
    if (
      state.mode !== 'daily' ||
      state.puzzleNumber === null ||
      state.status === 'playing'
    ) {
      return;
    }
    const meta = storage.readDailyMeta();
    if (meta.lastCompletedPuzzleNumber === state.puzzleNumber) {
      // Already recorded; don't double-count on subsequent reloads.
      return;
    }
    const won = state.status === 'won';
    const attempts = won ? state.guesses.length : null;
    const next = nextDailyMeta(meta, state.puzzleNumber, won, attempts);
    storage.writeDailyMeta(next);
  }

  function applyEndOfGameForInfinite(): void {
    if (state.mode !== 'infinite' || state.status === 'playing') return;
    const cur = storage.readInfinite();
    let currentStreak: number;
    if (state.status === 'won') {
      currentStreak = cur.currentStreak + 1;
    } else {
      currentStreak = 0;
    }
    const bestStreak = Math.max(cur.bestStreak, currentStreak);
    storage.writeInfinite({ bestStreak, currentStreak });
  }

  function handleEffects(effects: Effect[]): void {
    for (const eff of effects) {
      if (eff.type === 'PERSIST') {
        persistDaily();
        if (state.status !== 'playing') {
          if (state.mode === 'daily') applyEndOfGameForDaily();
          else applyEndOfGameForInfinite();
        }
      }
    }
  }

  // If we rehydrated a completed daily game, ensure meta is recorded.
  if (state.status !== 'playing' && state.mode === 'daily') {
    applyEndOfGameForDaily();
  }

  return {
    state(): GameState {
      return state;
    },

    dispatch(action: Action): Effect[] {
      const result = reduce(state, action, validGuesses);
      state = result.state;
      handleEffects(result.effects);
      return result.effects;
    },

    setMode(mode: GameMode): void {
      if (state.mode === mode) return;
      if (mode === 'daily') {
        state = createDailyState();
        if (state.status !== 'playing') applyEndOfGameForDaily();
      } else {
        state = createInfiniteState();
      }
    },

    newInfinite(): void {
      state = createInfiniteState();
    },

    shareString(): string | null {
      if (state.mode !== 'daily') return null;
      if (state.status === 'playing') return null;
      if (state.puzzleNumber === null) return null;
      return buildShareString({
        status: state.status,
        puzzleNumber: state.puzzleNumber,
        guessCount: state.guesses.length,
        evaluations: state.evaluations,
      });
    },

    countdownMs(): number {
      return nextLocalMidnightMs(now());
    },
  };
}

// Re-export for tests / convenience.
export { evaluateGuess };
export const _internals = { MS_PER_DAY, nextLocalMidnightMs };
