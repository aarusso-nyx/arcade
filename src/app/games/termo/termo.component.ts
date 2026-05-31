import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-termo',
  imports: [RouterLink],
  template: `
    <section class="game">
      <a routerLink="/">&larr; Arcade</a>
      <h2>Termo</h2>
      <p>See <code>docs/termo/engineering.md</code>. Implementation pending.</p>
    </section>
  `,
  styles: `.game { padding: 2rem; font-family: system-ui, sans-serif; }`,
})
export class TermoComponent {}
