# Roadmap

NYX Arcade is built as a concrete example of AI-agentic coding (see the `docs/`
specs and the Git history for the process). This list captures things worth
adding next, ordered by what would teach the most per unit of effort.

## Audio support

Each game's renderer has an unfilled `audio.play(...)` shaped seam; the specs
all say "v1 silent, v2 SFX". Plan:

- A shared `core/audio` module wrapping the Web Audio API, with an
  `audio.play(name)` no-op-friendly API.
- Per-game SFX maps:
  - **Snake**: chomp on food, soft pop on bonus, descending tone on death.
  - **Tetris**: line-clear chime (single/double/triple/tetris distinct), lock
    thunk, hold swap, T-spin sting, game-over arpeggio.
  - **Pac-Man**: the four arcade sounds — waka-waka, ghost siren whose pitch
    rises with pellet count, frightened siren, eat-ghost rising glissando,
    death descending wail, extra-life jingle.
  - **Termo**: tile-flip click, error buzz, win fanfare.
- All sounds short procedural-synth tones (square/triangle waves), no licensed
  samples. Master volume + per-game mute persisted in localStorage.

## Better size handling

- **Full-board mode**. A toggle (suggest <kbd>\\</kbd>) hides the
  header/HUD/help chrome and lets the canvas fill the viewport. Pressing
  again restores. The page already has a CSS-variable scaling pass; this
  promotes the host to `position: fixed; inset: 0` while the toggle is on.
- **Smart resize**. Each game's host respects its aspect ratio and grows to
  fill the available space (Pac-Man 224/288, Tetris 5/12 ratio playfield+side,
  Snake 1/1, Termo dynamic). Currently the `mountCanvas` helper does an
  integer-fit "pixel-art" scale or a smooth "fit" scale; both work but the
  host CSS hard-codes some max-widths that fight it. Consolidate so the host
  is `flex: 1; min-height: 0` and the canvas is the size driver.

## Improved look & feel

- **Pac-Man**: eye + pupil on the chomp animation (currently just a yellow
  disc with an opening mouth). Fruit sprites — cherry, strawberry, orange,
  apple, melon, galaxian, bell, key — instead of the current colored dots.
- **Tetris**: subtle gradient on locked pieces, line-clear shear/particle
  effect (spec says optional), "ZONE" / Tetris-effect-style accent on
  back-to-back tetrises.
- **Snake**: snake-skin scale pattern on body segments, eye highlight on the
  head, brighter pulse on the bonus food.
- **Termo**: option for the term.ooo brand palette in addition to the current
  Wordle-style gray theme.
- **Typography**: extend Press Start 2P beyond Pac-Man HUDs to all in-game
  text where the pixel-art look fits; keep sans-serif for body copy.
- **Sprite atlas**: pre-render each game's recurring shapes to a tiny atlas
  for fewer draw calls and crisper integer scaling.

## Improved front page

- Title-screen feel: the four game cards as canvas previews that animate
  (Pac-Man chasing a pellet, Tetris piece falling, Snake eating, Termo tile
  flipping). Hover lights them up.
- High-score display per game on the card.
- A short "what is this?" panel linking to the source repo and the docs/.

## Footer acknowledgement

Every page (including the home screen) gets a small footer:

> Built by **Antonio Augusto Russo** at **NYX Knowledge** as an example of
> AI-agentic coding. MIT licensed. Source on
> [GitHub](https://github.com/aarusso-nyx/arcade).

The footer should also link to the `docs/<game>/engineering.md` spec for the
current game so a reader can compare the spec to the running implementation.

## Smaller follow-ups

- **Audio mute toggle** (M key) once audio lands.
- **Replay export** for Snake and Tetris (record input + seed, replay
  deterministically).
- **Daily-archive** for Termo: a button to play earlier days' puzzles.
- **Stats modal** in Termo (current streak + best streak + win distribution).
- **Pause overlay** with a centered "Paused" graphic instead of just the
  canvas overlay text.
- **Performance budget tests**: assert each game maintains a 60fps tick under
  a synthetic workload in headless karma.
- **PWA manifest**: install-to-home-screen support, offline play after first
  load (the game logic is fully client-side; only Termo needs the word list,
  which can be cached).

## Out of scope (probably forever)

- Multiplayer.
- High-score server / global leaderboards.
- Touch input (was explicitly removed from the specs).
- Mobile-specific UI chrome.
- Licensed sprites / music.
