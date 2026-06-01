import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { PREVIEW_COLORS, startPreview } from './preview-shell';

/**
 * Snake preview: 8×8 board, 3-segment snake travelling a fixed path that
 * forms a rough figure-8. An apple spawns on the path and is "eaten"
 * each loop. Loop ~3000 ms.
 *
 * To keep this cheap and predictable we precompute the path as a series
 * of cells and sample it by phase. Apple sits at a fixed cell on the
 * path; when the head reaches it, we recolor a flash frame.
 */
@Component({
  selector: 'app-snake-preview',
  template: `<canvas #cv aria-hidden="true"></canvas>`,
  styles: `:host { display: block; }
    canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnakePreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cv', { static: true }) private readonly cv!: ElementRef<HTMLCanvasElement>;
  private teardown: (() => void) | null = null;

  private static readonly LOOP_MS = 3000;
  private static readonly TILES = 8;

  // Figure-8 path on an 8×8 grid: cycle through 16 cells.
  private static readonly PATH: ReadonlyArray<readonly [number, number]> = [
    [1, 1], [2, 1], [3, 1], [4, 2], [5, 3], [6, 4],
    [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 5],
    [1, 4], [2, 3], [3, 2], [2, 2],
  ];

  // Apple sits on cell index 6 of the path.
  private static readonly APPLE_INDEX = 6;

  ngAfterViewInit(): void {
    this.teardown = startPreview(this.cv.nativeElement, {
      logicalSize: 96,
      draw: (ctx, t, size) => this.drawFrame(ctx, t / SnakePreviewComponent.LOOP_MS, size),
      drawStatic: (ctx, size) => this.drawFrame(ctx, 0.1, size),
    });
  }

  ngOnDestroy(): void {
    this.teardown?.();
  }

  private drawFrame(ctx: CanvasRenderingContext2D, phase: number, size: number): void {
    const tiles = SnakePreviewComponent.TILES;
    const cell = size / tiles;
    const path = SnakePreviewComponent.PATH;
    const len = path.length;
    const p = phase - Math.floor(phase);
    const headPosF = p * len;
    const headIdx = Math.floor(headPosF) % len;

    // Background.
    ctx.fillStyle = PREVIEW_COLORS.bg;
    ctx.fillRect(0, 0, size, size);

    // Faint grid dots.
    ctx.fillStyle = 'rgba(74, 82, 94, 0.4)';
    for (let r = 0; r < tiles; r++) {
      for (let c = 0; c < tiles; c++) {
        ctx.fillRect(c * cell + cell / 2 - 0.5, r * cell + cell / 2 - 0.5, 1, 1);
      }
    }

    // Apple — disappears for one cell-tick when eaten, then respawns.
    const appleIdx = SnakePreviewComponent.APPLE_INDEX;
    const eaten = headIdx === appleIdx;
    if (!eaten) {
      const [ax, ay] = path[appleIdx];
      ctx.fillStyle = PREVIEW_COLORS.red;
      ctx.beginPath();
      ctx.arc(ax * cell + cell / 2, ay * cell + cell / 2, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    // Snake — head + 2 body segments, trailing along the path.
    for (let i = 0; i < 3; i++) {
      const idx = (headIdx - i + len) % len;
      const [cx, cy] = path[idx];
      const isHead = i === 0;
      ctx.fillStyle = isHead ? PREVIEW_COLORS.brandHi : PREVIEW_COLORS.brand;
      const inset = isHead ? 2 : 3;
      ctx.fillRect(
        cx * cell + inset,
        cy * cell + inset,
        cell - inset * 2,
        cell - inset * 2,
      );
    }

    // Frame.
    ctx.strokeStyle = PREVIEW_COLORS.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }
}
