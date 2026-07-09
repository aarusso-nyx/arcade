import { bench, formatBenchResult } from './bench';

describe('bench', () => {
  it('records mean / p95 / max and the configured iteration count', () => {
    let calls = 0;
    const result = bench(
      () => {
        calls++;
      },
      { budgetMs: 1, iterations: 50, warmup: 5 },
    );
    // Warmup runs are not counted in `iterations`, but they DO invoke fn.
    expect(calls).toBe(50 + 5);
    expect(result.iterations).toBe(50);
    expect(result.meanMs).toBeGreaterThanOrEqual(0);
    expect(result.p95Ms).toBeGreaterThanOrEqual(result.meanMs - 1e-3);
    expect(result.maxMs).toBeGreaterThanOrEqual(result.p95Ms);
    expect(result.budgetMs).toBe(1);
  });

  it('never throws, even if the workload blows past the budget', () => {
    // We only prove that bench returns a result; the caller — not bench — is
    // responsible for turning a slow measurement into a Jasmine failure.
    const result = bench(
      () => {
        // Deliberately do something measurable so meanMs > 0.
        let s = 0;
        for (let i = 0; i < 1000; i++) s += Math.sqrt(i);
        // The expression cannot be dead-code-eliminated: escape via a side effect.
        (globalThis as unknown as { __benchSink: number }).__benchSink = s;
      },
      { budgetMs: 0.000001, iterations: 20, warmup: 2 },
    );
    expect(result.iterations).toBe(20);
    expect(result.meanMs).toBeGreaterThan(0);
  });

  it('applies sensible defaults for iterations and warmup', () => {
    let calls = 0;
    const result = bench(
      () => {
        calls++;
      },
      { budgetMs: 1 },
    );
    // Defaults: 200 iterations + 20 warmup = 220 invocations.
    expect(calls).toBe(220);
    expect(result.iterations).toBe(200);
  });

  it('clamps iterations to at least 1', () => {
    let calls = 0;
    const result = bench(
      () => {
        calls++;
      },
      { budgetMs: 1, iterations: 0, warmup: 0 },
    );
    expect(result.iterations).toBe(1);
    expect(calls).toBe(1);
  });
});

describe('formatBenchResult', () => {
  it('includes mean / p95 / max / budget / iterations for failure messages', () => {
    const msg = formatBenchResult({
      meanMs: 0.1234,
      p95Ms: 0.2,
      maxMs: 0.5,
      iterations: 200,
      budgetMs: 1,
    });
    expect(msg).toContain('mean=');
    expect(msg).toContain('p95=');
    expect(msg).toContain('max=');
    expect(msg).toContain('budget=');
    expect(msg).toContain('iters=200');
  });
});
