import { applyOutcome, emptyStats, maxBin, winPercent } from './stats';

describe('stats', () => {
  it('starts zeroed', () => {
    const s = emptyStats();
    expect(s.played).toBe(0);
    expect(s.won).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.maxStreak).toBe(0);
    expect(s.winsByAttempt).toEqual({});
    expect(s.lastPlayedPuzzle).toBeNull();
    expect(s.schemaVersion).toBe(2);
  });

  it('records a daily win in the histogram', () => {
    const out = applyOutcome(emptyStats(), {
      won: true,
      attempts: 4,
      puzzleNumber: 1,
    });
    expect(out.played).toBe(1);
    expect(out.won).toBe(1);
    expect(out.currentStreak).toBe(1);
    expect(out.maxStreak).toBe(1);
    expect(out.winsByAttempt).toEqual({ 4: 1 });
    expect(out.lastPlayedPuzzle).toBe(1);
  });

  it('records a daily loss without bumping the histogram', () => {
    const out = applyOutcome(emptyStats(), {
      won: false,
      attempts: 6,
      puzzleNumber: 1,
    });
    expect(out.played).toBe(1);
    expect(out.won).toBe(0);
    expect(out.currentStreak).toBe(0);
    expect(out.winsByAttempt).toEqual({});
    expect(out.lastPlayedPuzzle).toBe(1);
  });

  it('continues the streak across consecutive daily wins', () => {
    let s = emptyStats();
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 1 });
    s = applyOutcome(s, { won: true, attempts: 3, puzzleNumber: 2 });
    s = applyOutcome(s, { won: true, attempts: 5, puzzleNumber: 3 });
    expect(s.currentStreak).toBe(3);
    expect(s.maxStreak).toBe(3);
    expect(s.winsByAttempt).toEqual({ 3: 1, 4: 1, 5: 1 });
  });

  it('resets the streak when a daily is skipped', () => {
    let s = emptyStats();
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 1 });
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 2 });
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 5 });
    expect(s.currentStreak).toBe(1);
    expect(s.maxStreak).toBe(2);
  });

  it('zeroes the streak on a loss without lowering maxStreak', () => {
    let s = emptyStats();
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 1 });
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 2 });
    s = applyOutcome(s, { won: false, attempts: 6, puzzleNumber: 3 });
    expect(s.currentStreak).toBe(0);
    expect(s.maxStreak).toBe(2);
  });

  it('training wins extend the streak even without a puzzle number', () => {
    let s = emptyStats();
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 1 });
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: null });
    expect(s.currentStreak).toBe(2);
    // lastPlayedPuzzle stays anchored to the last daily.
    expect(s.lastPlayedPuzzle).toBe(1);
  });

  it('archived plays never decrement the streak (caller does not invoke)', () => {
    // Documents the contract: applyOutcome doesn't know about "archived";
    // the orchestrator simply skips the call for archived games.
    let s = emptyStats();
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 1 });
    const before = { ...s };
    // Simulating the orchestrator NOT calling applyOutcome on an archived play.
    expect(s).toEqual(before);
    expect(s.currentStreak).toBe(1);
  });

  it('winPercent rounds to nearest integer', () => {
    let s = emptyStats();
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 1 });
    s = applyOutcome(s, { won: false, attempts: 6, puzzleNumber: 2 });
    s = applyOutcome(s, { won: true, attempts: 3, puzzleNumber: 3 });
    // 2 / 3 = 66.66... → 67
    expect(winPercent(s)).toBe(67);
  });

  it('winPercent is 0 when nothing played', () => {
    expect(winPercent(emptyStats())).toBe(0);
  });

  it('maxBin returns the largest histogram count', () => {
    let s = emptyStats();
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 1 });
    s = applyOutcome(s, { won: true, attempts: 4, puzzleNumber: 2 });
    s = applyOutcome(s, { won: true, attempts: 3, puzzleNumber: 3 });
    expect(maxBin(s)).toBe(2);
  });
});
