import { Direction, OPPOSITE, InputBuffer } from '../../../core';

/**
 * Direction queue with the 180-degree guard the Snake spec calls for.
 *
 * The guard consults the queue *tail* (or the live snake direction if the
 * queue is empty). Without this, a player moving east could press north then
 * south on the same tick — both legal individually — and the south press would
 * reverse the queued north, putting the snake into its own body next tick.
 *
 * Capacity 2: depth 1 makes diagonal-corner inputs feel laggy; depth 3+
 * accepts inputs the player has already forgotten about.
 */
export class DirectionQueue {
  private readonly buffer = new InputBuffer<Direction>(2);

  /** Returns true if the input was accepted, false if rejected (reverse) or dropped (full). */
  enqueue(d: Direction, liveDirection: Direction): boolean {
    const last = this.buffer.peekLast() ?? liveDirection;
    if (OPPOSITE[last] === d) return false;
    if (last === d) return false;
    this.buffer.push(d);
    return true;
  }

  /** Removes and returns the next queued direction, or undefined. */
  shift(): Direction | undefined {
    return this.buffer.shift();
  }

  clear(): void {
    this.buffer.clear();
  }

  get size(): number {
    return this.buffer.size;
  }
}

export const KEY_TO_DIRECTION: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

export const PREVENT_DEFAULT_CODES = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
] as const;
