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
 * Tetris preview: T-piece falls into a near-complete row at the bottom,
 * triggering a line-clear flash, then resets. Loop ~2000 ms.
 *
 * Well is 4 columns × 8 rows. T-piece orientation is "pointing up" (3 wide).
 */
@Component({
  selector: 'app-tetris-preview',
  template: `<canvas #cv aria-hidden="true"></canvas>`,
  styles: `:host { display: block; }
    canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TetrisPreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cv', { static: true }) private readonly cv!: ElementRef<HTMLCanvasElement>;
  private teardown: (() => void) | null = null;

  private static readonly LOOP_MS = 2000;
  private static readonly COLS = 4;
  private static readonly ROWS = 8;

  ngAfterViewInit(): void {
    this.teardown = startPreview(this.cv.nativeElement, {
      logicalSize: 96,
      draw: (ctx, t, size) => this.drawFrame(ctx, t / TetrisPreviewComponent.LOOP_MS, size),
      drawStatic: (ctx, size) => this.drawFrame(ctx, 0.7, size),
    });
  }

  ngOnDestroy(): void {
    this.teardown?.();
  }

  private drawFrame(ctx: CanvasRenderingContext2D, phase: number, size: number): void {
    const cols = TetrisPreviewComponent.COLS;
    const rows = TetrisPreviewComponent.ROWS;
    const cellW = size / cols;
    const cellH = size / rows;
    const p = phase - Math.floor(phase);

    // Background.
    ctx.fillStyle = PREVIEW_COLORS.bg;
    ctx.fillRect(0, 0, size, size);

    // Faint grid.
    ctx.strokeStyle = 'rgba(74, 82, 94, 0.25)';
    ctx.lineWidth = 1;
    for (let c = 1; c < cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW, size);
      ctx.stroke();
    }

    // Phases: 0.0-0.75 falling, 0.75-0.9 landed+flash, 0.9-1.0 cleared.
    const fallPhase = Math.min(p / 0.75, 1);
    const landed = p >= 0.75;
    const cleared = p >= 0.9;
    const flashOn = landed && !cleared && Math.floor((p - 0.75) / 0.05) % 2 === 0;

    // Bottom stack — last row, all columns filled except column 1 (where the
    // T-piece's center will slot in). After clear, the stack is gone.
    if (!cleared) {
      ctx.fillStyle = flashOn ? PREVIEW_COLORS.fg : PREVIEW_COLORS.brand;
      for (let c = 0; c < cols; c++) {
        if (c === 1) continue; // gap the piece fills
        this.drawCell(ctx, c, rows - 1, cellW, cellH, flashOn ? PREVIEW_COLORS.fg : PREVIEW_COLORS.brand);
      }
    }

    // T-piece — cells relative to top-left of a 3×2 bounding box.
    const tCells: ReadonlyArray<readonly [number, number]> = [
      [0, 1], [1, 0], [1, 1], [2, 1],
    ];
    if (!cleared) {
      const targetRow = rows - 1; // bottom row
      const baseRow = -1 + fallPhase * (targetRow); // piece "center" row
      const baseCol = 0; // T leftmost column = 0 → fills cols 0,1,2 of 4
      const color = flashOn ? PREVIEW_COLORS.fg : PREVIEW_COLORS.brandHi;
      for (const [dx, dy] of tCells) {
        const c = baseCol + dx;
        const r = baseRow + dy;
        this.drawCell(ctx, c, r, cellW, cellH, color);
      }
    }

    // Frame.
    ctx.strokeStyle = PREVIEW_COLORS.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }

  private drawCell(
    ctx: CanvasRenderingContext2D,
    col: number,
    row: number,
    cellW: number,
    cellH: number,
    color: string,
  ): void {
    const x = col * cellW;
    const y = row * cellH;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
  }
}
