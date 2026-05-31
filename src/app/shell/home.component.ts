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
          <li><a [routerLink]="['/', game.slug]">{{ game.name }}</a></li>
        }
      </ul>
    </main>
  `,
  styles: `
    .home { padding: 2rem; font-family: system-ui, sans-serif; }
    h1 { margin: 0 0 1rem; }
    ul { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
    a { color: inherit; text-decoration: none; padding: 0.75rem 1rem; border: 1px solid currentColor; border-radius: 0.5rem; display: block; }
    a:hover { background: rgba(0,0,0,0.05); }
  `,
})
export class HomeComponent {
  protected readonly games = GAMES;
}
