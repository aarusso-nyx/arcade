import { TICK_HZ, getSchedule, type SchedulePhase } from './config';
import type { GameState } from './types';

export function currentMode(state: GameState): 'scatter' | 'chase' {
  const sched = getSchedule(state.level);
  const idx = Math.min(state.scheduleIndex, sched.length - 1);
  return sched[idx].mode;
}

export function currentPhase(state: GameState): SchedulePhase {
  const sched = getSchedule(state.level);
  const idx = Math.min(state.scheduleIndex, sched.length - 1);
  return sched[idx];
}

/**
 * Advance the scatter/chase schedule by one tick. Returns true if the mode
 * just flipped (caller is responsible for reversing eligible ghosts).
 *
 * Does NOT advance while a frightened window is active (spec § 7.2).
 */
export function tickSchedule(state: GameState): boolean {
  if (state.frightenedTimer > 0) return false;
  const sched = getSchedule(state.level);
  if (state.scheduleFinal) return false;

  const phase = sched[state.scheduleIndex];
  if (phase.seconds === Infinity) {
    state.scheduleFinal = true;
    return false;
  }
  state.schedulePhaseTicks += 1;
  const phaseTicks = Math.max(1, Math.round(phase.seconds * TICK_HZ));
  if (state.schedulePhaseTicks >= phaseTicks) {
    state.scheduleIndex += 1;
    state.schedulePhaseTicks = 0;
    if (state.scheduleIndex >= sched.length) {
      state.scheduleIndex = sched.length - 1;
      state.scheduleFinal = true;
    }
    return true;
  }
  return false;
}

export function resetSchedule(state: GameState): void {
  state.scheduleIndex = 0;
  state.schedulePhaseTicks = 0;
  state.scheduleFinal = false;
}
