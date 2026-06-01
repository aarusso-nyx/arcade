import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { registerServiceWorker } from './shared/service-worker';

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
