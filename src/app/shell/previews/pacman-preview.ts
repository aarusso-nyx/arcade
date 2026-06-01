import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { PREVIEW_COLORS, startPreview } from './preview-shell';

/**
 * Pac-Man preview: 4×4 corridor, Pac-Man chomping rightward,
 * one ghost trailing two tiles behind. Loop ~3000 ms.
 */
@Component({
  selector: 'app-pacman-preview',
  template: `<canvas #cv aria-hidden="true"></canvas>`,
  styles: `:host { display: block; }
    canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PacmanPreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cv', { static: true }) private readonly cv!: ElementRef<HTMLCanvasElement>;
  private teardown: (() => void) | null = null;

  private static readonly LOOP_MS = 3000;
  private static readonly TILES = 4;

  ngAfterViewInit(): void {
    this.teardown = startPreview(this.cv.nativeElement, {
      logicalSize: 96,
      draw: (ctx, t, size) => this.drawFrame(ctx, t / PacmanPreviewComponent.LOOP_MS, size),
      drawStatic: (ctx, size) => this.drawFrame(ctx, 0.25, size),
    });
  }

  ngOnDestroy(): void {
    this.teardown?.();
  }

  private drawFrame(ctx: CanvasRenderingContext2D, phase: number, size: number): void {
    const tiles = PacmanPreviewComponent.TILES;
    const tile = size / tiles;
    const p = phase - Math.floor(phase); // 0..1

    // Background.
    ctx.fillStyle = PREVIEW_COLORS.bg;
    ctx.fillRect(0, 0, size, size);

    // Maze walls — a simple frame + two interior pillars.
    ctx.fillStyle = PREVIEW_COLORS.brand;
    ctx.fillRect(0, 0, size, 2);
    ctx.fillRect(0, size - 2, size, 2);
    ctx.fillRect(0, 0, 2, size);
    ctx.fillRect(size - 2, 0, 2, size);
    ctx.fillRect(tile * 1.1, tile * 0.6, tile * 0.4, tile * 0.4);
    ctx.fillRect(tile * 2.5, tile * 2.6, tile * 0.4, tile * 0.4);

    // Pellets along the central corridor (row 2 of 4).
    const corridorY = tile * 2;
    ctx.fillStyle = PREVIEW_COLORS.accent;
    for (let i = 0; i < tiles; i++) {
      const px = tile * (i + 0.5);
      const eaten = p > i / tiles && p < (i + 0.5) / tiles;
      if (!eaten) {
        ctx.beginPath();
        ctx.arc(px, corridorY, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pac-Man — chomps once per tile.
    const pacX = (p * tiles) * tile;
    const pacY = corridorY;
    const radius = tile * 0.4;
    const chomp = Math.abs(Math.sin(p * tiles * Math.PI)) * 0.55;
    ctx.fillStyle = PREVIEW_COLORS.accent;
    ctx.beginPath();
    ctx.moveTo(pacX, pacY);
    ctx.arc(pacX, pacY, radius, chomp, Math.PI * 2 - chomp);
    ctx.closePath();
    ctx.fill();

    // Ghost — trails two tiles behind, wraps around.
    const ghostPhase = ((p * tiles - 2) + tiles) % tiles;
    const gx = (ghostPhase / tiles) * size;
    const gy = corridorY - radius;
    ctx.fillStyle = PREVIEW_COLORS.red;
    // Body
    ctx.beginPath();
    ctx.arc(gx, gy + radius, radius, Math.PI, 0);
    ctx.lineTo(gx + radius, gy + radius * 2);
    // Wavy skirt.
    const skirtCount = 3;
    for (let i = 0; i < skirtCount; i++) {
      const x = gx + radius - ((i + 1) / skirtCount) * radius * 2;
      const y = gy + radius * 2 - (i % 2 === 0 ? radius * 0.35 : 0);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // Eyes
    ctx.fillStyle = PREVIEW_COLORS.fg;
    ctx.fillRect(gx - radius * 0.5, gy + radius * 0.7, 2, 2);
    ctx.fillRect(gx + radius * 0.2, gy + radius * 0.7, 2, 2);
  }
}
