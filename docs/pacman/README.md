# Pac-Man

A faithful web reimplementation of the 1980 Namco arcade classic, built to run in a modern browser as part of an arcade SPA. This document describes what the game is, where it came from, and what we are trying to recreate in look and feel.

## What it is

Pac-Man is a single-screen maze game. The player guides a yellow circular character ("Pac-Man") through a fixed maze, eating every small pellet on the board while avoiding four colored ghosts that patrol the corridors. Four larger "power pellets" sit in the corners; eating one briefly inverts the threat and lets Pac-Man eat the ghosts for points. Clearing every pellet advances the player to the next level; getting caught by a ghost costs a life.

The screen never scrolls. Everything happens on a single 28-by-31 tile maze with two horizontal tunnels that wrap around the edges. Rounds get harder by speeding up Pac-Man and the ghosts, shortening the frightened window after power pellets, and changing the bonus fruit.

## Origin

Designed by Toru Iwatani at Namco and released in Japan in May 1980 as *Puck Man*, renamed *Pac-Man* for the U.S. release later that year (Midway distributed it in North America). It was a deliberate departure from the shooter-dominated arcade landscape of the late 1970s: Iwatani wanted a game whose primary appeal was not violence and that would draw in a broader audience, including women. The eating motif came from a pizza with a slice removed.

The game became one of the highest-grossing arcades of all time, spawned a long-running franchise, and remains a reference point for game design discussions about pacing, AI personalities, and emergent behavior from very simple rules. Most of what we now know about its internals comes from Jamey Pittman's *Pac-Man Dossier*, a reverse-engineering writeup that documents the original 6809 logic at the bit level; this spec leans on it heavily.

## Look and feel

The aesthetic is the iconic one: pure black background, blue maze walls drawn as thin double lines with rounded corners, small white pellets at intersection-adjacent tiles, four blinking white power pellets. Pac-Man is a yellow disc with a mouth that animates open-closed-open as he moves, always rotated to face his current direction. The four ghosts are translucent-looking colored blobs with two large eyes whose pupils point in their direction of travel.

- Blinky: red, aggressive, the chaser
- Pinky: pink, ambush from the front
- Inky: cyan, unpredictable
- Clyde: orange, erratic, often disengages

When a power pellet is eaten the ghosts turn deep blue with little white scared faces, reverse direction in place, and shamble more slowly. As the timer runs out they flash white-and-blue. If eaten, only the eyes remain, racing back to the ghost house at high speed before regenerating.

The HUD is minimal and lives at the top and bottom of the play field: current score, high score, level indicator (a row of fruit icons in the bottom right), remaining lives (a row of small Pac-Man icons in the bottom left). The font is the chunky upright bitmap font from the original ROM; we will approximate it.

## Core appeal

A few things keep Pac-Man interesting forty-plus years later, and we want all of them present:

1. **Readable threat with hidden depth.** The ghosts look like four interchangeable enemies, but each has a distinct targeting rule that creates a recognizable personality. Players who can name what Pinky is doing play very differently from players who cannot, and the gap is the long tail of the game.
2. **The Scatter / Chase rhythm.** Ghosts cycle between "go to your home corner" and "hunt Pac-Man" on a fixed schedule. The schedule gives players brief, predictable windows of safety and creates pressure waves across the level. Without this rhythm the game would just be a chase.
3. **Power-pellet inversion.** The dynamic flips: hunter becomes hunted, points cascade (200, 400, 800, 1600 for the chain). Skilled play involves saving power pellets, herding ghosts into corners before eating one, and chaining all four within a single power window.
4. **Tile-and-grid movement with a buffered turn.** The controls feel immediate because direction inputs are remembered until the next legal turn. This is invisible but load-bearing.
5. **A short feedback loop.** Eat a pellet, hear a beat, score ticks up. A full board takes a couple of minutes. Dying is fast. Restarting is fast. The whole game fits in a tight loop you can rerun dozens of times in a session.

## What we are building

A self-contained game module that mounts into a `<canvas>` inside a routed SPA page (framework TBD; the host is React/Vue/Svelte/Angular). The module is framework-agnostic: it exposes a small lifecycle API (`mount`, `unmount`, `pause`, `resume`) and handles its own game loop, input, rendering, and state. The host app provides the page chrome (title, back button, high-score persistence hook) and nothing else.

The goal is arcade-faithful: the maze layout, the ghost AI targeting rules, the speed table, the scatter/chase schedule, and the scoring values should all match the original within the tolerance of running on a modern variable-refresh display. Cutscenes, the level-256 kill-screen bug, and two-player alternating mode are explicit non-goals for v1; see `engineering.md` for the full out-of-scope list.

See `gameplay.md` for the player-facing rules and `engineering.md` for the implementation spec.
