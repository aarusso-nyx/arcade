import { createTermoGame } from './game';
import type {
  StoredDaily,
  StoredDailyMeta,
  StoredInfinite,
  TermoStorage,
} from './persistence';
import { emptyStats, type TermoStats } from './stats';
import type { WordLists } from './wordlist';

function makeLists(): WordLists {
  const solutions = ['ABATE', 'BANCO', 'MUNDO', 'TROCA', 'PISCO'];
  const valid = new Set([...solutions, 'ZZZZA']);
  return {
    wordLength: 5,
    solutions,
    solutionsAccented: solutions.slice(),
    validGuesses: valid,
  };
}

function makeLists6(): WordLists {
  const solutions = ['ABACTO', 'ABAFAR', 'BANANA', 'CARROS'];
  const valid = new Set([...solutions]);
  return {
    wordLength: 6,
    solutions,
    solutionsAccented: solutions.slice(),
    validGuesses: valid,
  };
}

function makeStorage(): {
  storage: TermoStorage;
  data: {
    daily: StoredDaily | null;
    meta: StoredDailyMeta | null;
    infinite: Record<number, StoredInfinite | null>;
    stats: TermoStats;
  };
} {
  const data = {
    daily: null as StoredDaily | null,
    meta: null as StoredDailyMeta | null,
    infinite: {} as Record<number, StoredInfinite | null>,
    stats: emptyStats(),
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
    readInfinite: (len) =>
      data.infinite[len] ?? { v: 1, bestStreak: 0, currentStreak: 0 },
    writeInfinite: (len, i) => {
      data.infinite[len] = { v: 1, ...i };
    },
    readStats: () => data.stats,
    writeStats: (s) => {
      data.stats = s;
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
    expect(s.wordLength).toBe(5);
    expect(s.maxAttempts).toBe(6);
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

  describe('variable word length (infinite mode)', () => {
    it('switches to a 6-letter infinite game with 7 attempts', () => {
      const lists5 = makeLists();
      const lists6 = makeLists6();
      const { storage } = makeStorage();
      const game = createTermoGame({
        lists: { 5: lists5, 6: lists6 },
        storage,
        now: () => FIXED_NOW,
        rng: () => 0,
      });
      game.setMode('infinite');
      game.newInfinite(6);
      const s = game.state();
      expect(s.mode).toBe('infinite');
      expect(s.wordLength).toBe(6);
      expect(s.maxAttempts).toBe(7);
      expect(lists6.solutions).toContain(s.solution);
    });

    it('persists infinite streak per length independently', () => {
      const lists5 = makeLists();
      const lists6 = makeLists6();
      const { storage, data } = makeStorage();
      const game = createTermoGame({
        lists: { 5: lists5, 6: lists6 },
        storage,
        now: () => FIXED_NOW,
        rng: () => 0,
      });
      // Win one 5-letter infinite game.
      game.setMode('infinite');
      // Solution is ABATE (rng=0 -> idx 0).
      for (const ch of 'ABATE') game.dispatch({ type: 'TYPE_LETTER', letter: ch });
      game.dispatch({ type: 'SUBMIT' });
      expect(data.infinite[5]?.currentStreak).toBe(1);
      expect(data.infinite[6]).toBeUndefined();

      // Switch to 6-letter — should NOT touch the 5-letter streak.
      game.newInfinite(6);
      // Solution at rng=0 -> idx 0 -> ABACTO.
      for (const ch of 'ABACTO') game.dispatch({ type: 'TYPE_LETTER', letter: ch });
      game.dispatch({ type: 'SUBMIT' });
      expect(data.infinite[6]?.currentStreak).toBe(1);
      expect(data.infinite[5]?.currentStreak).toBe(1); // unchanged
    });

    it('daily mode stays 5-letter even when 6-letter lists are loaded', () => {
      const lists5 = makeLists();
      const lists6 = makeLists6();
      const { storage } = makeStorage();
      const game = createTermoGame({
        lists: { 5: lists5, 6: lists6 },
        storage,
        now: () => FIXED_NOW,
        rng: () => 0,
      });
      expect(game.state().wordLength).toBe(5);
      expect(game.state().maxAttempts).toBe(6);
    });

    it('share string denominator reflects daily maxAttempts (6)', () => {
      const lists5 = makeLists();
      const lists6 = makeLists6();
      const { storage } = makeStorage();
      const game = createTermoGame({
        lists: { 5: lists5, 6: lists6 },
        storage,
        now: () => FIXED_NOW,
        rng: () => 0,
      });
      for (const ch of 'ABATE') game.dispatch({ type: 'TYPE_LETTER', letter: ch });
      game.dispatch({ type: 'SUBMIT' });
      const s = game.shareString();
      expect(s!.startsWith('Termo 1 1/6')).toBeTrue();
    });
  });
});
