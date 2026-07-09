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
import { createBricksGame, type BricksGame, type BricksSnapshot } from './game';

@Component({
  selector: 'app-bricks',
  imports: [RouterLink, HelpDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.arcade]': 'arcadeMode()' },
  template: `
    <section class="page">
      <header>
        <a routerLink="/">&larr; Arcade</a>
        <h2 class="pixel">Bricks</h2>
        <div class="scores">
          <div class="stat"><span class="label">Score</span><span class="value">{{ score() }}</span></div>
          <div class="stat"><span class="label">High</span><span class="value">{{ highScore() }}</span></div>
          <div class="stat"><span class="label">Lives</span><span class="value">{{ lives() }}</span></div>
          <div class="stat"><span class="label">Level</span><span class="value">{{ level() }}</span></div>
          <button type="button" class="icon-btn" (click)="creditsOpen.set(true)" aria-label="Credits" title="Credits (C)">©</button>
          <button type="button" class="icon-btn" (click)="helpOpen.set(true)" aria-label="Help" title="Help (H or ?)">?</button>
        </div>
      </header>
      <div #host class="host"></div>
      <p class="hint">
        Arrows or A/D move &middot; Space launch/pause &middot; P pause &middot; Enter retry
        &middot; Esc pause/quit &middot; M mute &middot; H help &middot; C credits &middot; \\ fullscreen
        &middot; 0-5 navigate
      </p>
      <app-help-dialog [(open)]="helpOpen" title="Bricks">
        <h4>Goal</h4>
        <p>
          Clear every brick with the bouncing ball. Keep the ball above the bottom edge by
          steering the paddle, then survive faster racks for the highest score.
        </p>
        <h4>Controls</h4>
        <table>
          <tr><td><kbd>&larr;</kbd> <kbd>&rarr;</kbd></td><td>Move paddle</td></tr>
          <tr><td><kbd>A</kbd> <kbd>D</kbd></td><td>Move paddle</td></tr>
          <tr><td><kbd>Space</kbd></td><td>Launch ball; pause / resume while moving</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Start / retry after game over</td></tr>
          <tr><td><kbd>P</kbd></td><td>Pause / resume</td></tr>
        </table>
        <h4>Scoring</h4>
        <p>
          Higher rows are worth more points. Consecutive brick hits build a small combo bonus
          until the ball touches the paddle or a life is lost.
        </p>
        <h4>Arcade-wide</h4>
        <table>
          <tr><td><kbd>0</kbd>-<kbd>5</kbd></td><td>Home, Pac-Man, Tetris, Snake, Termo, Bricks</td></tr>
          <tr><td><kbd>\\</kbd></td><td>Toggle arcade mode</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Pause; press again to quit to home</td></tr>
          <tr><td><kbd>M</kbd></td><td>Mute / unmute sound effects</td></tr>
          <tr><td><kbd>H</kbd> / <kbd>?</kbd></td><td>This dialog</td></tr>
          <tr><td><kbd>C</kbd></td><td>Credits</td></tr>
        </table>
      </app-help-dialog>
      <app-help-dialog [(open)]="creditsOpen" title="Credits — Bricks">
        <p>
          Bricks is a brick-breaking game inspired by arcade classics such as
          <a href="https://en.wikipedia.org/wiki/Breakout_(video_game)" target="_blank" rel="noopener">Breakout</a>.
        </p>
        <p>
          Built by
          <a href="mailto:aarusso@nyxk.com.br" target="_blank" rel="noopener">Antonio Augusto Russo</a>
          at NYX Knowledge as a worked example of AI-agentic coding.
          See <code>docs/bricks/engineering.md</code> or the
          <a href="https://github.com/aarusso-nyx/arcade" target="_blank" rel="noopener">GitHub repository</a>.
        </p>
      </app-help-dialog>
    </section>
  `,
  styles: `
    .page {
      max-width: 760px;
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
      gap: 1rem;
      font-variant-numeric: tabular-nums;
      align-items: center;
    }
    .stat { display: flex; flex-direction: column; align-items: flex-end; }
    .scores .label {
      color: var(--nyx-fg-dim);
      font-size: 0.55rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-family: var(--nyx-pixel-font);
    }
    .scores .value {
      font-size: 1.1rem;
      font-weight: 600;
      min-width: 3ch;
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--nyx-accent);
      line-height: 1;
      margin-top: 0.25rem;
    }
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
      margin-left: 0.25rem;
      transition: border-color 120ms, color 120ms, opacity 120ms;
    }
    .icon-btn:hover { opacity: 1; border-color: var(--nyx-brand); color: var(--nyx-brand-hi); }
    .host {
      width: 100%;
      min-height: calc(100vh - 220px);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .host > div { border: 2px solid var(--nyx-brand); border-radius: 0.4rem; overflow: hidden; }
    .hint {
      color: var(--nyx-fg-dim);
      font-size: 0.78rem;
      margin: 0;
      text-align: center;
      line-height: 1.5;
    }
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
    :host.arcade .host { min-height: 100vh; }
  `,
})
export class BricksComponent implements AfterViewInit, OnDestroy {
  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private game: BricksGame | null = null;
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
    if (ev.key === 'm' || ev.key === 'M') {
      ev.preventDefault();
      const muted = this.game?.toggleMute() ?? false;
      console.info(`Audio ${muted ? 'muted' : 'unmuted'}`);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (this.arcadeMode()) {
        this.arcadeMode.set(false);
        return;
      }
      if (this.game?.state.status === 'playing' || this.game?.state.status === 'ready') {
        this.game.pause();
      } else {
        this.router.navigate(['/']);
      }
      return;
    }
    if (tryNavigate(this.router, ev.code)) ev.preventDefault();
  }

  ngAfterViewInit(): void {
    this.game = createBricksGame(this.hostRef().nativeElement);
    this.unsubscribe = this.game.onChange((snap: BricksSnapshot) => {
      this.score.set(snap.score);
      this.highScore.set(snap.highScore);
      this.lives.set(snap.lives);
      this.level.set(snap.level);
    });
    this.game.start();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.game?.destroy();
  }
}
