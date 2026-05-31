/**
 * Tetris Worlds gravity curve. Returns rows per 60Hz tick.
 *
 * Formula: secondsPerRow(level) = (0.8 - (level - 1) * 0.007) ^ (level - 1)
 *          rowsPerTick(level)   = (1 / 60) / secondsPerRow(level)
 *
 * Clamped at 20 rows per tick (full board height) for level >= 20.
 */
const GRAVITY_TABLE: number[] = (() => {
  const t: number[] = [];
  t[0] = 0; // unused
  for (let level = 1; level <= 30; level++) {
    const base = 0.8 - (level - 1) * 0.007;
    const sec = Math.pow(base, level - 1);
    const rpt = (1 / 60) / sec;
    t[level] = Math.min(20, rpt);
  }
  return t;
})();

export function gravityForLevel(level: number): number {
  if (level < 1) return GRAVITY_TABLE[1];
  if (level >= 20) return 20;
  return GRAVITY_TABLE[level];
}
