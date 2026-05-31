import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HelpDialogComponent } from '../../shared/help-dialog/help-dialog.component';
import { createPacmanGame, type PacmanGame } from './game';

@Component({
  selector: 'app-pacman',
  imports: [RouterLink, HelpDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header>
        <a routerLink="/">&larr; Arcade</a>
        <h2 class="pixel">Pac-Man</h2>
        <div class="scores">
          <span class="label">Score</span>
          <span class="value">{{ score() }}</span>
          <span class="label">High</span>
          <span class="value">{{ highScore() }}</span>
          <span class="label">Lives</span>
          <span class="value">{{ lives() }}</span>
          <span class="label">Level</span>
          <span class="value">{{ level() }}</span>
          <button
            type="button"
            class="help-btn"
            (click)="helpOpen.set(true)"
            aria-label="Instructions"
            title="Instructions (H or ?)"
          >?</button>
        </div>
      </header>
      <div #host class="host"></div>
      <p class="hint">Arrows or WASD to turn. P or Space pause. Enter to restart. Esc pause / quit. H or ? for help.</p>
      <app-help-dialog [(open)]="helpOpen" title="Pac-Man">
        <h4>Goal</h4>
        <p>
          Clear the maze of all <strong>240 pellets</strong> and <strong>4 power pellets</strong>
          while avoiding the four ghosts. Clearing the board advances you to the next level on a
          slightly faster version of the same maze. You start with <strong>3 lives</strong> and
          earn a bonus life at <strong>10,000 points</strong>.
        </p>
        <h4>Controls</h4>
        <table>
          <tr><td><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> / <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></td><td>Change direction</td></tr>
          <tr><td><kbd>P</kbd> / <kbd>Space</kbd></td><td>Pause / resume</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Pause; press again to quit to the arcade home</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Start, or restart from game over</td></tr>
          <tr><td><kbd>H</kbd> / <kbd>?</kbd></td><td>This dialog</td></tr>
        </table>
        <p>
          Direction inputs are buffered — press a turn while between intersections and Pac-Man
          will take it at the next legal opportunity.
        </p>
        <h4>Scoring</h4>
        <table>
          <tr><td>Pellet</td><td>10</td></tr>
          <tr><td>Power pellet</td><td>50</td></tr>
          <tr><td>Ghost (chain)</td><td>200 → 400 → 800 → 1600</td></tr>
          <tr><td>Fruit (level 1)</td><td>100 (cherry), up to 5000 at later levels</td></tr>
        </table>
        <h4>The ghosts</h4>
        <p>
          <strong>Blinky</strong> (red) chases you directly.
          <strong>Pinky</strong> (pink) aims 4 tiles ahead of where you're facing.
          <strong>Inky</strong> (cyan) flanks using Blinky's position.
          <strong>Clyde</strong> (orange) chases when far, retreats when close (within 8 tiles).
        </p>
        <p>
          Eat a power pellet to make them <strong>frightened</strong> — they turn blue and become
          edible for a few seconds. The chain bonus resets when frightened mode ends.
        </p>
      </app-help-dialog>
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
    h2 { margin: 0; font-size: 1.1rem; }
    h2.pixel { letter-spacing: 0.06em; color: var(--nyx-brand-hi); }
    a { color: inherit; text-decoration: none; opacity: 0.8; }
    a:hover { opacity: 1; }
    .scores {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.75rem;
      font-variant-numeric: tabular-nums;
    }
    .scores .label { color: #8a8f99; font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--nyx-pixel-font); }
    .scores .value { font-size: 1.1rem; font-weight: 600; min-width: 2ch; text-align: right; font-variant-numeric: tabular-nums; color: #ffd24a; line-height: 1; }
    .help-btn {
      background: transparent;
      color: inherit;
      border: 1px solid currentColor;
      border-radius: 999px;
      width: 1.75rem;
      height: 1.75rem;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      opacity: 0.6;
    }
    .help-btn:hover { opacity: 1; }
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
  protected readonly helpOpen = signal(false);

  private readonly router = inject(Router);

  constructor() {
    const route = inject(ActivatedRoute);
    if (route.snapshot.data['help'] === true) this.helpOpen.set(true);
  }

  @HostListener('window:keydown', ['$event'])
  protected onWindowKey(ev: KeyboardEvent): void {
    if (ev.key === 'h' || ev.key === 'H' || ev.key === '?') {
      ev.preventDefault();
      this.helpOpen.update((v) => !v);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      // Pacman uses game.state.phase, not status.
      const phase = this.game?.state.phase;
      if (phase === 'playing' || phase === 'ready') {
        this.game!.pause();
      } else {
        this.router.navigate(['/']);
      }
    }
  }

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
