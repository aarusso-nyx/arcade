import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

const GAMES = [
  { slug: 'pacman', name: 'Pac-Man' },
  { slug: 'tetris', name: 'Tetris' },
  { slug: 'snake', name: 'Snake' },
  { slug: 'termo', name: 'Termo' },
] as const;

@Component({
  selector: 'app-home',
  imports: [RouterLink],
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
        @for (game of games; track game.slug) {
          <li>
            <a class="play pixel" [routerLink]="['/', game.slug]">{{ game.name }}</a>
            <a
              class="help"
              [routerLink]="['/', game.slug, 'help']"
              [attr.aria-label]="game.name + ' instructions'"
              title="Instructions (also: H or ? in-game)"
            >?</a>
          </li>
        }
      </ul>
    </main>
  `,
  styles: `
    .home {
      padding: 3rem 2rem 4rem;
      font-family: system-ui, sans-serif;
      color: var(--nyx-fg);
      max-width: 480px;
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
    ul { list-style: none; padding: 0; display: grid; gap: 0.6rem; }
    li { display: flex; gap: 0.5rem; }
    a {
      color: inherit;
      text-decoration: none;
      padding: 0.9rem 1rem;
      border: 1px solid var(--nyx-border);
      border-radius: 0.5rem;
      display: block;
      transition: background 120ms, border-color 120ms, color 120ms;
    }
    .play {
      flex: 1;
      font-size: 0.95rem;
      letter-spacing: 0.06em;
    }
    .help {
      flex: 0 0 auto;
      width: 3rem;
      text-align: center;
      font-weight: 600;
      opacity: 0.6;
    }
    a:hover {
      background: rgba(31, 122, 168, 0.08);
      border-color: var(--nyx-brand);
      color: var(--nyx-brand-hi);
      opacity: 1;
    }
    :host { display: block; min-height: 100vh; background: var(--nyx-bg); }
  `,
})
export class HomeComponent {
  protected readonly games = GAMES;
}
