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
import { tryNavigate } from '../../shared/arcade-shortcuts';
import { createPacmanGame, type PacmanGame } from './game';

@Component({
  selector: 'app-pacman',
  imports: [RouterLink, HelpDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.arcade]': 'arcadeMode()' },
  template: `
    <section class="page">
      <header>
        <a routerLink="/">&larr; Arcade</a>
        <h2 class="pixel">Pac-Man</h2>
        <div class="scores">
          <span class="label">Score</span><span class="value">{{ score() }}</span>
          <span class="label">High</span><span class="value">{{ highScore() }}</span>
          <span class="label">Lives</span><span class="value">{{ lives() }}</span>
          <span class="label">Level</span><span class="value">{{ level() }}</span>
          <button type="button" class="icon-btn" (click)="creditsOpen.set(true)" aria-label="Credits" title="Credits (C)">©</button>
          <button type="button" class="icon-btn" (click)="helpOpen.set(true)" aria-label="Help" title="Help (H or ?)">?</button>
        </div>
      </header>
      <div #host class="host"></div>
      <p class="hint">
        Arrows / WASD turn &middot; P / Space pause &middot; Enter restart &middot;
        Esc pause/quit &middot; H help &middot; C credits &middot;
        \\ fullscreen &middot; 0–4 navigate
      </p>
      <app-help-dialog [(open)]="helpOpen" title="Pac-Man">
        <h4>Goal</h4>
        <p>
          Clear the maze of all <strong>240 pellets</strong> and <strong>4 power pellets</strong>
          while avoiding the four ghosts. Clearing the board advances you to the next level on a
          slightly faster version of the same maze. You start with <strong>3 lives</strong> and
          earn a bonus life at <strong>10,000 points</strong>.
        </p>
        <h4>Pac-Man controls</h4>
        <table>
          <tr><td><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> / <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></td><td>Change direction</td></tr>
          <tr><td><kbd>P</kbd> / <kbd>Space</kbd></td><td>Pause / resume</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Start, or restart from game over</td></tr>
        </table>
        <h4>Arcade-wide</h4>
        <table>
          <tr><td><kbd>0</kbd> – <kbd>4</kbd></td><td>Home, Pac-Man, Tetris, Snake, Termo</td></tr>
          <tr><td><kbd>\\</kbd></td><td>Toggle arcade mode (fullscreen board)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Pause; press again to quit to home</td></tr>
          <tr><td><kbd>H</kbd> / <kbd>?</kbd></td><td>This dialog</td></tr>
          <tr><td><kbd>C</kbd></td><td>Credits</td></tr>
        </table>
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
          Power pellets make them <strong>frightened</strong> — blue and edible.
        </p>
      </app-help-dialog>
      <app-help-dialog [(open)]="creditsOpen" title="Credits — Pac-Man">
        <p>
          <a href="https://en.wikipedia.org/wiki/Pac-Man" target="_blank" rel="noopener">Pac-Man</a>
          was created by
          <a href="https://en.wikipedia.org/wiki/Toru_Iwatani" target="_blank" rel="noopener">Tōru Iwatani</a>
          at <a href="https://en.wikipedia.org/wiki/Namco" target="_blank" rel="noopener">Namco</a> in 1980.
        </p>
        <p>
          This implementation follows the canonical arcade behaviour as documented in
          Jamey Pittman's <a href="https://pacman.holenet.info/" target="_blank" rel="noopener">Pac-Man Dossier</a>:
          31×28 maze, per-level speed table with Elroy thresholds, scatter / chase phase
          schedule, two-tier ghost-house release (personal + global counter + idle timer),
          and the four ghost AIs at their full fidelity — including Pinky's famous
          up-direction overflow bug and Inky's flank-via-Blinky formula.
        </p>
        <p>
          Built by
          <a href="mailto:aarusso@nyxk.com.br" target="_blank" rel="noopener">Antonio Augusto Russo</a>
          at NYX Knowledge as a worked example of AI-agentic coding.
          See <code>docs/pacman/engineering.md</code> or the
          <a href="https://github.com/aarusso-nyx/arcade" target="_blank" rel="noopener">GitHub repository</a>.
        </p>
      </app-help-dialog>
    </section>
  `,
  styles: `
    .page {
      max-width: 820px;
      margin: 0 auto;
      padding: 1.5rem;
      font-family: system-ui, sans-serif;
      color: var(--nyx-fg);
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
    a:hover { opacity: 1; color: var(--nyx-brand-hi); }
    .scores {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem 0.6rem;
      justify-content: flex-end;
      font-variant-numeric: tabular-nums;
    }
    .scores .label { color: var(--nyx-fg-dim); font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--nyx-pixel-font); }
    .scores .value { font-size: 1.1rem; font-weight: 600; min-width: 2ch; text-align: right; font-variant-numeric: tabular-nums; color: var(--nyx-accent); line-height: 1; }
    .icon-btn {
      background: transparent;
      color: inherit;
      border: 1px solid var(--nyx-border);
      border-radius: 999px;
      width: 1.75rem;
      height: 1.75rem;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      opacity: 0.65;
      transition: border-color 120ms, color 120ms, opacity 120ms;
    }
    .icon-btn:hover { opacity: 1; border-color: var(--nyx-brand); color: var(--nyx-brand-hi); }
    .host {
      width: 100%;
      aspect-ratio: 224 / 288;
      /* Grow to fill viewport while respecting aspect ratio. */
      max-width: min(80vmin * 224 / 288, calc(100vh - 200px) * 224 / 288, 1200px);
      max-height: calc(100vh - 200px);
      background: #000;
      border: 2px solid var(--nyx-brand);
      border-radius: 0.5rem;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
      box-shadow: 0 0 0 1px var(--nyx-brand-deep);
    }
    .hint { color: var(--nyx-fg-dim); font-size: 0.78rem; margin: 0; text-align: center; line-height: 1.5; }
    :host { display: block; min-height: 100vh; background: var(--nyx-bg); }

    :host.arcade {
      position: fixed;
      inset: 0;
      z-index: 9999;
    }
    :host.arcade .page {
      max-width: none;
      padding: 0;
      gap: 0;
      height: 100vh;
      width: 100vw;
      justify-content: center;
    }
    :host.arcade header,
    :host.arcade .hint { display: none; }
    :host.arcade .host {
      max-width: min(100vw, 100vh * 224 / 288);
      max-height: 100vh;
    }
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
  protected readonly creditsOpen = signal(false);
  protected readonly arcadeMode = signal(false);

  private readonly router = inject(Router);

  constructor() {
    const route = inject(ActivatedRoute);
    if (route.snapshot.data['help'] === true) this.helpOpen.set(true);
  }

  @HostListener('window:keydown', ['$event'])
  protected onWindowKey(ev: KeyboardEvent): void {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'h' || ev.key === 'H' || ev.key === '?') {
      ev.preventDefault();
      this.helpOpen.update((v) => !v);
      return;
    }
    if (ev.key === 'c' || ev.key === 'C') {
      ev.preventDefault();
      this.creditsOpen.update((v) => !v);
      return;
    }
    if (ev.key === '\\') {
      ev.preventDefault();
      this.arcadeMode.update((v) => !v);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (this.arcadeMode()) {
        this.arcadeMode.set(false);
        return;
      }
      const phase = this.game?.state.phase;
      if (phase === 'playing' || phase === 'ready') {
        this.game!.pause();
      } else {
        this.router.navigate(['/']);
      }
      return;
    }
    if (tryNavigate(this.router, ev.code)) {
      ev.preventDefault();
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
