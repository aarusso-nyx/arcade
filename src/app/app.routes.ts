import { Routes } from '@angular/router';

// Route notes:
// - `?replay=<encoded>` on `/snake` and `/tetris` triggers spectator-mode
//   playback of a shared replay. The component reads the param via
//   `ActivatedRoute.snapshot.queryParamMap` — Angular exposes query params
//   on every route without extra config, so no route entry is needed here.
//   See src/core/replay/replay.ts for the codec.

const pacman = () => import('./games/pacman/pacman.component').then((m) => m.PacmanComponent);
const tetris = () => import('./games/tetris/tetris.component').then((m) => m.TetrisComponent);
const snake = () => import('./games/snake/snake.component').then((m) => m.SnakeComponent);
const termo = () => import('./games/termo/termo.component').then((m) => m.TermoComponent);
const bricks = () => import('./games/bricks/bricks.component').then((m) => m.BricksComponent);

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/home.component').then((m) => m.HomeComponent),
  },
  { path: 'pacman', loadComponent: pacman, data: { help: false } },
  { path: 'pacman/help', loadComponent: pacman, data: { help: true } },
  { path: 'tetris', loadComponent: tetris, data: { help: false } },
  { path: 'tetris/help', loadComponent: tetris, data: { help: true } },
  { path: 'snake', loadComponent: snake, data: { help: false } },
  { path: 'snake/help', loadComponent: snake, data: { help: true } },
  { path: 'termo', loadComponent: termo, data: { help: false } },
  { path: 'termo/help', loadComponent: termo, data: { help: true } },
  // /termo/archive opens the archive picker on load. The archived puzzle
  // itself is loaded via the `?day=N` query param on the /termo route.
  { path: 'termo/archive', loadComponent: termo, data: { help: false, archive: true } },
  { path: 'bricks', loadComponent: bricks, data: { help: false } },
  { path: 'bricks/help', loadComponent: bricks, data: { help: true } },
  { path: '**', redirectTo: '' },
];
