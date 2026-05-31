import type { RNG } from '../../../core';
import type { PieceType } from './types';

const PIECES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/**
 * 7-bag randomizer. Shuffles all seven pieces and dispenses them until empty,
 * then refills. Pop from the end of the internal array.
 */
export class SevenBag {
  private bag: PieceType[] = [];
  constructor(private readonly rng: RNG) {
    this.refill();
  }

  next(): PieceType {
    if (this.bag.length === 0) this.refill();
    return this.bag.pop()!;
  }

  /** Returns the next n pieces in dispense order, without consuming them. */
  peek(n: number): PieceType[] {
    while (this.bag.length < n) this.refill();
    const out: PieceType[] = [];
    for (let i = 0; i < n; i++) out.push(this.bag[this.bag.length - 1 - i]);
    return out;
  }

  private refill(): void {
    const fresh: PieceType[] = PIECES.slice();
    // Fisher-Yates
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    // Prepend so we still pop from the end.
    this.bag = fresh.concat(this.bag);
  }
}
