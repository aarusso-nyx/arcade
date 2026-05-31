export type RNG = () => number;

/**
 * mulberry32 — a fast, well-distributed seeded PRNG.
 * Returns a function that yields uniform doubles in [0, 1).
 *
 * Used wherever a game needs reproducible randomness for tests
 * (snake food spawns, tetris 7-bag, pacman frightened decisions).
 */
export function mulberry32(seed: number): RNG {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive lower, exclusive upper. */
export const randInt = (rng: RNG, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo));
