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
      <h1>Arcade</h1>
      <ul>
        @for (game of games; track game.slug) {
          <li>
            <a class="play" [routerLink]="['/', game.slug]">{{ game.name }}</a>
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
    .home { padding: 2rem; font-family: system-ui, sans-serif; color: #e6e6e6; }
    h1 { margin: 0 0 1rem; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.5rem; max-width: 400px; }
    li { display: flex; gap: 0.5rem; }
    a {
      color: inherit;
      text-decoration: none;
      padding: 0.75rem 1rem;
      border: 1px solid currentColor;
      border-radius: 0.5rem;
      display: block;
    }
    .play { flex: 1; }
    .help {
      flex: 0 0 auto;
      width: 3rem;
      text-align: center;
      font-weight: 600;
      opacity: 0.6;
    }
    a:hover { background: rgba(255,255,255,0.06); opacity: 1; }
    :host { display: block; min-height: 100vh; background: #14171c; }
  `,
})
export class HomeComponent {
  protected readonly games = GAMES;
}
