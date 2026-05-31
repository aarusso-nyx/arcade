import { mulberry32 } from '../../../core';
import { SevenBag } from './randomizer';
import type { PieceType } from './types';

describe('tetris/randomizer (7-bag)', () => {
  it('every 7 consecutive pulls contains each piece exactly once', () => {
    const bag = new SevenBag(mulberry32(1));
    for (let bagIdx = 0; bagIdx < 20; bagIdx++) {
      const seen = new Set<PieceType>();
      for (let i = 0; i < 7; i++) seen.add(bag.next());
      expect(seen.size).toBe(7);
    }
  });

  it('over 7,000 pulls each piece appears exactly 1,000 times', () => {
    const bag = new SevenBag(mulberry32(42));
    const counts: Record<PieceType, number> = { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 };
    for (let i = 0; i < 7000; i++) counts[bag.next()]++;
    for (const p of ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as PieceType[]) {
      expect(counts[p]).toBe(1000);
    }
  });

  it('peek(5) returns the next 5 pieces in dispense order', () => {
    const bag = new SevenBag(mulberry32(1));
    const peeked = bag.peek(5);
    expect(peeked.length).toBe(5);
    for (let i = 0; i < 5; i++) expect(bag.next()).toBe(peeked[i]);
  });

  it('peek(n) does not consume', () => {
    const bag = new SevenBag(mulberry32(7));
    const before = bag.peek(3);
    const again = bag.peek(3);
    expect(again).toEqual(before);
  });

  it('seeded RNG produces a deterministic sequence', () => {
    const a = new SevenBag(mulberry32(123));
    const b = new SevenBag(mulberry32(123));
    for (let i = 0; i < 21; i++) expect(a.next()).toBe(b.next());
  });

  it('consecutive bags are independent (both contain all 7 pieces)', () => {
    const bag = new SevenBag(mulberry32(9));
    for (let i = 0; i < 5; i++) {
      const seen = new Set<PieceType>();
      for (let j = 0; j < 7; j++) seen.add(bag.next());
      expect(seen.size).toBe(7);
    }
  });
});
