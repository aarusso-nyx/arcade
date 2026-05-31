import { parseMaze } from './maze';
import { createInitialGameState } from './state';
import { currentMode, currentPhase, resetSchedule, tickSchedule } from './schedule';
import { TICK_HZ, getSchedule } from './config';

describe('pacman schedule', () => {
  const maze = parseMaze();

  function freshState(level = 1) {
    const s = createInitialGameState(maze, 0);
    s.level = level;
    resetSchedule(s);
    return s;
  }

  it('starts in scatter at level 1', () => {
    const s = freshState(1);
    expect(currentMode(s)).toBe('scatter');
  });

  it('progresses scatter -> chase after 7 seconds at level 1', () => {
    const s = freshState(1);
    expect(currentMode(s)).toBe('scatter');
    let flipped = false;
    for (let i = 0; i < 7 * TICK_HZ; i++) {
      if (tickSchedule(s)) flipped = true;
    }
    expect(flipped).toBeTrue();
    expect(currentMode(s)).toBe('chase');
  });

  it('advances through all canonical level-1 phases ending in chase forever', () => {
    const s = freshState(1);
    const sched = getSchedule(1);
    // Walk through every finite phase.
    let modeSequence: ('scatter' | 'chase')[] = [currentMode(s)];
    for (let phaseIdx = 0; phaseIdx < sched.length - 1; phaseIdx++) {
      const phase = sched[phaseIdx];
      if (!isFinite(phase.seconds)) break;
      const ticks = Math.round(phase.seconds * TICK_HZ);
      for (let i = 0; i < ticks; i++) tickSchedule(s);
      modeSequence.push(currentMode(s));
    }
    // Final element is chase (forever).
    expect(modeSequence[modeSequence.length - 1]).toBe('chase');
    // The sequence alternates.
    for (let i = 1; i < modeSequence.length; i++) {
      expect(modeSequence[i]).not.toBe(modeSequence[i - 1]);
    }
  });

  it('does not advance while frightened timer is set', () => {
    const s = freshState(1);
    s.frightenedTimer = 60;
    const before = s.scheduleIndex;
    for (let i = 0; i < 7 * TICK_HZ; i++) tickSchedule(s);
    expect(s.scheduleIndex).toBe(before);
  });

  it('terminates in chase forever (currentPhase returns Infinity seconds)', () => {
    const s = freshState(1);
    // Step through enough ticks to exhaust the finite phases.
    for (let i = 0; i < 200 * TICK_HZ; i++) tickSchedule(s);
    expect(currentPhase(s).mode).toBe('chase');
    expect(currentPhase(s).seconds).toBe(Infinity);
  });

  it('level 5 starts in scatter for 5 seconds', () => {
    const s = freshState(5);
    expect(currentPhase(s).seconds).toBe(5);
    expect(currentMode(s)).toBe('scatter');
  });
});
