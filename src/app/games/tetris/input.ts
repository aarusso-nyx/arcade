/**
 * DAS/ARR state machine for a single direction key.
 *
 * Behavior:
 *  - On key down: fire one immediate move, start DAS timer.
 *  - While held: DAS timer counts down. When it hits 0, switch to ARR mode.
 *  - In ARR mode: fire one move per ARR interval. If ARR <= 0, fire as many
 *    repeats as fit (charge-dash to wall).
 */
export interface DASState {
  pressed: boolean;
  /** Time remaining (ms) before DAS expires. */
  dasTimer: number;
  /** Time remaining (ms) before next ARR repeat. */
  arrTimer: number;
  /** Have we entered ARR (auto-repeat) mode for this press? */
  inARR: boolean;
}

export function createDASState(): DASState {
  return { pressed: false, dasTimer: 0, arrTimer: 0, inARR: false };
}

export function dasOnKeyDown(state: DASState, dasMs: number): { fire: boolean } {
  state.pressed = true;
  state.dasTimer = dasMs;
  state.arrTimer = 0;
  state.inARR = false;
  return { fire: true };
}

export function dasOnKeyUp(state: DASState): void {
  state.pressed = false;
  state.dasTimer = 0;
  state.arrTimer = 0;
  state.inARR = false;
}

/**
 * Advance the DAS/ARR timer by dtMs. Returns the number of times the action
 * should fire this frame (>=0).
 */
export function tickDAS(state: DASState, dtMs: number, dasMs: number, arrMs: number): number {
  if (!state.pressed) return 0;
  if (!state.inARR) {
    state.dasTimer -= dtMs;
    if (state.dasTimer > 0) return 0;
    // DAS expired this frame; convert leftover into ARR fires.
    const leftover = -state.dasTimer;
    state.inARR = true;
    state.arrTimer = arrMs;
    if (arrMs <= 0) {
      // Charge-dash; caller should treat a large repeat count as "to the wall".
      return 99;
    }
    let fires = 0;
    let acc = leftover;
    while (acc >= arrMs) {
      fires++;
      acc -= arrMs;
    }
    state.arrTimer = arrMs - acc;
    return fires;
  }
  // Already in ARR.
  if (arrMs <= 0) return 99;
  state.arrTimer -= dtMs;
  let fires = 0;
  while (state.arrTimer <= 0) {
    fires++;
    state.arrTimer += arrMs;
    if (fires > 99) break;
  }
  return fires;
}

/** Keys we preventDefault on. */
export const PREVENT_DEFAULT_CODES: readonly string[] = [
  'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp',
  'Space', 'KeyZ', 'KeyX', 'KeyC', 'KeyA', 'KeyP',
  'ShiftLeft', 'ShiftRight', 'Escape', 'Enter',
];
