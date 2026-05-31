import { createLockState, shouldLock, tickLock, tryResetLock } from './lock';

const LOCK_DELAY = 500;
const CAP = 15;

describe('tetris/lock', () => {
  it('starts airborne', () => {
    const s = createLockState();
    expect(s.grounded).toBe(false);
    expect(s.timerMs).toBe(0);
    expect(s.resetCount).toBe(0);
  });

  it('becomes grounded with 500ms timer when landing', () => {
    const s = tickLock(createLockState(), 16, true, LOCK_DELAY);
    expect(s.grounded).toBe(true);
    expect(s.timerMs).toBe(LOCK_DELAY);
  });

  it('locks after 500ms while grounded', () => {
    let s = tickLock(createLockState(), 0, true, LOCK_DELAY);
    expect(shouldLock(s)).toBe(false);
    s = tickLock(s, 250, true, LOCK_DELAY);
    expect(shouldLock(s)).toBe(false);
    s = tickLock(s, 250, true, LOCK_DELAY);
    expect(shouldLock(s)).toBe(true);
  });

  it('tryResetLock restores timer to 500ms and increments resetCount', () => {
    let s = tickLock(createLockState(), 0, true, LOCK_DELAY);
    s = tickLock(s, 300, true, LOCK_DELAY);
    expect(s.timerMs).toBe(200);
    s = tryResetLock(s, LOCK_DELAY, CAP);
    expect(s.timerMs).toBe(LOCK_DELAY);
    expect(s.resetCount).toBe(1);
  });

  it('after 15 resets, no further reset succeeds', () => {
    let s = tickLock(createLockState(), 0, true, LOCK_DELAY);
    for (let i = 0; i < 20; i++) s = tryResetLock(s, LOCK_DELAY, CAP);
    expect(s.resetCount).toBe(CAP);
    const prevTimer = s.timerMs;
    // exhaust timer manually
    s = { ...s, timerMs: 100 };
    const after = tryResetLock(s, LOCK_DELAY, CAP);
    expect(after.timerMs).toBe(100); // unchanged
  });

  it('becoming airborne clears grounded but preserves resetCount', () => {
    let s = tickLock(createLockState(), 0, true, LOCK_DELAY);
    s = tryResetLock(s, LOCK_DELAY, CAP);
    s = tryResetLock(s, LOCK_DELAY, CAP);
    expect(s.resetCount).toBe(2);
    s = tickLock(s, 0, false, LOCK_DELAY);
    expect(s.grounded).toBe(false);
    expect(s.resetCount).toBe(2);
  });

  it('tryResetLock is a no-op when not grounded', () => {
    const s = createLockState();
    const after = tryResetLock(s, LOCK_DELAY, CAP);
    expect(after).toEqual(s);
  });

  it('with 15-reset cap, infinite stalling is prevented', () => {
    // Simulate the player making one reset per 100ms and the engine ticking 16ms.
    let s = tickLock(createLockState(), 0, true, LOCK_DELAY);
    let elapsed = 0;
    let resetsFired = 0;
    while (!shouldLock(s) && elapsed < 60_000) {
      s = tickLock(s, 16, true, LOCK_DELAY);
      elapsed += 16;
      if (elapsed % 100 < 16) {
        s = tryResetLock(s, LOCK_DELAY, CAP);
        resetsFired++;
      }
    }
    expect(shouldLock(s)).toBe(true);
    // resetCount should be capped at CAP regardless of how many resets we tried.
    expect(s.resetCount).toBe(CAP);
    // And the piece locks within a bounded time, not indefinitely.
    expect(elapsed).toBeLessThan(60_000);
  });
});
