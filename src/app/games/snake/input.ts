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
  private buffer: InputBuffer<Direction>;
  private cap: number;

  constructor(capacity = 2) {
    this.cap = capacity;
    this.buffer = new InputBuffer<Direction>(capacity);
  }

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

  /**
   * Resize the queue's capacity. Existing queued items are preserved in
   * FIFO order up to the new capacity; if shrinking past the current size,
   * the OLDEST entries are dropped (matches `InputBuffer`'s overflow rule).
   */
  resize(capacity: number): void {
    if (capacity < 1) throw new Error('DirectionQueue capacity must be >= 1');
    if (capacity === this.cap) return;
    // Drain existing entries in FIFO order.
    const carry: Direction[] = [];
    let d: Direction | undefined;
    while ((d = this.buffer.shift()) !== undefined) carry.push(d);
    this.cap = capacity;
    this.buffer = new InputBuffer<Direction>(capacity);
    // Re-push; InputBuffer drops oldest on overflow, which is what we want.
    for (const item of carry) this.buffer.push(item);
  }

  get capacity(): number {
    return this.cap;
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
