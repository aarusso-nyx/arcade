export interface LoopOptions {
  /** Tick interval in milliseconds. Use setTickInterval() later for variable-rate games. */
  tickIntervalMs: number;
  /** Cap on ticks consumed per frame to avoid spiral-of-death after tab inactivity. Default 5. */
  maxAccumulatedTicks?: number;
  /** Advances the simulation one tick. */
  tick: () => void;
  /** Renders the current state. `alpha` is fractional progress into the next tick (0..1). */
  render: (alpha: number) => void;
  /** Pause when document.visibilitychange fires hidden. Default true. */
  pauseOnHidden?: boolean;
}

export interface Loop {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setTickInterval(ms: number): void;
  readonly paused: boolean;
  readonly running: boolean;
}

export function createLoop(opts: LoopOptions): Loop {
  const maxTicks = opts.maxAccumulatedTicks ?? 5;
  const pauseOnHidden = opts.pauseOnHidden ?? true;

  let tickMs = opts.tickIntervalMs;
  let rafHandle: number | null = null;
  let lastTime = 0;
  let accumulator = 0;
  let paused = false;
  let running = false;

  const frame = (now: number): void => {
    if (!running) return;
    if (paused) {
      lastTime = now;
      rafHandle = requestAnimationFrame(frame);
      return;
    }
    const dt = now - lastTime;
    lastTime = now;
    accumulator += dt;

    let ticks = 0;
    while (accumulator >= tickMs && ticks < maxTicks) {
      opts.tick();
      accumulator -= tickMs;
      ticks++;
    }
    if (ticks === maxTicks) accumulator = 0;

    opts.render(accumulator / tickMs);
    rafHandle = requestAnimationFrame(frame);
  };

  const onVisibilityChange = (): void => {
    if (!pauseOnHidden) return;
    if (document.hidden) pause();
    else resume();
  };

  const pause = (): void => {
    if (paused) return;
    paused = true;
  };

  const resume = (): void => {
    if (!paused) return;
    paused = false;
    lastTime = performance.now();
    accumulator = 0;
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      paused = false;
      lastTime = performance.now();
      accumulator = 0;
      if (pauseOnHidden) document.addEventListener('visibilitychange', onVisibilityChange);
      rafHandle = requestAnimationFrame(frame);
    },
    stop(): void {
      if (!running) return;
      running = false;
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      rafHandle = null;
      if (pauseOnHidden) document.removeEventListener('visibilitychange', onVisibilityChange);
    },
    pause,
    resume,
    setTickInterval(ms: number): void {
      tickMs = ms;
    },
    get paused(): boolean {
      return paused;
    },
    get running(): boolean {
      return running;
    },
  };
}
