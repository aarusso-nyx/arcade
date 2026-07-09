import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DEFAULT_THEME_ID, initTheme } from '../core';
import { registerServiceWorker } from './shared/service-worker';

// Boot the theme service once, at app construction. This resolves the
// persisted theme id (if any), stamps `<html>` with CSS custom properties,
// and sets the singleton so every renderer's `getCurrentTheme()` call has
// something to return. Idempotent — safe if constructor runs twice in tests.
initTheme(DEFAULT_THEME_ID);

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('NYX Arcade');
  constructor() { registerServiceWorker(); }
}
