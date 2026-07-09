import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { PREVIEW_COLORS, startPreview } from './preview-shell';

@Component({
  selector: 'app-bricks-preview',
  template: `<canvas #cv aria-hidden="true"></canvas>`,
  styles: `:host { display: block; }
    canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BricksPreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cv', { static: true }) private readonly cv!: ElementRef<HTMLCanvasElement>;
  private teardown: (() => void) | null = null;

  ngAfterViewInit(): void {
    this.teardown = startPreview(this.cv.nativeElement, {
      logicalSize: 96,
      draw: (ctx, t, size) => this.drawFrame(ctx, t / 1700, size),
      drawStatic: (ctx, size) => this.drawFrame(ctx, 0.42, size),
    });
  }

  ngOnDestroy(): void {
    this.teardown?.();
  }

  private drawFrame(ctx: CanvasRenderingContext2D, phase: number, size: number): void {
    const p = phase - Math.floor(phase);
    ctx.fillStyle = PREVIEW_COLORS.bg;
    ctx.fillRect(0, 0, size, size);

    const colors = [PREVIEW_COLORS.red, PREVIEW_COLORS.yellow, PREVIEW_COLORS.green, PREVIEW_COLORS.brandHi];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        if ((row === 1 && col === 3 && p > 0.4) || (row === 2 && col === 4 && p > 0.72)) continue;
        ctx.fillStyle = colors[row];
        ctx.fillRect(7 + col * 14, 10 + row * 8, 11, 5);
      }
    }

    const paddleX = 24 + Math.sin(p * Math.PI * 2) * 14;
    ctx.fillStyle = PREVIEW_COLORS.brandHi;
    ctx.fillRect(paddleX, 78, 34, 5);
    ctx.fillStyle = PREVIEW_COLORS.fg;
    ctx.fillRect(paddleX + 6, 79, 22, 1);

    const ballPath = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
    const ballX = 38 + ballPath * 28;
    const ballY = 72 - ballPath * 38;
    ctx.fillStyle = PREVIEW_COLORS.accent;
    ctx.beginPath();
    ctx.arc(ballX, ballY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = PREVIEW_COLORS.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }
}
