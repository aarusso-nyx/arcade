/**
 * Micro-benchmark helper for perf-budget tests.
 *
 * Runs `fn` a fixed number of times, measures each invocation with
 * `performance.now()` and returns the mean / p95 / max wall-clock in ms.
 *
 * The helper is intentionally dumb: it does not throw on budget miss and
 * does not print. The test suite calls `bench(...)` and uses Jasmine's
 * `expect(result.meanMs).toBeLessThan(budgetMs)` — including the full
 * measurements in the failure message so a regression is debuggable.
 *
 * A "warmup" phase runs `fn` first without recording so JIT / branch
 * predictor / cache priming don't skew the mean of a small sample.
 */

export interface BenchOptions {
  /** Maximum allowed mean tick duration in milliseconds. */
  readonly budgetMs: number;
  /** Iterations to run after warmup. Default 200. */
  readonly iterations?: number;
  /** Warmup iterations not counted in the mean. Default 20. */
  readonly warmup?: number;
}

export interface BenchResult {
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly iterations: number;
  /** Budget forwarded from options, for convenient failure messages. */
  readonly budgetMs: number;
}

const DEFAULT_ITERATIONS = 200;
const DEFAULT_WARMUP = 20;

export function bench(fn: () => void, opts: BenchOptions): BenchResult {
  const iterations = Math.max(1, opts.iterations ?? DEFAULT_ITERATIONS);
  const warmup = Math.max(0, opts.warmup ?? DEFAULT_WARMUP);

  for (let i = 0; i < warmup; i++) fn();

  const samples = new Float64Array(iterations);
  let sum = 0;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    const dt = performance.now() - t0;
    samples[i] = dt;
    sum += dt;
  }

  const sorted = Array.from(samples).sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return {
    meanMs: sum / iterations,
    p95Ms: sorted[p95Index],
    maxMs: sorted[sorted.length - 1],
    iterations,
    budgetMs: opts.budgetMs,
  };
}

/**
 * Format a BenchResult for a Jasmine failure message. Test-side pattern:
 *
 *   const result = bench(() => tick(), { budgetMs: 0.5 });
 *   expect(result.meanMs).withContext(formatBenchResult(result)).toBeLessThan(0.5);
 */
export function formatBenchResult(result: BenchResult): string {
  const fmt = (n: number): string => n.toFixed(4);
  return (
    `bench: mean=${fmt(result.meanMs)}ms p95=${fmt(result.p95Ms)}ms ` +
    `max=${fmt(result.maxMs)}ms budget=${fmt(result.budgetMs)}ms ` +
    `iters=${result.iterations}`
  );
}
