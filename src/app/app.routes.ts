import { Routes } from '@angular/router';

const pacman = () => import('./games/pacman/pacman.component').then((m) => m.PacmanComponent);
const tetris = () => import('./games/tetris/tetris.component').then((m) => m.TetrisComponent);
const snake = () => import('./games/snake/snake.component').then((m) => m.SnakeComponent);
const termo = () => import('./games/termo/termo.component').then((m) => m.TermoComponent);

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
  { path: '**', redirectTo: '' },
];
