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
import { createTetrisGame, type TetrisGame, type TetrisSnapshot } from './game';

@Component({
  selector: 'app-tetris',
  imports: [RouterLink, HelpDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.arcade]': 'arcadeMode()' },
  template: `
    <section class="page">
      <header>
        <a routerLink="/">&larr; Arcade</a>
        <h2 class="pixel">Tetris</h2>
        <div class="scores">
          <div class="stat"><span class="label">Score</span><span class="value">{{ score() }}</span></div>
          <div class="stat"><span class="label">High</span><span class="value">{{ highScore() }}</span></div>
          <div class="stat"><span class="label">Lines</span><span class="value">{{ lines() }}</span></div>
          <div class="stat"><span class="label">Level</span><span class="value">{{ level() }}</span></div>
          @if (!ghostEnabled()) {
            <div class="stat ghost-off"><span class="label">Ghost</span><span class="value">OFF</span></div>
          }
          <button type="button" class="icon-btn" (click)="creditsOpen.set(true)" aria-label="Credits" title="Credits (C)">©</button>
          <button type="button" class="icon-btn" (click)="helpOpen.set(true)" aria-label="Help" title="Help (H or ?)">?</button>
        </div>
      </header>
      <div #host class="host"></div>
      <p class="hint">
        Arrows move &middot; Z/X rotate &middot; A 180° &middot; Space hard drop &middot; Down soft drop
        &middot; Shift hold &middot; G ghost &middot; P pause &middot; Esc pause/quit &middot; M mute &middot; H help
        &middot; C credits &middot; \\ fullscreen &middot; 0–4 navigate
      </p>
      <app-help-dialog [(open)]="helpOpen" title="Tetris">
        <h4>Goal</h4>
        <p>
          Survive as long as you can while clearing rows. Pieces fall from the top of a 10-wide
          well; complete a horizontal row to clear it and earn points. The game ends when a new
          piece can't spawn.
        </p>
        <h4>Tetris controls</h4>
        <table>
          <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Move (held = DAS + ARR)</td></tr>
          <tr><td><kbd>↓</kbd></td><td>Soft drop (1&nbsp;pt per cell)</td></tr>
          <tr><td><kbd>Space</kbd></td><td>Hard drop (2&nbsp;pt per cell)</td></tr>
          <tr><td><kbd>↑</kbd> / <kbd>X</kbd></td><td>Rotate clockwise</td></tr>
          <tr><td><kbd>Z</kbd></td><td>Rotate counter-clockwise</td></tr>
          <tr><td><kbd>A</kbd></td><td>180° flip</td></tr>
          <tr><td><kbd>Shift</kbd></td><td>Hold (one swap per piece)</td></tr>
          <tr><td><kbd>G</kbd></td><td>Toggle ghost piece outline</td></tr>
          <tr><td><kbd>P</kbd></td><td>Pause / resume</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Start / retry after game over</td></tr>
        </table>
        <h4>Arcade-wide</h4>
        <table>
          <tr><td><kbd>0</kbd> – <kbd>4</kbd></td><td>Home, Pac-Man, Tetris, Snake, Termo</td></tr>
          <tr><td><kbd>\\</kbd></td><td>Toggle arcade mode (fullscreen board)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Pause; press again to quit to home</td></tr>
          <tr><td><kbd>M</kbd></td><td>Mute / unmute sound effects</td></tr>
          <tr><td><kbd>H</kbd> / <kbd>?</kbd></td><td>This dialog</td></tr>
          <tr><td><kbd>C</kbd></td><td>Credits</td></tr>
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
      </app-help-dialog>
      <app-help-dialog [(open)]="creditsOpen" title="Credits — Tetris">
        <p>
          <a href="https://en.wikipedia.org/wiki/Tetris" target="_blank" rel="noopener">Tetris</a>
          was created by
          <a href="https://en.wikipedia.org/wiki/Alexey_Pajitnov" target="_blank" rel="noopener">Alexey Pajitnov</a>
          at the
          <a href="https://en.wikipedia.org/wiki/Dorodnicyn_Computing_Centre" target="_blank" rel="noopener">Soviet Academy of Sciences</a>
          in 1984.
        </p>
        <p>
          This implementation is
          <a href="https://tetris.wiki/Tetris_Guideline" target="_blank" rel="noopener">Guideline-compliant</a>:
          <a href="https://tetris.wiki/Super_Rotation_System" target="_blank" rel="noopener">SRS</a>
          rotation with the standard wall-kick tables,
          <a href="https://tetris.wiki/Random_Generator" target="_blank" rel="noopener">7-bag</a>
          randomizer, T-spin recognition via the 3-corner rule with the kick-index-4
          exception, back-to-back 1.5× bonus, combo counter, ghost piece, hold,
          500&thinsp;ms lock delay with a 15-move-reset cap, and the Tetris Worlds gravity curve.
        </p>
        <p>
          Built by
          <a href="mailto:aarusso@nyxk.com.br" target="_blank" rel="noopener">Antonio Augusto Russo</a>
          at NYX Knowledge as a worked example of AI-agentic coding.
          See <code>docs/tetris/engineering.md</code> or the
          <a href="https://github.com/aarusso-nyx/arcade" target="_blank" rel="noopener">GitHub repository</a>.
        </p>
      </app-help-dialog>
    </section>
  `,
  styles: `
    .page {
      max-width: 880px;
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
    .stat.ghost-off .value { color: var(--nyx-brand-hi); }
    .scores .label { color: var(--nyx-fg-dim); font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--nyx-pixel-font); }
    .scores .value { font-size: 1.1rem; font-weight: 600; min-width: 3ch; text-align: right; font-variant-numeric: tabular-nums; color: var(--nyx-accent); line-height: 1; margin-top: 0.25rem; }
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
      background: transparent;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      /* Grow to use the available viewport. The actual canvases inside size
         themselves via mountCanvas + ResizeObserver. */
      flex: 1;
      min-height: calc(100vh - 220px);
    }
    /* The mountCanvas inner wrappers each get a brand border via the
       wrap children selectors. */
    .host > div > div { border: 2px solid var(--nyx-brand); border-radius: 0.4rem; overflow: hidden; }
    .hint { color: var(--nyx-fg-dim); font-size: 0.78rem; margin: 0; text-align: center; line-height: 1.5; }
    .hint kbd { background: #2a2f38; border-radius: 0.2rem; padding: 0 0.3em; border: 1px solid #3a3f4b; font-family: inherit; }
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
export class TetrisComponent implements AfterViewInit, OnDestroy {
  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private game: TetrisGame | null = null;
  private unsubscribe: (() => void) | null = null;

  protected readonly score = signal(0);
  protected readonly highScore = signal(0);
  protected readonly lines = signal(0);
  protected readonly level = signal(1);
  protected readonly ghostEnabled = signal(true);
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
    // Tetris uses 'C' for the Hold action — only trigger credits on uppercase
    // 'C' (Shift held) or if the game isn't running.
    if (ev.key === 'C' || (ev.key === 'c' && this.game?.state.status !== 'playing')) {
      ev.preventDefault();
      this.creditsOpen.update((v) => !v);
      return;
    }
    if (ev.key === '\\') {
      ev.preventDefault();
      this.arcadeMode.update((v) => !v);
      return;
    }
    // M mutes audio. Tetris doesn't reserve M (the rotation/lock keys are
    // X/Z/A/C/Shift/Arrows/Space), so a plain keydown is fine.
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
      const status = this.game?.state.status;
      if (status === 'playing' || status === 'lineclear') {
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
    this.game = createTetrisGame(this.hostRef().nativeElement);
    this.unsubscribe = this.game.onChange((snap: TetrisSnapshot) => {
      this.score.set(snap.score);
      this.highScore.set(snap.highScore);
      this.lines.set(snap.lines);
      this.level.set(snap.level);
      this.ghostEnabled.set(snap.ghostEnabled);
    });
    this.game.start();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.game?.destroy();
  }
}
