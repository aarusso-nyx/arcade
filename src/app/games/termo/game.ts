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
import { applyOutcome, type TermoStats } from './stats';
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
  /**
   * Load a specific past daily puzzle for replay. Archived plays do NOT
   * affect stats or streak (the orchestrator gates STATS_UPDATED). Pass
   * `null` to return to the live daily.
   */
  loadArchive(puzzleNumber: number | null): void;
  /** True when the current daily game is an archived (older) puzzle. */
  isArchive(): boolean;
  /** Latest persisted stats snapshot. */
  stats(): TermoStats;
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
  /**
   * Opt-in soft-acceptance for well-formed but unknown guesses. Default OFF —
   * dictionary stays authoritative. When enabled, an unknown guess that is a
   * clean A-Z string of the right length is accepted with a yellow "palavra
   * incomum" warning toast instead of the red "palavra inválida" shake.
   *
   * Exposed so a config/settings UI can wire it up later; the reducer keeps
   * its strict default so the "real word?" guarantee isn't quietly weakened.
   */
  lenient?: boolean;
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
  const lenient = opts.lenient === true;

  let infiniteLength: number =
    opts.initialInfiniteLength ?? DEFAULT_WORD_LENGTH;
  if (!listsByLength[infiniteLength]) {
    infiniteLength = DEFAULT_WORD_LENGTH;
  }

  /**
   * Set to the archived puzzle number when the player is replaying a past
   * daily; null while on the live daily. Archived plays do not write to
   * `daily` storage, do not touch `dailyMeta`, and do not feed stats.
   */
  let archivePuzzleNumber: number | null = null;

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

  function createDailyState(puzzleNumberOverride?: number): GameState {
    const lists = dailyLists;
    const puzzleNumber = puzzleNumberOverride ?? dailyPuzzleNumber(now());
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

    // Only rehydrate from the `daily` slot when the requested puzzle IS
    // today (i.e. no archive override). Archived plays always start fresh
    // and never persist.
    const isLive = puzzleNumberOverride === undefined;
    if (isLive) {
      const stored = storage.readDaily();
      if (stored && stored.puzzleNumber === puzzleNumber) {
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
    // Archived plays are throwaway: don't overwrite today's progress.
    if (archivePuzzleNumber !== null) return;
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
    // Archived plays never touch dailyMeta or its streak.
    if (archivePuzzleNumber !== null) return;
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

  function applyStatsUpdate(won: boolean, attempts: number): void {
    // Archived plays are practice; never count toward stats.
    if (state.mode === 'daily' && archivePuzzleNumber !== null) return;
    const prev = storage.readStats();
    // Daily stats are anchored by puzzleNumber so we don't double-count
    // the same daily across reloads. (Infinite games can't be re-detected
    // this way — but rehydration only matters for daily, where puzzles
    // persist; infinite resets on every new game so duplicate-counting
    // isn't a risk.)
    if (
      state.mode === 'daily' &&
      state.puzzleNumber !== null &&
      prev.lastPlayedPuzzle !== null &&
      prev.lastPlayedPuzzle === state.puzzleNumber
    ) {
      return;
    }
    const next = applyOutcome(prev, {
      won,
      attempts,
      puzzleNumber: state.mode === 'daily' ? state.puzzleNumber : null,
    });
    storage.writeStats(next);
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
      } else if (eff.type === 'STATS_UPDATED') {
        applyStatsUpdate(eff.won, eff.attempts);
      }
    }
  }

  // If we rehydrated a completed daily game, ensure meta + stats are recorded.
  if (state.status !== 'playing' && state.mode === 'daily') {
    applyEndOfGameForDaily();
    applyStatsUpdate(
      state.status === 'won',
      state.guesses.length,
    );
  }

  return {
    state(): GameState {
      return state;
    },

    dispatch(action: Action): Effect[] {
      const result = reduce(
        state,
        action,
        validGuessesFor(state.wordLength),
        { lenient },
      );
      state = result.state;
      handleEffects(result.effects);
      return result.effects;
    },

    setMode(mode: GameMode): void {
      if (state.mode === mode) return;
      if (mode === 'daily') {
        // Switching back to daily exits any archive view.
        archivePuzzleNumber = null;
        state = createDailyState();
        if (state.status !== 'playing') applyEndOfGameForDaily();
      } else {
        state = createInfiniteState(infiniteLength);
      }
    },

    loadArchive(puzzleNumber: number | null): void {
      const today = dailyPuzzleNumber(now());
      if (puzzleNumber === null || puzzleNumber >= today) {
        // Returning to live daily — or asked for "today/future"; treat as live.
        archivePuzzleNumber = null;
        state = createDailyState();
        if (state.status !== 'playing') applyEndOfGameForDaily();
        return;
      }
      if (puzzleNumber < 1) return;
      archivePuzzleNumber = puzzleNumber;
      state = createDailyState(puzzleNumber);
    },

    isArchive(): boolean {
      return archivePuzzleNumber !== null;
    },

    stats(): TermoStats {
      return storage.readStats();
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
