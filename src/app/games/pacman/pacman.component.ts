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
import { createPacmanGame, type PacmanGame } from './game';

@Component({
  selector: 'app-pacman',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header>
        <a routerLink="/">&larr; Arcade</a>
        <h2>Pac-Man</h2>
        <div class="scores">
          <span class="label">Score</span>
          <span class="value">{{ score() }}</span>
          <span class="label">High</span>
          <span class="value">{{ highScore() }}</span>
          <span class="label">Lives</span>
          <span class="value">{{ lives() }}</span>
          <span class="label">Level</span>
          <span class="value">{{ level() }}</span>
        </div>
      </header>
      <div #host class="host"></div>
      <p class="hint">Arrows or WASD to turn. P or Esc to pause. Enter to restart from game over.</p>
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
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.5rem 0.75rem;
      font-variant-numeric: tabular-nums;
    }
    .scores .label { color: #8a8f99; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .scores .value { font-size: 1.05rem; font-weight: 600; min-width: 2ch; text-align: right; }
    .host {
      width: 100%;
      max-width: 560px;
      aspect-ratio: 224 / 288;
      background: #000;
      border-radius: 0.5rem;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hint { color: #8a8f99; font-size: 0.85rem; margin: 0; text-align: center; }
    :host { display: block; min-height: 100vh; background: #14171c; }
  `,
})
export class PacmanComponent implements AfterViewInit, OnDestroy {
  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private game: PacmanGame | null = null;
  private unsubscribe: (() => void) | null = null;

  protected readonly score = signal(0);
  protected readonly highScore = signal(0);
  protected readonly lives = signal(0);
  protected readonly level = signal(1);

  ngAfterViewInit(): void {
    this.game = createPacmanGame(this.hostRef().nativeElement);
    this.unsubscribe = this.game.onScoreChange((s) => {
      this.score.set(s.score);
      this.highScore.set(s.highScore);
      this.lives.set(s.lives);
      this.level.set(s.level);
    });
    this.game.start();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.game?.destroy();
  }
}
