export interface CanvasMountOptions {
  /** Logical (pre-scale) width in CSS pixels. */
  logicalWidth: number;
  /** Logical (pre-scale) height in CSS pixels. */
  logicalHeight: number;
  /**
   * Scaling strategy:
   *  - 'pixel-art' (default): integer scale that fits the host node, image-rendering pixelated, letterboxed.
   *  - 'fit': non-integer scale that fits the host node, smooth rendering.
   *  - 'dpr': 1:1 logical pixels, scale ctx by devicePixelRatio for crisp text/lines.
   */
  scaling?: 'pixel-art' | 'fit' | 'dpr';
  /** Background color applied to the host node (letterbox). Default transparent. */
  background?: string;
  /** Debounce ms for resize handling. Default 100. */
  resizeDebounceMs?: number;
}

export interface CanvasMount {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Scale factor currently applied to the canvas backing store. */
  readonly scale: number;
  /** Begin a frame: clears transforms, applies the current scale, clears the surface. */
  beginFrame(clearColor?: string): void;
  /** Recompute scale to fit the host node. Called automatically on window resize. */
  resize(): void;
  destroy(): void;
}

const PIXEL_ART_STYLES = 'image-rendering: pixelated; image-rendering: crisp-edges;';

export function mountCanvas(host: HTMLElement, opts: CanvasMountOptions): CanvasMount {
  const scaling = opts.scaling ?? 'pixel-art';
  const debounceMs = opts.resizeDebounceMs ?? 100;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  if (scaling === 'pixel-art') canvas.setAttribute('style', PIXEL_ART_STYLES);
  if (opts.background) host.style.background = opts.background;

  host.appendChild(canvas);

  let scale = 1;

  const computeScale = (): number => {
    const w = host.clientWidth || opts.logicalWidth;
    const h = host.clientHeight || opts.logicalHeight;
    switch (scaling) {
      case 'pixel-art': {
        const fit = Math.min(w / opts.logicalWidth, h / opts.logicalHeight);
        return Math.max(1, Math.floor(fit));
      }
      case 'fit':
        return Math.min(w / opts.logicalWidth, h / opts.logicalHeight);
      case 'dpr':
        return window.devicePixelRatio || 1;
    }
  };

  const apply = (): void => {
    scale = computeScale();
    canvas.width = Math.round(opts.logicalWidth * scale);
    canvas.height = Math.round(opts.logicalHeight * scale);
    canvas.style.width = `${opts.logicalWidth * (scaling === 'dpr' ? 1 : scale)}px`;
    canvas.style.height = `${opts.logicalHeight * (scaling === 'dpr' ? 1 : scale)}px`;
  };

  apply();

  let debounceHandle: number | null = null;
  const onResize = (): void => {
    if (debounceHandle !== null) window.clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(() => {
      apply();
      debounceHandle = null;
    }, debounceMs);
  };
  window.addEventListener('resize', onResize);

  return {
    canvas,
    ctx,
    get scale() {
      return scale;
    },
    beginFrame(clearColor?: string): void {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (clearColor) {
        ctx.fillStyle = clearColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      ctx.scale(scale, scale);
    },
    resize: apply,
    destroy(): void {
      window.removeEventListener('resize', onResize);
      if (debounceHandle !== null) window.clearTimeout(debounceHandle);
      canvas.remove();
    },
  };
}
