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
import { createSnakeGame, type SnakeGame } from './game';

@Component({
  selector: 'app-snake',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header>
        <a routerLink="/">&larr; Arcade</a>
        <h2>Snake</h2>
        <div class="scores">
          <span class="label">Score</span>
          <span class="value">{{ score() }}</span>
          <span class="label">Best</span>
          <span class="value">{{ highScore() }}</span>
        </div>
      </header>
      <div #host class="host"></div>
      <p class="hint">
        Arrows or WASD to turn. Space pauses. Enter starts.
        T toggles wrap mode (resets the run). 1 / 2 / 3 set the input queue depth.
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
      align-items: baseline;
      gap: 0.5rem;
      font-variant-numeric: tabular-nums;
    }
    .scores .label { color: #8a8f99; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .scores .value { font-size: 1.25rem; font-weight: 600; min-width: 3ch; text-align: right; }
    .host {
      width: 100%;
      aspect-ratio: 1 / 1;
      max-width: 600px;
      background: #0b0d10;
      border-radius: 0.5rem;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hint { color: #8a8f99; font-size: 0.85rem; margin: 0; }
    :host { display: block; min-height: 100vh; background: #14171c; }
  `,
})
export class SnakeComponent implements AfterViewInit, OnDestroy {
  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private game: SnakeGame | null = null;
  private unsubscribe: (() => void) | null = null;

  protected readonly score = signal(0);
  protected readonly highScore = signal(0);

  ngAfterViewInit(): void {
    this.game = createSnakeGame(this.hostRef().nativeElement);
    this.unsubscribe = this.game.onScoreChange((s, hs) => {
      this.score.set(s);
      this.highScore.set(hs);
    });
    this.game.start();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.game?.destroy();
  }
}
