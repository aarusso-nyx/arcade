import type { LockState } from './types';

export function createLockState(): LockState {
  return { grounded: false, timerMs: 0, resetCount: 0 };
}

/** Update the lock state's timer/groundedness given the latest grounded check and elapsed ms. */
export function tickLock(
  state: LockState,
  dtMs: number,
  isGrounded: boolean,
  lockDelayMs: number,
): LockState {
  if (isGrounded && !state.grounded) {
    // Just landed. Start timer; do NOT reset resetCount (per spec, the cap
    // carries across AIRBORNE re-entries).
    return { ...state, grounded: true, timerMs: lockDelayMs };
  }
  if (!isGrounded && state.grounded) {
    // Became airborne again — clear grounded but keep resetCount.
    return { ...state, grounded: false, timerMs: 0 };
  }
  if (isGrounded) {
    return { ...state, timerMs: Math.max(0, state.timerMs - dtMs) };
  }
  return state;
}

/**
 * Attempt to reset the lock timer after a successful move/rotation.
 * If we're not grounded, no-op. If the cap is reached, no-op.
 */
export function tryResetLock(state: LockState, lockDelayMs: number, cap: number): LockState {
  if (!state.grounded) return state;
  if (state.resetCount >= cap) return state;
  return { ...state, timerMs: lockDelayMs, resetCount: state.resetCount + 1 };
}

/** True iff the piece should lock now. */
export function shouldLock(state: LockState): boolean {
  return state.grounded && state.timerMs <= 0;
}
