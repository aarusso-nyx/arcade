import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'pacman',
    loadComponent: () =>
      import('./games/pacman/pacman.component').then((m) => m.PacmanComponent),
  },
  {
    path: 'tetris',
    loadComponent: () =>
      import('./games/tetris/tetris.component').then((m) => m.TetrisComponent),
  },
  {
    path: 'snake',
    loadComponent: () => import('./games/snake/snake.component').then((m) => m.SnakeComponent),
  },
  {
    path: 'termo',
    loadComponent: () => import('./games/termo/termo.component').then((m) => m.TermoComponent),
  },
  { path: '**', redirectTo: '' },
];
