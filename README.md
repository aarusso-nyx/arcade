# NYX Arcade

Five classic games — Pac-Man, Tetris, Snake, Termo (a pt-BR Wordle), and Bricks —
built as a routed Angular 20 single-page app.

Play live: **<https://aarusso-nyx.github.io/arcade/>**

## What this actually is

This repo is a concrete worked example of **AI-agentic coding**: building a
non-trivial software product end-to-end with AI coding agents. The games are
real and playable, but they're a vehicle, not the point. If you're interested
in agentic coding workflows, look at:

- **`docs/<game>/engineering.md`** — the per-game engineering specifications
  that the agents implemented from. Pac-Man is ~1000 lines, Tetris ~1400.
  These were authored by parallel agents from a brief, then handed to other
  parallel agents to implement.
- **The Git history** — each commit message describes what changed and why,
  and the implementation work is segmented into commits that map to discrete
  agent invocations or audit-driven refactors.
- **`ROADMAP.md`** — what would come next.

## Stack

- Angular 20 (standalone components, signals)
- `@angular/build` (Vite under the hood) + TypeScript 5.9
- Canvas 2D for the three real-time games, DOM for Termo
- Deployed via GitHub Actions to GitHub Pages

## Scripts

```bash
npm start       # dev server at http://localhost:4200
npm run build   # production build to dist/nyx-arcade/browser
npm test        # karma + jasmine
```

## Layout

```
src/
  app/
    shell/           # landing page + chrome
    games/           # one folder per game, lazy-loaded route
    shared/          # reusable UI (help dialog, ...)
  core/              # shared game engine (loop, input, render, grid, state, util)
docs/                # per-game spec: README, gameplay.md, engineering.md
public/              # static assets (word lists, favicon, ...)
```

## Author

**Antonio Augusto Russo** — NYX Knowledge — <aarusso@nyxk.com.br>

## License

MIT (see `LICENSE`). Reuse anything you like, attribute is appreciated but
not required.
