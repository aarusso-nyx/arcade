/**
 * Shared helpers for the home-page game previews.
 *
 * Each preview is a tiny standalone canvas component that
 *   - sets up a per-card requestAnimationFrame loop
 *   - pauses when off-screen (IntersectionObserver)
 *   - renders a static frame and stays paused when the user
 *     prefers reduced motion (prefers-reduced-motion: reduce)
 *
 * The previews must not import from the game engines themselves —
 * they are decorative, deliberately small, and live in the home chunk.
 */

export interface PreviewHooks {
  /** Logical canvas size (square). Default 96. */
  readonly logicalSize?: number;
  /** Called once with a 2D context configured for pixel-art (no smoothing). */
  setup?: (ctx: CanvasRenderingContext2D, size: number) => void;
  /** Per-frame draw. `t` is monotonic ms since loop start. */
  draw: (ctx: CanvasRenderingContext2D, t: number, size: number) => void;
  /**
   * Optional reduced-motion frame; if omitted, the preview draws
   * `draw(ctx, 0, size)` and stays paused.
   */
  drawStatic?: (ctx: CanvasRenderingContext2D, size: number) => void;
}

/**
 * Wire a canvas to an animation loop with intersection + reduced-motion
 * awareness. Returns a teardown function — call from ngOnDestroy.
 */
export function startPreview(canvas: HTMLCanvasElement, hooks: PreviewHooks): () => void {
  const logicalSize = hooks.logicalSize ?? 96;
  const dpr = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));

  canvas.width = logicalSize * dpr;
  canvas.height = logicalSize * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  ctx.imageSmoothingEnabled = false;
  ctx.scale(dpr, dpr);
  hooks.setup?.(ctx, logicalSize);

  const reduceMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reduceMotionQuery.matches;

  let visible = true;
  let rafId = 0;
  let startedAt = 0;

  const drawStatic = () => {
    if (hooks.drawStatic) hooks.drawStatic(ctx, logicalSize);
    else hooks.draw(ctx, 0, logicalSize);
  };

  const tick = (now: number) => {
    if (!startedAt) startedAt = now;
    hooks.draw(ctx, now - startedAt, logicalSize);
    rafId = requestAnimationFrame(tick);
  };

  const start = () => {
    if (rafId || reducedMotion || !visible) return;
    startedAt = 0;
    rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const onReduceMotion = (ev: MediaQueryListEvent) => {
    reducedMotion = ev.matches;
    if (reducedMotion) {
      stop();
      drawStatic();
    } else {
      start();
    }
  };
  // Older Safari uses addListener/removeListener; modern uses addEventListener.
  reduceMotionQuery.addEventListener?.('change', onReduceMotion);

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    }
  }, { threshold: 0.01 });

  observer.observe(canvas);

  // Initial paint so an off-screen / reduced-motion card still shows something.
  drawStatic();
  if (!reducedMotion) start();

  return () => {
    stop();
    observer.disconnect();
    reduceMotionQuery.removeEventListener?.('change', onReduceMotion);
  };
}

// Brand palette — keep in sync with global theme tokens.
export const PREVIEW_COLORS = {
  bg: '#11161e',
  border: '#2a3140',
  brand: '#1F7AA8',
  brandHi: '#4EB0D9',
  accent: '#ffd24a',
  fg: '#e6ebf2',
  fgDim: '#7a8597',
  red: '#e35d6a',
  green: '#5fb56b',
  yellow: '#d4ad3a',
  gray: '#4a525e',
} as const;
