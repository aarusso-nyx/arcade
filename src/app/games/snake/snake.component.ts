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
import { createSnakeGame, type SnakeGame } from './game';

@Component({
  selector: 'app-snake',
  imports: [RouterLink, HelpDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.arcade]': 'arcadeMode()' },
  template: `
    <section class="page">
      <header>
        <a routerLink="/">&larr; Arcade</a>
        <h2 class="pixel">Snake</h2>
        <div class="scores">
          <span class="label">Score</span><span class="value">{{ score() }}</span>
          <span class="label">Best</span><span class="value">{{ highScore() }}</span>
          <span class="label">Length</span><span class="value">{{ length() }}</span>
          <button type="button" class="icon-btn" (click)="creditsOpen.set(true)" aria-label="Credits" title="Credits (C)">©</button>
          <button type="button" class="icon-btn" (click)="helpOpen.set(true)" aria-label="Help" title="Help (H or ?)">?</button>
        </div>
      </header>
      <div #host class="host"></div>
      <p class="hint">
        Arrows / WASD turn &middot; Space pause &middot; Enter start &middot;
        T wrap mode &middot; [ ] queue depth &middot; M mute &middot; H help &middot; C credits &middot;
        \\ fullscreen &middot; 0–5 navigate
      </p>
      <app-help-dialog [(open)]="helpOpen" title="Snake">
        <h4>Goal</h4>
        <p>
          Eat the red apples to grow your snake. Each apple is worth <strong>10 points</strong>.
          Bonus food (yellow, pulsing) lasts a few seconds and is worth <strong>50 points</strong>.
          You get <strong>+25</strong> every time your length crosses a multiple of 10.
        </p>
        <h4>Snake controls</h4>
        <table>
          <tr><td><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> / <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></td><td>Turn</td></tr>
          <tr><td><kbd>Space</kbd></td><td>Pause / resume</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Start a new run</td></tr>
          <tr><td><kbd>T</kbd></td><td>Toggle classic ↔ wrap mode (resets the run)</td></tr>
          <tr><td><kbd>[</kbd> <kbd>]</kbd></td><td>Decrease / increase input queue depth (1–3)</td></tr>
        </table>
        <h4>Arcade-wide</h4>
        <table>
          <tr><td><kbd>0</kbd> – <kbd>5</kbd></td><td>Home, Pac-Man, Tetris, Snake, Termo, Bricks</td></tr>
          <tr><td><kbd>\\</kbd></td><td>Toggle arcade mode (fullscreen board)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Pause; press again to quit to home</td></tr>
          <tr><td><kbd>M</kbd></td><td>Mute / unmute sound effects</td></tr>
          <tr><td><kbd>H</kbd> / <kbd>?</kbd></td><td>This dialog</td></tr>
          <tr><td><kbd>C</kbd></td><td>Credits</td></tr>
        </table>
        <h4>Modes</h4>
        <p>
          <strong>Classic</strong> — hitting a wall ends the run.<br>
          <strong>Wrap</strong> — the snake teleports through the wall to the opposite side.
        </p>
      </app-help-dialog>
      <app-help-dialog [(open)]="creditsOpen" title="Credits — Snake">
        <p>
          <a href="https://en.wikipedia.org/wiki/Snake_(video_game_genre)" target="_blank" rel="noopener">Snake</a>'s
          lineage goes back to
          <a href="https://en.wikipedia.org/wiki/Blockade_(video_game)" target="_blank" rel="noopener">Blockade</a>
          (<a href="https://en.wikipedia.org/wiki/Gremlin_Industries" target="_blank" rel="noopener">Gremlin Industries</a>,
          1976), and reached mass culture via the
          <a href="https://en.wikipedia.org/wiki/Nokia_6110" target="_blank" rel="noopener">Nokia 6110</a>
          phone (1997).
        </p>
        <p>
          This implementation follows the canonical Nokia behaviour — the head moving into
          the tile the tail just vacated is a death — plus modern niceties: bonus food,
          length-cross bonuses, per-mode high scores, smooth tile-to-tile interpolation.
        </p>
        <p>
          Built by
          <a href="mailto:aarusso@nyxk.com.br" target="_blank" rel="noopener">Antonio Augusto Russo</a>
          at NYX Knowledge as a worked example of AI-agentic coding.
          See <code>docs/snake/engineering.md</code> or the
          <a href="https://github.com/aarusso-nyx/arcade" target="_blank" rel="noopener">GitHub repository</a>.
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
      align-items: center;
      gap: 0.4rem 0.6rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .scores .label { color: var(--nyx-fg-dim); font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--nyx-pixel-font); }
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
      aspect-ratio: 1 / 1;
      max-width: min(80vmin, 720px);
      background: #0b0d10;
      border: 2px solid var(--nyx-brand);
      border-radius: 0.5rem;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 0 1px var(--nyx-brand-deep);
    }
    .hint { color: var(--nyx-fg-dim); font-size: 0.78rem; margin: 0; text-align: center; line-height: 1.5; }
    :host { display: block; min-height: 100vh; background: var(--nyx-bg); }

    /* Arcade / fullscreen mode: take over the viewport, hide chrome. */
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
      max-width: min(100vw, 100vh);
      max-height: 100vh;
    }
  `,
})
export class SnakeComponent implements AfterViewInit, OnDestroy {
  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private game: SnakeGame | null = null;
  private unsubscribe: (() => void) | null = null;

  protected readonly score = signal(0);
  protected readonly highScore = signal(0);
  protected readonly length = signal(0);
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
      // Snake has no toast surface yet; the next sound (or lack thereof) is
      // the confirmation. Console log keeps the action discoverable for devs.
      console.info(`Audio ${muted ? 'muted' : 'unmuted'}`);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (this.arcadeMode()) {
        this.arcadeMode.set(false);
        return;
      }
      if (this.game && this.game.state.status === 'playing') {
        this.game.pause();
      } else {
        this.router.navigate(['/']);
      }
      return;
    }
    // Global nav 0/1/2/3/4 — Snake's queue-depth toggle now lives on [ and ],
    // freeing the digit row.
    if (tryNavigate(this.router, ev.code)) {
      ev.preventDefault();
    }
  }

  ngAfterViewInit(): void {
    this.game = createSnakeGame(this.hostRef().nativeElement);
    this.unsubscribe = this.game.onScoreChange((s, hs) => {
      this.score.set(s);
      this.highScore.set(hs);
      this.length.set(this.game?.state.body.length ?? 0);
    });
    this.game.start();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.game?.destroy();
  }
}
