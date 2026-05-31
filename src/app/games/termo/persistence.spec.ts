import { nextDailyMeta, type StoredDailyMeta } from './persistence';

const FRESH: StoredDailyMeta = {
  v: 1,
  lastCompletedPuzzleNumber: null,
  currentStreak: 0,
  maxStreak: 0,
  history: [],
};

describe('nextDailyMeta', () => {
  it('starts the streak on first win', () => {
    const out = nextDailyMeta(FRESH, 1, true, 3);
    expect(out.currentStreak).toBe(1);
    expect(out.maxStreak).toBe(1);
    expect(out.lastCompletedPuzzleNumber).toBe(1);
    expect(out.history[0]).toEqual({ puzzle: 1, won: true, attempts: 3 });
  });

  it('continues the streak across consecutive days', () => {
    let m = FRESH;
    m = nextDailyMeta(m, 1, true, 3);
    m = nextDailyMeta(m, 2, true, 4);
    m = nextDailyMeta(m, 3, true, 2);
    expect(m.currentStreak).toBe(3);
    expect(m.maxStreak).toBe(3);
  });

  it('resets the streak when a day is skipped', () => {
    let m = FRESH;
    m = nextDailyMeta(m, 1, true, 3);
    m = nextDailyMeta(m, 2, true, 4);
    m = nextDailyMeta(m, 5, true, 5);
    expect(m.currentStreak).toBe(1);
    expect(m.maxStreak).toBe(2);
  });

  it('zeroes the streak on a loss', () => {
    let m = FRESH;
    m = nextDailyMeta(m, 1, true, 3);
    m = nextDailyMeta(m, 2, false, null);
    expect(m.currentStreak).toBe(0);
    expect(m.maxStreak).toBe(1);
  });

  it('caps history at 30', () => {
    let m = FRESH;
    for (let i = 1; i <= 40; i++) {
      m = nextDailyMeta(m, i, true, 4);
    }
    expect(m.history.length).toBe(30);
    expect(m.history[0].puzzle).toBe(40);
    expect(m.history[29].puzzle).toBe(11);
  });
});
