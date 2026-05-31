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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HelpDialogComponent } from '../../shared/help-dialog/help-dialog.component';
import { createTetrisGame, type TetrisGame, type TetrisSnapshot } from './game';

@Component({
  selector: 'app-tetris',
  imports: [RouterLink, HelpDialogComponent],
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
      <p class="hint">
        Arrows to move &middot; Z/X or Up to rotate &middot; A for 180 &middot; Space hard drop
        &middot; Down soft drop &middot; C/Shift hold &middot; Esc/P pause &middot; Enter start/retry
        &middot; <kbd>H</kbd> for help
      </p>
      <app-help-dialog [(open)]="helpOpen" title="Tetris">
        <h4>Goal</h4>
        <p>
          Survive as long as you can while clearing rows. Pieces fall from the top of a 10-wide
          well; complete a horizontal row to clear it and earn points. The game ends when a new
          piece can't spawn.
        </p>
        <h4>Controls</h4>
        <table>
          <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Move (held = DAS + ARR)</td></tr>
          <tr><td><kbd>↓</kbd></td><td>Soft drop (1&nbsp;pt per cell)</td></tr>
          <tr><td><kbd>Space</kbd></td><td>Hard drop (2&nbsp;pt per cell)</td></tr>
          <tr><td><kbd>↑</kbd> / <kbd>X</kbd></td><td>Rotate clockwise</td></tr>
          <tr><td><kbd>Z</kbd></td><td>Rotate counter-clockwise</td></tr>
          <tr><td><kbd>A</kbd></td><td>180° flip</td></tr>
          <tr><td><kbd>C</kbd> / <kbd>Shift</kbd></td><td>Hold (one swap per piece)</td></tr>
          <tr><td><kbd>Esc</kbd> / <kbd>P</kbd></td><td>Pause / resume</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Start / retry after game over</td></tr>
          <tr><td><kbd>H</kbd> / <kbd>?</kbd></td><td>This dialog</td></tr>
        </table>
        <h4>Scoring</h4>
        <table>
          <tr><th>Clear</th><th>Base points (× level)</th></tr>
          <tr><td>Single</td><td>100</td></tr>
          <tr><td>Double</td><td>300</td></tr>
          <tr><td>Triple</td><td>500</td></tr>
          <tr><td>Tetris (4)</td><td>800</td></tr>
          <tr><td>T-spin Single</td><td>800</td></tr>
          <tr><td>T-spin Double</td><td>1200</td></tr>
          <tr><td>T-spin Triple</td><td>1600</td></tr>
        </table>
        <p>
          Back-to-back difficult clears (Tetris or T-spin) get a <strong>1.5×</strong> multiplier.
          Each consecutive line-clear chain adds a combo bonus.
        </p>
        <h4>Rules</h4>
        <p>
          Guideline-compliant: <strong>SRS</strong> rotation with wall-kicks (T-spin recognition via
          the 3-corner rule), <strong>7-bag</strong> randomizer (every piece appears once per 7),
          <strong>500&thinsp;ms lock delay</strong> capped at 15 move-resets, ghost piece, and a
          5-piece next queue. Levels advance every 10 lines; gravity follows the Tetris Worlds
          curve.
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
    h2 { margin: 0; }
    a { color: inherit; text-decoration: none; opacity: 0.8; }
    a:hover { opacity: 1; }
    .scores {
      display: flex;
      gap: 1rem;
      font-variant-numeric: tabular-nums;
      align-items: center;
    }
    .stat { display: flex; flex-direction: column; align-items: flex-end; }
    .scores .label { color: #8a8f99; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .scores .value { font-size: 1.1rem; font-weight: 600; min-width: 3ch; text-align: right; }
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
      margin-left: 0.25rem;
    }
    .help-btn:hover { opacity: 1; }
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
    .hint kbd { background: #2a2f38; border-radius: 0.2rem; padding: 0 0.3em; border: 1px solid #3a3f4b; font-family: inherit; }
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
  protected readonly helpOpen = signal(false);

  constructor() {
    const route = inject(ActivatedRoute);
    if (route.snapshot.data['help'] === true) this.helpOpen.set(true);
  }

  @HostListener('window:keydown', ['$event'])
  protected onWindowKey(ev: KeyboardEvent): void {
    if (ev.key === 'h' || ev.key === 'H' || ev.key === '?') {
      ev.preventDefault();
      this.helpOpen.update((v) => !v);
    }
  }

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
