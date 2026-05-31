# Arcade

Routed SPA with four games: Pac-Man, Tetris, Snake, and Termo.

## Stack

- Angular 20 (standalone components, signals)
- `@angular/build` (Vite under the hood)
- TypeScript 5.9

## Routes

- `/` — game list
- `/pacman`, `/tetris`, `/snake`, `/termo` — individual games (lazy-loaded)

## Scripts

```bash
npm start       # dev server at http://localhost:4200
npm run build   # production build to dist/
npm test        # karma + jasmine
```

## Layout

```
src/
  app/
    shell/        # landing page + chrome
    games/        # one folder per game, lazy-loaded route
  core/           # shared game engine (loop, input, render, grid, collision)
docs/             # per-game spec: README, gameplay.md, engineering.md
```

Game implementations are framework-agnostic modules mounted by their Angular component shell. See `docs/<game>/engineering.md` before implementing.
