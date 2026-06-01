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
 * Termo preview: a single row of 5 tiles. Letters T-E-R-M-O pop in one
 * at a time, then flip-reveal a canonical green/yellow/gray pattern,
 * then reset. Loop ~4000 ms.
 */
@Component({
  selector: 'app-termo-preview',
  template: `<canvas #cv aria-hidden="true"></canvas>`,
  styles: `:host { display: block; }
    canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermoPreviewComponent implements AfterViewInit, OnDestroy {
  @ViewChild('cv', { static: true }) private readonly cv!: ElementRef<HTMLCanvasElement>;
  private teardown: (() => void) | null = null;

  private static readonly LOOP_MS = 4000;
  private static readonly LETTERS = ['T', 'E', 'R', 'M', 'O'] as const;
  // Canonical reveal — green, gray, yellow, gray, green.
  private static readonly REVEAL = ['g', '-', 'y', '-', 'g'] as const;

  ngAfterViewInit(): void {
    this.teardown = startPreview(this.cv.nativeElement, {
      logicalSize: 96,
      setup: (ctx) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
      },
      draw: (ctx, t, size) => this.drawFrame(ctx, t / TermoPreviewComponent.LOOP_MS, size),
      drawStatic: (ctx, size) => this.drawFrame(ctx, 0.85, size),
    });
  }

  ngOnDestroy(): void {
    this.teardown?.();
  }

  private drawFrame(ctx: CanvasRenderingContext2D, phase: number, size: number): void {
    const p = phase - Math.floor(phase);

    // Background.
    ctx.fillStyle = PREVIEW_COLORS.bg;
    ctx.fillRect(0, 0, size, size);

    const cellGap = 2;
    const totalGap = cellGap * 4;
    const cellW = (size - totalGap - 8) / 5;
    const cellH = cellW;
    const y = (size - cellH) / 2;

    // Phases:
    //   0.00 – 0.50  letters appear one by one (10% per letter)
    //   0.50 – 0.85  flip-reveal one by one (7% per letter)
    //   0.85 – 1.00  hold revealed state
    const appearEnd = 0.5;
    const revealStart = 0.5;
    const revealEnd = 0.85;
    const perAppear = (appearEnd - 0) / 5;
    const perReveal = (revealEnd - revealStart) / 5;

    ctx.font = `${Math.floor(cellH * 0.55)}px var(--nyx-pixel-font, monospace)`;

    for (let i = 0; i < 5; i++) {
      const x = 4 + i * (cellW + cellGap);
      const letterAppearAt = i * perAppear;
      const letterRevealAt = revealStart + i * perReveal;

      // Determine state.
      const hasLetter = p >= letterAppearAt;
      const revealing = p >= letterRevealAt && p < letterRevealAt + perReveal;
      const revealed = p >= letterRevealAt + perReveal;

      // Flip animation: scale Y from 1 → 0 → 1 over `perReveal` window.
      let scaleY = 1;
      let showRevealColor = revealed;
      if (revealing) {
        const local = (p - letterRevealAt) / perReveal;
        scaleY = Math.abs(local * 2 - 1); // 1 → 0 → 1
        showRevealColor = local >= 0.5;
      }

      ctx.save();
      ctx.translate(x + cellW / 2, y + cellH / 2);
      ctx.scale(1, scaleY);

      // Tile.
      let fill: string = PREVIEW_COLORS.bg;
      let stroke: string = PREVIEW_COLORS.border;
      let textColor: string = PREVIEW_COLORS.fg;

      if (showRevealColor) {
        const r = TermoPreviewComponent.REVEAL[i];
        if (r === 'g') {
          fill = PREVIEW_COLORS.green;
          stroke = PREVIEW_COLORS.green;
        } else if (r === 'y') {
          fill = PREVIEW_COLORS.yellow;
          stroke = PREVIEW_COLORS.yellow;
        } else {
          fill = PREVIEW_COLORS.gray;
          stroke = PREVIEW_COLORS.gray;
        }
        textColor = PREVIEW_COLORS.fg;
      } else if (hasLetter) {
        stroke = PREVIEW_COLORS.brand;
      }

      ctx.fillStyle = fill;
      ctx.fillRect(-cellW / 2, -cellH / 2, cellW, cellH);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-cellW / 2 + 0.75, -cellH / 2 + 0.75, cellW - 1.5, cellH - 1.5);

      if (hasLetter) {
        ctx.fillStyle = textColor;
        // Mid-flip, hide the glyph to sell the rotation illusion.
        if (!revealing || scaleY > 0.25) {
          ctx.fillText(TermoPreviewComponent.LETTERS[i], 0, 1);
        }
      }
      ctx.restore();
    }
  }
}
