import { createTermoGame } from './game';
import type {
  StoredDaily,
  StoredDailyMeta,
  StoredInfinite,
  TermoStorage,
} from './persistence';
import type { WordLists } from './wordlist';

function makeLists(): WordLists {
  const solutions = ['ABATE', 'BANCO', 'MUNDO', 'TROCA', 'PISCO'];
  const valid = new Set([...solutions, 'ZZZZA']);
  return {
    solutions,
    solutionsAccented: solutions.slice(),
    validGuesses: valid,
  };
}

function makeStorage(): { storage: TermoStorage; data: {
  daily: StoredDaily | null;
  meta: StoredDailyMeta | null;
  infinite: StoredInfinite | null;
} } {
  const data = {
    daily: null as StoredDaily | null,
    meta: null as StoredDailyMeta | null,
    infinite: null as StoredInfinite | null,
  };
  const storage: TermoStorage = {
    readDaily: () => data.daily,
    writeDaily: (d) => {
      data.daily = { v: 1, savedAt: 0, ...d };
    },
    clearDaily: () => {
      data.daily = null;
    },
    readDailyMeta: () =>
      data.meta ?? {
        v: 1,
        lastCompletedPuzzleNumber: null,
        currentStreak: 0,
        maxStreak: 0,
        history: [],
      },
    writeDailyMeta: (m) => {
      data.meta = { v: 1, ...m };
    },
    readInfinite: () =>
      data.infinite ?? { v: 1, bestStreak: 0, currentStreak: 0 },
    writeInfinite: (i) => {
      data.infinite = { v: 1, ...i };
    },
  };
  return { storage, data };
}

describe('createTermoGame', () => {
  const FIXED_NOW = new Date(2026, 0, 1, 10, 0, 0); // launch day, puzzle #1

  it('initializes daily mode with today\'s puzzle', () => {
    const lists = makeLists();
    const { storage } = makeStorage();
    const game = createTermoGame({
      lists,
      storage,
      now: () => FIXED_NOW,
      rng: () => 0,
    });
    const s = game.state();
    expect(s.mode).toBe('daily');
    expect(s.puzzleNumber).toBe(1);
    expect(s.solution).toBe(lists.solutions[0]);
  });

  it('rehydrates a saved daily game', () => {
    const lists = makeLists();
    const { storage, data } = makeStorage();
    data.daily = {
      v: 1,
      puzzleNumber: 1,
      guesses: ['BANCO'],
      evaluations: [['present', 'present', 'absent', 'absent', 'absent']],
      status: 'playing',
      savedAt: 0,
    };
    const game = createTermoGame({
      lists,
      storage,
      now: () => FIXED_NOW,
      rng: () => 0,
    });
    expect(game.state().guesses).toEqual(['BANCO']);
    expect(game.state().currentRow).toBe(1);
    expect(game.state().keyStates['B']).toBe('present');
  });

  it('discards a stored daily for a stale puzzle number', () => {
    const lists = makeLists();
    const { storage, data } = makeStorage();
    data.daily = {
      v: 1,
      puzzleNumber: 999,
      guesses: ['BANCO'],
      evaluations: [['absent', 'absent', 'absent', 'absent', 'absent']],
      status: 'playing',
      savedAt: 0,
    };
    const game = createTermoGame({
      lists,
      storage,
      now: () => FIXED_NOW,
      rng: () => 0,
    });
    expect(game.state().guesses).toEqual([]);
    expect(data.daily).toBeNull();
  });

  it('persists after a successful guess', () => {
    const lists = makeLists();
    const { storage, data } = makeStorage();
    const game = createTermoGame({
      lists,
      storage,
      now: () => FIXED_NOW,
      rng: () => 0,
    });
    for (const ch of 'BANCO') {
      game.dispatch({ type: 'TYPE_LETTER', letter: ch });
    }
    game.dispatch({ type: 'SUBMIT' });
    expect(data.daily?.guesses).toEqual(['BANCO']);
  });

  it('produces a share string after a daily win', () => {
    const lists = makeLists();
    const { storage } = makeStorage();
    const game = createTermoGame({
      lists,
      storage,
      now: () => FIXED_NOW,
      rng: () => 0,
    });
    for (const ch of 'ABATE') {
      game.dispatch({ type: 'TYPE_LETTER', letter: ch });
    }
    game.dispatch({ type: 'SUBMIT' });
    const s = game.shareString();
    expect(s).not.toBeNull();
    expect(s!.startsWith('Termo 1 1/6')).toBeTrue();
  });

  it('returns null share string while playing', () => {
    const lists = makeLists();
    const { storage } = makeStorage();
    const game = createTermoGame({
      lists,
      storage,
      now: () => FIXED_NOW,
      rng: () => 0,
    });
    expect(game.shareString()).toBeNull();
  });

  it('records meta on daily win', () => {
    const lists = makeLists();
    const { storage, data } = makeStorage();
    const game = createTermoGame({
      lists,
      storage,
      now: () => FIXED_NOW,
      rng: () => 0,
    });
    for (const ch of 'ABATE') {
      game.dispatch({ type: 'TYPE_LETTER', letter: ch });
    }
    game.dispatch({ type: 'SUBMIT' });
    expect(data.meta?.currentStreak).toBe(1);
    expect(data.meta?.history[0]).toEqual({
      puzzle: 1,
      won: true,
      attempts: 1,
    });
  });

  it('newInfinite swaps in a fresh random puzzle', () => {
    const lists = makeLists();
    const { storage } = makeStorage();
    let rngVal = 0;
    const game = createTermoGame({
      lists,
      storage,
      now: () => FIXED_NOW,
      rng: () => rngVal,
    });
    game.setMode('infinite');
    const first = game.state().solution;
    rngVal = 0.5;
    game.newInfinite();
    const second = game.state().solution;
    expect(second).not.toBe(first);
    expect(lists.solutions).toContain(second);
  });

  it('countdownMs returns positive value', () => {
    const lists = makeLists();
    const { storage } = makeStorage();
    const game = createTermoGame({
      lists,
      storage,
      now: () => FIXED_NOW,
      rng: () => 0,
    });
    const ms = game.countdownMs();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(86_400_000);
  });
});
