import {
  createInitialState,
  DEFAULT_WORD_LENGTH,
  reduce,
  replayKeyStates,
  type Action,
  type Effect,
  type GameMode,
  type GameState,
  type ValidGuessSource,
} from './state';
import { dailyPuzzleNumber } from './daily';
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
   * starts fresh) at the daily-fixed 5-letter length; infinite mode picks
   * a new random solution every time at the current infinite word length.
   */
  setMode(mode: GameMode): void;
  /**
   * Start a new infinite (training) game at the given word length. If
   * already in infinite mode this resets the board to a fresh random word
   * of the requested length; the daily mode is unaffected.
   */
  newInfinite(wordLength?: number): void;
  /** The word length the next infinite game will use (5, 6, or 7). */
  infiniteLength(): number;
  shareString(): string | null;
  countdownMs(): number;
}

export interface TermoOptions {
  /**
   * Word lists keyed by length. Must include length 5 (used by daily mode).
   * Lengths the game can switch to in infinite mode are exactly the keys
   * present here.
   */
  lists: Record<number, WordLists> | WordLists;
  storage?: TermoStorage;
  now?: () => Date;
  rng?: () => number;
  initialMode?: GameMode;
  /** Initial infinite word length. Defaults to 5. */
  initialInfiniteLength?: number;
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

function normalizeListsArg(
  arg: Record<number, WordLists> | WordLists,
): Record<number, WordLists> {
  // Treat a bare WordLists as { [its length]: lists } for back-compat.
  if ((arg as WordLists).solutions !== undefined) {
    const wl = arg as WordLists;
    return { [wl.wordLength]: wl };
  }
  return arg as Record<number, WordLists>;
}

export function createTermoGame(opts: TermoOptions): TermoGame {
  const listsByLength = normalizeListsArg(opts.lists);
  const dailyLists = listsByLength[DEFAULT_WORD_LENGTH];
  if (!dailyLists) {
    throw new Error(
      `createTermoGame: missing word lists for daily length (${DEFAULT_WORD_LENGTH})`,
    );
  }
  for (const [k, lists] of Object.entries(listsByLength)) {
    if (lists.solutions.length === 0) {
      throw new Error(`createTermoGame: solutions list for length ${k} is empty`);
    }
  }

  const storage = opts.storage ?? createTermoStorage();
  const now = opts.now ?? ((): Date => new Date());
  const rng = opts.rng ?? Math.random;

  let infiniteLength: number =
    opts.initialInfiniteLength ?? DEFAULT_WORD_LENGTH;
  if (!listsByLength[infiniteLength]) {
    infiniteLength = DEFAULT_WORD_LENGTH;
  }

  let state: GameState = createDailyState();

  function listsFor(length: number): WordLists {
    const ls = listsByLength[length];
    if (!ls) {
      throw new Error(`createTermoGame: no word lists loaded for length ${length}`);
    }
    return ls;
  }

  function validGuessesFor(length: number): ValidGuessSource {
    return listsFor(length).validGuesses;
  }

  function createDailyState(): GameState {
    const lists = dailyLists;
    const puzzleNumber = dailyPuzzleNumber(now());
    const idx = (puzzleNumber - 1) % lists.solutions.length;
    const solution = lists.solutions[idx];
    const accented = lists.solutionsAccented[idx] ?? solution;

    const fresh = createInitialState({
      mode: 'daily',
      solution,
      solutionAccented: accented,
      puzzleNumber,
      wordLength: DEFAULT_WORD_LENGTH,
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

  function createInfiniteState(length: number = infiniteLength): GameState {
    const lists = listsFor(length);
    const { solution, accented } = pickRandomSolution(lists, rng);
    return createInitialState({
      mode: 'infinite',
      solution,
      solutionAccented: accented,
      puzzleNumber: null,
      wordLength: length,
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
    const cur = storage.readInfinite(state.wordLength);
    let currentStreak: number;
    if (state.status === 'won') {
      currentStreak = cur.currentStreak + 1;
    } else {
      currentStreak = 0;
    }
    const bestStreak = Math.max(cur.bestStreak, currentStreak);
    storage.writeInfinite(state.wordLength, { bestStreak, currentStreak });
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
      const result = reduce(state, action, validGuessesFor(state.wordLength));
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
        state = createInfiniteState(infiniteLength);
      }
    },

    newInfinite(wordLength?: number): void {
      if (wordLength !== undefined) {
        if (!listsByLength[wordLength]) {
          throw new Error(
            `newInfinite: no word lists loaded for length ${wordLength}`,
          );
        }
        infiniteLength = wordLength;
      }
      state = createInfiniteState(infiniteLength);
    },

    infiniteLength(): number {
      return infiniteLength;
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
        maxAttempts: state.maxAttempts,
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
