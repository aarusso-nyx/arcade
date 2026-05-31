import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pacman',
  imports: [RouterLink],
  template: `
    <section class="game">
      <a routerLink="/">&larr; Arcade</a>
      <h2>Pac-Man</h2>
      <p>See <code>docs/pacman/engineering.md</code>. Implementation pending.</p>
    </section>
  `,
  styles: `.game { padding: 2rem; font-family: system-ui, sans-serif; }`,
})
export class PacmanComponent {}
