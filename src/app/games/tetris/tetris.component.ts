import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { createTetrisGame, type TetrisGame, type TetrisSnapshot } from './game';

@Component({
  selector: 'app-tetris',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header>
        <a routerLink="/">&larr; Arcade</a>
        <h2>Tetris</h2>
        <div class="scores">
          <div class="stat"><span class="label">Score</span><span class="value">{{ score() }}</span></div>
          <div class="stat"><span class="label">High</span><span class="value">{{ highScore() }}</span></div>
          <div class="stat"><span class="label">Lines</span><span class="value">{{ lines() }}</span></div>
          <div class="stat"><span class="label">Level</span><span class="value">{{ level() }}</span></div>
        </div>
      </header>
      <div #host class="host"></div>
      <p class="hint">
        Arrows to move &middot; Z/X or Up to rotate &middot; A for 180 &middot; Space hard drop
        &middot; Down soft drop &middot; C/Shift hold &middot; Esc/P pause &middot; Enter start/retry
      </p>
    </section>
  `,
  styles: `
    .page {
      max-width: 720px;
      margin: 0 auto;
      padding: 1.5rem;
      font-family: system-ui, sans-serif;
      color: #e6e6e6;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    header {
      width: 100%;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 1rem;
    }
    h2 { margin: 0; }
    a { color: inherit; text-decoration: none; opacity: 0.8; }
    a:hover { opacity: 1; }
    .scores {
      display: flex;
      gap: 1rem;
      font-variant-numeric: tabular-nums;
    }
    .stat { display: flex; flex-direction: column; align-items: flex-end; }
    .scores .label { color: #8a8f99; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .scores .value { font-size: 1.1rem; font-weight: 600; min-width: 3ch; text-align: right; }
    .host {
      width: 100%;
      background: #14171c;
      border-radius: 0.5rem;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 680px;
    }
    .hint { color: #8a8f99; font-size: 0.8rem; margin: 0; text-align: center; }
    :host { display: block; min-height: 100vh; background: #14171c; }
  `,
})
export class TetrisComponent implements AfterViewInit, OnDestroy {
  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private game: TetrisGame | null = null;
  private unsubscribe: (() => void) | null = null;

  protected readonly score = signal(0);
  protected readonly highScore = signal(0);
  protected readonly lines = signal(0);
  protected readonly level = signal(1);

  ngAfterViewInit(): void {
    this.game = createTetrisGame(this.hostRef().nativeElement);
    this.unsubscribe = this.game.onChange((snap: TetrisSnapshot) => {
      this.score.set(snap.score);
      this.highScore.set(snap.highScore);
      this.lines.set(snap.lines);
      this.level.set(snap.level);
    });
    this.game.start();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.game?.destroy();
  }
}
