/**
 * Fixed-capacity FIFO for input intents (turn directions, rotation requests, etc.).
 * The oldest entry is dropped if the buffer overflows.
 *
 * Used by Pac-Man (turn buffering at intersections) and Snake (queueing tight turns
 * between ticks so two quick presses both register).
 */
export class InputBuffer<T> {
  private readonly q: T[] = [];

  constructor(private readonly capacity: number = 2) {
    if (capacity < 1) throw new Error('InputBuffer capacity must be >= 1');
  }

  push(item: T): void {
    this.q.push(item);
    while (this.q.length > this.capacity) this.q.shift();
  }

  peek(): T | undefined {
    return this.q[0];
  }

  /** Returns the most recent entry without consuming. */
  peekLast(): T | undefined {
    return this.q[this.q.length - 1];
  }

  shift(): T | undefined {
    return this.q.shift();
  }

  clear(): void {
    this.q.length = 0;
  }

  get size(): number {
    return this.q.length;
  }

  get isEmpty(): boolean {
    return this.q.length === 0;
  }
}
