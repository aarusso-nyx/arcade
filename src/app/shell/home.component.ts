import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { tryNavigate } from '../shared/arcade-shortcuts';
import { PacmanPreviewComponent } from './previews/pacman-preview';
import { TetrisPreviewComponent } from './previews/tetris-preview';
import { SnakePreviewComponent } from './previews/snake-preview';
import { TermoPreviewComponent } from './previews/termo-preview';

interface GameEntry {
  readonly slug: 'pacman' | 'tetris' | 'snake' | 'termo';
  readonly name: string;
  readonly tagline: string;
}

const GAMES: readonly GameEntry[] = [
  { slug: 'pacman', name: 'Pac-Man', tagline: 'Eat the pellets; outwit the ghosts.' },
  { slug: 'tetris', name: 'Tetris', tagline: 'Stack tetrominoes; clear lines as they fall.' },
  { slug: 'snake', name: 'Snake', tagline: 'Grow longer with each apple; do not bite your tail.' },
  { slug: 'termo', name: 'Termo', tagline: 'Guess the five-letter word in six tries.' },
];

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    PacmanPreviewComponent,
    TetrisPreviewComponent,
    SnakePreviewComponent,
    TermoPreviewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="home">
      <header class="hero">
        <img src="nyx-logo.png" alt="NYX" class="logo" width="96" height="96">
        <div>
          <h1 class="pixel">NYX Arcade</h1>
          <p class="tagline">
            Four classic games as a worked example of AI-agentic coding.
          </p>
        </div>
      </header>
      <ul>
        @for (game of games; track game.slug; let i = $index) {
          <li>
            <a class="card" [routerLink]="['/', game.slug]" [attr.aria-label]="game.name">
              <span class="preview">
                @switch (game.slug) {
                  @case ('pacman') { <app-pacman-preview /> }
                  @case ('tetris') { <app-tetris-preview /> }
                  @case ('snake')  { <app-snake-preview /> }
                  @case ('termo')  { <app-termo-preview /> }
                }
              </span>
              <span class="body">
                <span class="title pixel">{{ game.name }}</span>
                <span class="sub">{{ game.tagline }}</span>
              </span>
              <span class="digit" aria-hidden="true">{{ i + 1 }}</span>
            </a>
            <a
              class="help"
              [routerLink]="['/', game.slug, 'help']"
              [attr.aria-label]="game.name + ' instructions'"
              title="Instructions (also: H or ? in-game)"
            >?</a>
          </li>
        }
      </ul>

      <section class="guide">
        <h2>Quick reference</h2>
        <table>
          <tr><td><kbd>0</kbd> – <kbd>4</kbd></td><td>Jump between home, Pac-Man, Tetris, Snake, Termo from any screen</td></tr>
          <tr><td><kbd>H</kbd> / <kbd>?</kbd></td><td>In-game instructions dialog</td></tr>
          <tr><td><kbd>C</kbd></td><td>Credits dialog (in Tetris/Termo use Shift+C since C is used in-game)</td></tr>
          <tr><td><kbd>\\</kbd></td><td>Toggle arcade mode (fullscreen board, hides chrome)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Pause if playing; press again to quit to the arcade home</td></tr>
          <tr><td><kbd>Space</kbd></td><td>Pause / resume (Snake, Pac-Man — Tetris uses Space for hard drop)</td></tr>
        </table>
      </section>
    </main>
  `,
  styles: `
    .home {
      padding: 3rem 2rem 4rem;
      font-family: system-ui, sans-serif;
      color: var(--nyx-fg);
      max-width: 560px;
      margin: 0 auto;
    }
    .hero {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .logo {
      flex: 0 0 auto;
      border-radius: 0.75rem;
      box-shadow: 0 0 0 1px var(--nyx-border);
    }
    h1 {
      margin: 0 0 0.4rem;
      font-size: 1.6rem;
      color: var(--nyx-brand-hi);
      letter-spacing: 0.08em;
    }
    .tagline {
      margin: 0;
      color: var(--nyx-fg-dim);
      font-size: 0.88rem;
      line-height: 1.4;
    }
    ul { list-style: none; padding: 0; display: grid; gap: 0.6rem; margin: 0 0 2rem; }
    li { display: flex; gap: 0.5rem; align-items: stretch; }

    a {
      color: inherit;
      text-decoration: none;
      border: 1px solid var(--nyx-border);
      border-radius: 0.5rem;
      transition: background 120ms, border-color 120ms, color 120ms;
    }

    .card {
      flex: 1;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 0.9rem;
      padding: 0.65rem 0.85rem;
    }
    .preview {
      flex: 0 0 auto;
      width: 4.5rem;
      height: 4.5rem;
      display: block;
      background: var(--nyx-bg);
      border: 1px solid var(--nyx-border);
      border-radius: 0.35rem;
      overflow: hidden;
    }
    .preview app-pacman-preview,
    .preview app-tetris-preview,
    .preview app-snake-preview,
    .preview app-termo-preview {
      display: block;
      width: 100%;
      height: 100%;
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      min-width: 0;
    }
    .title {
      font-size: 0.9rem;
      letter-spacing: 0.06em;
      color: var(--nyx-fg);
    }
    .sub {
      font-size: 0.78rem;
      color: var(--nyx-fg-dim);
      line-height: 1.35;
    }
    .digit {
      flex: 0 0 auto;
      font-family: var(--nyx-pixel-font);
      font-size: 0.75rem;
      color: var(--nyx-brand);
      opacity: 0.75;
      padding: 0 0.25rem;
    }
    .help {
      flex: 0 0 auto;
      width: 2.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      opacity: 0.6;
    }
    a:hover {
      background: rgba(31, 122, 168, 0.08);
      border-color: var(--nyx-brand);
      color: var(--nyx-brand-hi);
      opacity: 1;
    }
    .card:hover .title { color: var(--nyx-brand-hi); }

    .guide { color: var(--nyx-fg-dim); font-size: 0.85rem; }
    .guide h2 {
      font-family: var(--nyx-pixel-font);
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--nyx-brand);
      margin: 0 0 0.6rem;
    }
    .guide table { width: 100%; border-collapse: collapse; }
    .guide td { padding: 0.35rem 0.5rem; vertical-align: top; }
    .guide td:first-child { width: 8rem; }
    .guide tr + tr td { border-top: 1px solid var(--nyx-border); }
    .guide kbd {
      display: inline-block;
      padding: 0.05em 0.4em;
      background: #2a2f38;
      border-radius: 0.25rem;
      font-family: var(--nyx-pixel-font);
      font-size: 0.7em;
      border: 1px solid #3a3f4b;
      color: var(--nyx-fg);
    }
    :host { display: block; min-height: 100vh; background: var(--nyx-bg); }
  `,
})
export class HomeComponent {
  protected readonly games = GAMES;
  private readonly router = inject(Router);

  @HostListener('window:keydown', ['$event'])
  protected onKey(ev: KeyboardEvent): void {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (tryNavigate(this.router, ev.code)) ev.preventDefault();
  }
}
