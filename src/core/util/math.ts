export const clamp = (value: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, value));

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

export const manhattan = (ax: number, ay: number, bx: number, by: number): number =>
  Math.abs(ax - bx) + Math.abs(ay - by);

export const euclideanSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
