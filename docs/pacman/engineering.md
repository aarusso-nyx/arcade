# Pac-Man — Engineering Specification

This is the implementation spec. It assumes you have read `README.md` and `gameplay.md`. Where the original arcade has a known-good answer (ghost speeds, scatter/chase schedule, targeting rules), this document uses it; values are sourced from the *Pac-Man Dossier* (Jamey Pittman) and confirmed against MAME disassembly. Where modern web platform realities diverge from arcade hardware (variable refresh rates, no fixed pixel clock), this document calls out the adjustment.

## Contents

1. Coordinate system and units
2. Board model
3. Entities and their state machines
4. Movement model
5. Targeting algorithms (per ghost)
6. Ghost house schedule and exit logic
7. Speed table
8. Game loop
9. Rendering
10. Input
11. Scoring and game state
12. Sound
13. Module layout
14. Public API for the host SPA
15. Testing
16. Out of scope for v1
17. Appendix: maze data format

---

## 1. Coordinate system and units

Three coordinate systems are in play. Keep them straight or nothing else in this document makes sense.

- **Tile coordinates** `(tx, ty)`: integer indices into the maze grid. The maze is 28 tiles wide and 31 tiles tall (technically 36 rows tall including HUD rows; the play field is 28x31). `tx` increases to the right starting at 0; `ty` increases downward starting at 0.
- **Pixel coordinates** `(px, py)`: floating-point pixels on the canvas. One tile is **8 pixels** in the arcade original. We render at an integer scale factor `S` chosen at mount time based on viewport size (typically 2x or 3x), so a tile is `8 * S` rendered pixels. Internal physics math is always done at 1x (8 px per tile); rendering applies `S` as a transform.
- **Sub-tile coordinates** `(sx, sy)`: floating-point pixels relative to a tile's center. Used to determine when an entity has "entered" a new tile (it has if its center crosses the tile boundary) and when it is "on-center" (within sub-pixel epsilon of the tile center along the perpendicular axis to its motion).

The entity position is stored as `(px, py)` in pixel space, with the tile `(tx, ty)` derived as `(floor(px / 8), floor(py / 8))`. An entity is "centered on its tile" when `(px % 8, py % 8) == (4, 4)` — turns are only legal at this instant (with the sub-tile turn allowance described in Section 4).

All velocities are in pixels per tick. One tick is 1/60 second. See Section 8 for game loop.

---

## 2. Board model

### 2.1 Grid

The play field is a `28 cols x 31 rows` tile grid. Each cell stores:

```ts
type TileType =
  | 'wall'           // impassable
  | 'empty'          // walkable, no pellet (already eaten or never had one)
  | 'pellet'         // walkable, small pellet present
  | 'power'          // walkable, power pellet present
  | 'door'           // ghost-house door — passable by ghosts only, in specific states
  | 'house';         // interior of ghost house — ghosts only

type Tile = {
  type: TileType;
  // Static flags, baked at load time:
  isIntersection: boolean;   // >2 walkable neighbors
  isTunnel: boolean;         // on the tunnel row, outside the visible maze on either side
  isSlowZone: boolean;       // tunnel slow-down region (3 tiles each side of the wrap)
  isNoUpZone: boolean;       // the four tiles where ghosts may not choose "up" during chase/scatter
};
```

### 2.2 Maze representation

Store the maze as a single ASCII string, one character per tile, rows separated by newlines. Load once at module init, parse into a `Tile[][]`. The legend:

```
#  wall
.  pellet
o  power pellet
   (space) empty walkable
-  ghost-house door
H  ghost-house interior
T  tunnel (off-screen padding for wrap math, not rendered)
```

Example header of the canonical maze (first 8 rows):

```
############################
#............##............#
#.####.#####.##.#####.####.#
#o####.#####.##.#####.####o#
#.####.#####.##.#####.####.#
#..........................#
#.####.##.########.##.####.#
#.####.##.########.##.####.#
```

The full 31-row maze string lives in `src/data/maze.txt` and is checked in. See Appendix.

### 2.3 No-Up zones (the "red zone" trick)

There are **four specific tiles** where ghosts in scatter or chase mode are forbidden from choosing the "up" direction even if it is otherwise legal. These tiles are the ones immediately above each of the two T-intersections directly above and directly below the ghost house. The restriction does not apply to frightened or eaten ghosts. This is one of the most famous quirks of the original AI and the reason certain ghost loops are stable. Encode them as a static `isNoUpZone` flag on the four tiles:

- `(12, 14)`, `(15, 14)` — the two tiles above the ghost house entrance
- `(12, 26)`, `(15, 26)` — the two tiles above the lower T-intersections

(Indices assume 0-based, x measured from left, y from top; verify against the maze string at load time and emit a console assertion if any of those four tiles are not walkable.)

### 2.4 Tunnel slow zones

Mark every tile on the tunnel row (y == 14) that is within the tunnel section (x in `[0, 5]` and `[22, 27]`) as `isSlowZone`. Ghosts traversing slow-zone tiles use the tunnel speed from the speed table. Pac-Man does **not** slow down in tunnels in the original (he uses the same per-level speed). This spec follows the original.

### 2.5 Loading

```ts
function loadMaze(text: string): Maze {
  const rows = text.split('\n').filter(r => r.length > 0);
  // assert width 28 and height 31
  // build Tile[][], then a second pass to compute isIntersection, isNoUpZone, etc.
  return { tiles, width: 28, height: 31, pelletCount, powerPelletCount };
}
```

`pelletCount` should be **240** and `powerPelletCount` should be **4** for the canonical maze. Assert these at load time — if they don't match, the maze data is wrong and the level-clear check (Section 11) will never fire.

---

## 3. Entities and their state machines

There are five entities total: one Pac-Man and four ghosts. Each entity has:

- A position `(px, py)` in pixel space
- A current direction `dir` in `{up, down, left, right, none}`
- A pending/buffered direction `nextDir` (Pac-Man only; ghosts decide at intersections)
- A current state from its state machine
- A reference to the speed table

### 3.1 Pac-Man state machine

```
        +----------+
        | spawning |
        +----+-----+
             |  (spawn delay complete)
             v
        +----------+
        |  alive   | <-+
        +----+-----+   |
             |         | (respawn after death)
             v         |
        +----------+   |
        |  dying   |---+
        +----+-----+
             |  (lives == 0)
             v
        +----------+
        | gameover |
        +----------+
```

- `spawning`: render in place, frozen, for ~2 seconds at level start ("READY!" displayed).
- `alive`: receive input, move, eat pellets, can be killed.
- `dying`: ghosts freeze, Pac-Man plays death animation (~1 second), then respawn or game over.

### 3.2 Ghost state machine

```
                  +-----------+
                  | in-house  |
                  +-----+-----+
                        | (release condition met)
                        v
                  +-----------+      power pellet eaten
                  | leaving   |---+  while leaving:
                  +-----+-----+   |  flip to frightened
                        |         |  after exit
                        v         v
            +---->+-----------+   |
            |     |  scatter  |<--|---+
            |     +-----+-----+   |   |
   schedule |           | mode    |   |
   tick     |           v switch  |   |
            |     +-----------+   |   |
            +-----+   chase   |<--+---+
                  +-----+-----+       |
              power pellet eaten      |
                        |             |
                        v             |
                  +-----------+       | (timer expires)
                  | frightened|-------+
                  +-----+-----+
                        | (eaten by Pac-Man)
                        v
                  +-----------+
                  |   eaten   |
                  | (eyes)    |
                  +-----+-----+
                        | (reach ghost house door)
                        v
                  +-----------+
                  | returning |
                  | to spawn  |
                  +-----+-----+
                        | (back in house)
                        v
                  +-----------+
                  | in-house  |
                  | (re-enter)|
                  +-----------+
```

State transitions:

- **in-house -> leaving**: when the per-ghost release condition is met (Section 6).
- **leaving -> scatter|chase**: when the ghost passes the door tile and enters the maze proper. Adopts whichever mode the global schedule is currently in.
- **scatter <-> chase**: on global schedule tick (Section 7.2). When this transition fires, every ghost in scatter or chase reverses direction in place. Ghosts in frightened, eaten, or in-house do not reverse.
- **scatter|chase -> frightened**: when Pac-Man eats a power pellet. All ghosts currently in scatter or chase reverse direction and switch to frightened. Ghosts in eaten state keep going. Ghosts in-house do not flip.
- **frightened -> scatter|chase**: when the frightened timer expires. Reverts to whatever the global schedule says is current. No direction reverse on this transition.
- **frightened -> eaten**: when Pac-Man touches a frightened ghost. Ghost reduces to eyes, gains a high speed, targets the ghost-house door.
- **eaten -> in-house**: when eyes reach the door and descend into the house. Brief pause, then re-enter normal cycle starting in leaving.

### 3.3 Per-ghost identity

```ts
type Ghost = {
  id: 'blinky' | 'pinky' | 'inky' | 'clyde';
  homeCorner: Tile;     // scatter target
  spawnTile: Tile;      // position in ghost house
  state: GhostState;
  position: Vec2;
  direction: Dir;
  ...
};
```

Home corner targets (tiles that are off the playable map by design — ghosts in scatter perpetually loop around the corner closest to that tile):

- **Blinky**: `(25, 0)` — top-right corner
- **Pinky**:  `(2, 0)`  — top-left corner
- **Inky**:   `(27, 29)` — bottom-right corner
- **Clyde**:  `(0, 29)`  — bottom-left corner

Spawn positions inside the ghost house:

- **Blinky**: starts *outside* the house at the tile directly above the door, `(13.5, 11)` (between two tiles horizontally — store as `(13, 11)` and `(14, 11)` straddling).
- **Pinky**:  inside the house, center, `(13.5, 14)`.
- **Inky**:   inside the house, left,   `(11.5, 14)`.
- **Clyde**:  inside the house, right,  `(15.5, 14)`.

(The half-tile offsets reflect the ghost house being two tiles wide per ghost; we approximate with pixel-level offsets when rendering.)

---

## 4. Movement model

### 4.1 Tile-based with sub-tile positions

Every entity moves continuously in pixel space at its current `speed` (px/tick), in its current `direction`. The direction can only change at specific moments described below. Walls block movement: if the next pixel step would put the entity's center into a wall tile, the entity stops at the wall (Pac-Man) or the entity must have already chosen a different direction at the prior intersection (ghosts).

### 4.2 Turn rules — Pac-Man

Pac-Man supports **corner cutting / turn buffering**. The player can input a new direction at any time. The game stores it as `nextDir`. On every tick, after computing the proposed move:

1. If `nextDir` is the reverse of `direction`, apply immediately (180s are free and allowed mid-tile).
2. Otherwise, if `nextDir` is perpendicular to `direction` and the adjacent tile in `nextDir` is walkable, snap-turn when the entity center is within **2 pixels** of the next tile center along the current axis. This is the cornering behavior: the turn registers slightly before the formal tile center, which both feels responsive and lets skilled players "cut" the corner for a small speed advantage (matching the arcade).
3. If `nextDir` cannot be applied this tick, keep it buffered. Clear `nextDir` once it is applied.

The buffer has **no time limit** in the original (it persists until consumed or overwritten). This spec keeps the original behavior — `nextDir` only clears on consumption or on a new input.

If Pac-Man is blocked by a wall in `direction` and `nextDir` is not set or is also blocked, Pac-Man stops at the tile center with his current facing. He resumes the moment any valid direction is input.

### 4.3 Turn rules — Ghosts

Ghosts do not buffer. At every tile center, before the ghost enters a new tile, it must commit to one direction for the entire next tile. The decision rule:

1. List the four possible directions.
2. Eliminate the reverse of the current direction (ghosts cannot 180 voluntarily; only forced reverses on mode switches or power-pellet flips).
3. Eliminate any direction that lands on a wall.
4. If the ghost is in a `isNoUpZone` tile and the ghost's state is `scatter` or `chase`, eliminate `up`.
5. From the remaining candidates:
   - In **frightened**: pick uniformly at random. (Original uses a pseudo-random sequence; for fairness use `Math.random()` or a seeded PRNG. The spec accepts either.)
   - In **scatter / chase / eaten**: compute the Euclidean (squared) distance from the *neighbor tile in each candidate direction* to the ghost's current target tile. Pick the direction that minimizes this distance. Tiebreak in the order `up, left, down, right` (this is the original tiebreak and matters for reproducibility).
6. If no candidates remain after elimination (rare; happens in dead-end shaped tunnels): force a reverse.

Ghosts do not corner-cut. Their turn happens exactly at the tile center.

### 4.4 Tunnel wrap

When an entity's center crosses the left edge (`px < -4`) or the right edge (`px > width * 8 + 4`), teleport to the opposite side. The `T` (tunnel padding) tiles in the maze data provide the off-screen extent. Pac-Man and ghosts both use the same wrap logic.

Ghosts in `isSlowZone` tiles use the per-level tunnel speed from the speed table — about half of their normal speed. Pac-Man's speed does not change in tunnels.

### 4.5 Collisions

**Wall collision** is implicit in the movement rules — entities cannot enter wall tiles. No physics solver required; the grid handles it.

**Pac-Man vs ghost collision** is checked once per tick, after all entities have moved:

```
collision = manhattan_distance_in_pixels(pac.pos, ghost.pos) < 8
            OR pac.tile == ghost.tile
```

The original used pure tile comparison (same tile = collision). This is faithful enough, but produces occasionally unfair "I clearly passed him" deaths because of the discretization. This spec uses **tile equality**: a collision is registered when `pac.tile == ghost.tile`. This is the canonical rule and is required for the famous Pac-Man-ghost "swap" past-through where they exchange tiles without colliding because they're moving in opposite directions through the same intersection — the original game has this bug and players know it.

On collision:

- Ghost is in `frightened` -> ghost transitions to `eaten`, Pac-Man scores per the chain.
- Ghost is in `eaten` -> nothing (eyes are intangible).
- Ghost is in any other state -> Pac-Man transitions to `dying`.

---

## 5. Targeting algorithms

Each ghost in `scatter` mode targets its home corner (Section 3.3). Each ghost in `chase` mode computes its target tile per the rules below. Targets are recomputed every tick (cheap; just integer math). The targeting tile may be off the map — that is fine, the distance metric still works.

Notation: `pac.tile = (px, py)`. `pac.dir` is Pac-Man's current direction. `blinky.tile = (bx, by)`.

### 5.1 Blinky — direct chase

```
target = pac.tile
```

That's it. The shadow.

### 5.2 Pinky — four tiles ahead

```
target = pac.tile + 4 * pac.dir
```

**With the documented bug**: when `pac.dir == up`, the original game's targeting routine has an overflow that adds 4 tiles up *and* 4 tiles to the left:

```
if pac.dir == up:
  target = (pac.tx - 4, pac.ty - 4)
else:
  target = pac.tile + 4 * pac.dir
```

This bug is canonical Pac-Man behavior. Reproduce it. Pinky's ambush patterns the speedrunning community relies on depend on it.

### 5.3 Inky — flank using Blinky

The hardest one. Two-step:

1. Compute an intermediate tile two tiles ahead of Pac-Man:
   ```
   pivot = pac.tile + 2 * pac.dir
   ```
   (Apply the same up-bug as Pinky: if `pac.dir == up`, `pivot = (pac.tx - 2, pac.ty - 2)`.)

2. Take the vector from Blinky's tile to `pivot`, double it, and that is the target:
   ```
   target = pivot + (pivot - blinky.tile)
          = 2 * pivot - blinky.tile
   ```

In practice, Inky's target is the tile diametrically opposite Blinky across a point two tiles in front of Pac-Man. When Blinky is far away, Inky's target can be far off the map and his behavior looks erratic. When Blinky is close, Inky pinches in to flank.

### 5.4 Clyde — distance-dependent

```
distance_squared = (pac.tx - clyde.tx)^2 + (pac.ty - clyde.ty)^2
if distance_squared > 64:    // > 8 tiles
  target = pac.tile
else:
  target = clyde.homeCorner  // (0, 29)
```

Clyde is the only ghost whose chase target is conditional. This is why he is the safest ghost most of the time and why he is so often the survivor at the end of a power-pellet hunt.

### 5.5 Frightened target

None — frightened ghosts pick directions randomly at every intersection (Section 4.3 rule 5).

### 5.6 Eaten target

```
target = ghost_house_door_tile  // (13, 11)
```

Eyes use a high speed (1.5x normal, see speed table) and ignore the no-up zones.

---

## 6. Ghost house schedule and exit logic

Ghosts do not all start in play. At level start:

- **Blinky** spawns *outside* the house, just above the door, facing left. He immediately enters the global scatter/chase cycle.
- **Pinky** spawns inside, ready to leave on the first tick.
- **Inky** spawns inside, waits.
- **Clyde** spawns inside, waits longest.

Release order is **Pinky, Inky, Clyde**. There are two release counters that run in parallel and the first one to trigger releases the next ghost.

### 6.1 Personal pellet counter (default)

Each ghost has a personal counter that increments when Pac-Man eats a pellet. When the counter hits the threshold, the ghost leaves. Thresholds are per-level:

| Ghost  | Level 1 | Level 2 | Level 3+ |
|--------|---------|---------|----------|
| Pinky  | 0       | 0       | 0        |
| Inky   | 30      | 0       | 0        |
| Clyde  | 60      | 50      | 0        |

So on level 1, Pinky leaves immediately, Inky leaves after Pac-Man has eaten 30 pellets, Clyde after 60. On level 3 and beyond they all leave essentially immediately.

### 6.2 Global pellet counter (after Pac-Man dies)

After a death, ghosts go back into the house and the personal counters are *disabled*. A single global counter is used instead, with thresholds **7 (Pinky), 17 (Inky), 32 (Clyde)** pellets eaten since the death. Once Clyde leaves, the global counter is disabled and personal counters resume.

### 6.3 Idle release timer

Independent of pellets, a timer also releases the next ghost if **4 seconds** (levels 1-4) or **3 seconds** (level 5+) pass without Pac-Man eating a pellet. This prevents the player from camping in a quiet corner waiting for the ghosts to pile up.

### 6.4 Leaving and re-entering

When released, the ghost moves up out of the door, into the tile immediately above the door, then begins normal scatter/chase movement. When an eaten ghost's eyes return, they pass through the door downward into the house, descend to the spawn slot, pause briefly (~1 second), then re-leave with normal rules.

---

## 7. Speed table

### 7.1 Speeds (as fraction of full speed)

"Full speed" = **75.75757... pixels per second** = exactly **1.0 tiles in 5.06 frames at 60 Hz** = the original arcade's reference rate. In practice, store an array `pixelsPerTick[level]` for each entity type and state.

| Level | Pac normal | Pac frightened | Ghost normal | Ghost frightened | Ghost tunnel | Elroy 1 | Elroy 2 |
|-------|------------|----------------|--------------|-------------------|--------------|---------|---------|
| 1     | 80%        | 90%            | 75%          | 50%               | 40%          | 80%     | 85%     |
| 2-4   | 90%        | 95%            | 85%          | 55%               | 45%          | 90%     | 95%     |
| 5-20  | 100%       | 100%           | 95%          | 60%               | 50%          | 100%    | 105%    |
| 21+   | 90%        | (n/a)          | 95%          | (n/a)             | 50%          | 100%    | 105%    |

Eaten ghosts (eyes) use **150%** at all levels.

"Elroy 1" applies to Blinky once the dots-remaining on a level drops below a per-level threshold; "Elroy 2" applies below half that threshold. Thresholds:

| Level | Elroy 1 dots remaining | Elroy 2 dots remaining |
|-------|------------------------|------------------------|
| 1     | 20                     | 10                     |
| 2     | 30                     | 15                     |
| 3-5   | 40                     | 20                     |
| 6-8   | 50                     | 25                     |
| 9-11  | 60                     | 30                     |
| 12-14 | 80                     | 40                     |
| 15-18 | 100                    | 50                     |
| 19+   | 120                    | 60                     |

When Blinky becomes Elroy, his scatter target is ignored — he treats scatter as chase. (He still reverses on mode switches.)

### 7.2 Scatter / chase schedule

Time spent in each mode, in seconds. The cycle runs forever; the final chase is permanent.

| Phase   | Levels 1     | Levels 2-4   | Levels 5+   |
|---------|--------------|--------------|-------------|
| Scatter | 7            | 7            | 5           |
| Chase   | 20           | 20           | 20          |
| Scatter | 7            | 7            | 5           |
| Chase   | 20           | 1033         | 1037        |
| Scatter | 5            | 1/60 (1 tick)| 1/60        |
| Chase   | 20           | forever      | forever     |
| Scatter | 5            | -            | -           |
| Chase   | forever      | -            | -           |

(The 1033-second chase and one-tick scatter at levels 2-4 are the *Pac-Man Dossier* values; they are bizarre but correct, and effectively turn the late game into "chase forever with a brief, almost imperceptible scatter twitch.")

The schedule timer pauses while Pac-Man is in frightened mode (i.e., while any ghost is in frightened state).

### 7.3 Frightened duration

Time the frightened state lasts (seconds), and number of flashes during the warning phase:

| Level | Frightened secs | Warning flashes |
|-------|-----------------|------------------|
| 1     | 6               | 5                |
| 2     | 5               | 5                |
| 3     | 4               | 5                |
| 4     | 3               | 5                |
| 5     | 2               | 5                |
| 6     | 5               | 5                |
| 7-8   | 2               | 5                |
| 9     | 1               | 3                |
| 10    | 5               | 5                |
| 11    | 2               | 5                |
| 12-13 | 1               | 3                |
| 14    | 3               | 5                |
| 15-16 | 1               | 3                |
| 17    | 0 (no fright)   | 0                |
| 18    | 1               | 3                |
| 19+   | 0               | 0                |

(Yes, the values oscillate. This is the arcade table. Use it.)

The warning is half a second long per flash, beginning that many half-seconds before the timer expires. The blue-to-white alternation happens at every render tick during the warning.

---

## 8. Game loop

### 8.1 Fixed timestep

Run the simulation at a **fixed 60 Hz** tick rate. One tick = 1/60 second = ~16.667 ms of simulation time. All speeds, animation frames, and timers in this spec are expressed in ticks.

Use the standard fixed-timestep-with-accumulator pattern (Glenn Fiedler's "Fix Your Timestep!"):

```ts
let lastTime = performance.now();
let accumulator = 0;
const TICK_MS = 1000 / 60;
const MAX_ACCUMULATED_TICKS = 5; // avoid spiral of death after tab inactive

function frame(now: number) {
  const dt = now - lastTime;
  lastTime = now;
  accumulator += dt;
  let ticks = 0;
  while (accumulator >= TICK_MS && ticks < MAX_ACCUMULATED_TICKS) {
    tick();
    accumulator -= TICK_MS;
    ticks++;
  }
  if (ticks === MAX_ACCUMULATED_TICKS) accumulator = 0; // drop time
  render(accumulator / TICK_MS); // pass alpha for interpolation if desired
  rafHandle = requestAnimationFrame(frame);
}
```

### 8.2 Frame-rate independence

The simulation is rate-independent because it always advances by integer ticks. Render runs once per `requestAnimationFrame` regardless of monitor rate. Sub-frame interpolation between the last two simulation states (alpha blending positions) is optional and can be added in v2 — for v1, render the latest state directly. The result on a 144 Hz monitor will be slightly choppier than perfect interpolation, but Pac-Man is a low-speed game and the choppiness is unnoticeable.

### 8.3 Pause/resume

Set a `paused` flag. When set, `tick()` returns immediately. `lastTime` should be reset on resume to avoid a giant `dt` spike (`lastTime = performance.now()`). The accumulator should also be zeroed on resume.

Pause from:

- User input (P or Esc)
- `document.visibilitychange` -> hidden
- Host SPA calling the `pause()` API

Resume on the inverse events. The "READY!" pre-level pause and the death pause are *not* pauses in the loop sense — they are timed scripted sequences inside `tick()`.

### 8.4 Level transitions

When the pellet counter hits 0:

1. Freeze all entities; stop ghost AI.
2. Hold for ~2 seconds with the static maze visible.
3. Flash the maze (blue walls -> white walls) four times over ~2 seconds.
4. Reset entity positions, reset pellet grid, increment level counter, recompute per-level constants.
5. Show "READY!" for ~2 seconds, then start the new level.

Total transition time: ~6 seconds.

### 8.5 Death sequence

When Pac-Man collides with a hostile ghost:

1. Freeze all entities for ~1 second (Pac-Man frozen with mouth half-open, ghosts visible).
2. Hide ghosts.
3. Play Pac-Man death animation (11 frames over ~1.5 seconds: mouth opens fully, then closes to a vertical line, then shrinks to a point).
4. Decrement lives.
5. If lives > 0: reset positions, show "READY!" for ~2 seconds, resume. Pellets stay eaten.
6. Else: transition to game-over state.

---

## 9. Rendering

### 9.1 Canvas vs DOM — recommendation: Canvas 2D

**Use HTML5 Canvas 2D**, not DOM elements per sprite. Justification:

- Pac-Man has up to ~250 distinct visual elements on screen at once (240 pellets + 4 ghosts + Pac-Man + fruit + HUD). Per-element DOM nodes would create unnecessary layout pressure for an entity-heavy game.
- We need pixel-perfect control over the maze line art and animation frames.
- Canvas 2D is more than fast enough for a 224x288 internal resolution scaled up to 2x or 3x. WebGL is overkill for v1.
- One canvas keeps the SPA integration trivial — just a single `<canvas>` element to mount.

If we ever want particle effects or post-processing in v2, swap to WebGL behind the same renderer interface.

### 9.2 Internal resolution and scaling

Logical play field: **224 x 288 pixels** (28 cols x 8 + HUD rows; the full original is 28x36 tiles with 5 HUD rows). Pick a render scale `S` at mount time:

```
S = max(1, min(floor(viewportWidth / 224), floor(viewportHeight / 288)))
```

Set the canvas backing-store size to `224 * S` x `288 * S`. Set the CSS size to the same (or use `image-rendering: pixelated` and let CSS scale — but explicit backing-store sizing is sharper). Apply `ctx.scale(S, S)` once at the start of each render, then draw everything in logical 1x coordinates. Reset transform at end of frame.

On window resize, recompute `S` and resize the canvas. Debounce by 100ms.

For non-integer-fit viewports, center the canvas in a black-letterboxed container — never stretch.

### 9.3 Sprite sheet vs procedural

Use a single **sprite sheet PNG** for entities (Pac-Man frames, ghost frames, fruit). Procedural for the maze (draw walls from the tile grid using line primitives; cheaper than a maze image and trivially recoloured for the level-clear flash).

Pac-Man frames needed: 3 mouth positions (closed, half-open, full-open) x 4 facing directions = 12 sprites. Plus 11 death animation frames. Plus a "full circle" frame for spawning.

Ghost frames per ghost: 2 body animation frames (legs wiggle) x 4 directions = 8 sprites x 4 ghosts = 32. Plus 2 frightened frames (blue body) and 2 flashing frames (white body), shared across ghosts = 4. Plus 4 "eyes only" sprites (one per direction). Total: 40.

Fruit frames: 8 (one per fruit type).

HUD: digits 0-9, "READY!", "GAME OVER", small Pac and small fruit icons. ~25 sprites.

Total sprite sheet: ~100 sprites, easily fits in a 256x256 PNG. Use sprite atlas JSON for coordinates. Load once at mount, await `image.decode()` before starting the game loop.

### 9.4 Maze rendering

Each frame, redraw the maze from scratch by iterating the tile grid. Walls are drawn as the classic double-line blue corridors. The original uses a specific algorithm based on tile neighbors: for each wall tile, examine the 8-neighbor topology and draw appropriate line segments to form continuous double-line corridors. Either:

- (a) Implement the neighbor-based line algorithm. Hard to get exactly right; lots of edge cases.
- (b) Pre-render the maze once into an off-screen canvas at module init and blit it each frame, repainting only changed tiles (eaten pellets). This is the recommended approach.

For option (b): off-screen canvas with the full maze (walls + all pellets) rendered once. Each frame, blit the maze canvas first, then iterate eaten-pellet positions and paint over with black to "erase" them, then draw entities on top. Recompute the maze canvas on level start (and during the level-clear flash with color swapped).

### 9.5 Animation

Each entity has an `animFrame` counter that ticks once per simulation tick (or per N ticks for slower animations). The renderer maps `animFrame` to the appropriate sprite. Pac-Man's mouth: 4-frame cycle (closed, half, full, half) at 8 ticks per frame. Ghost legs: 2-frame cycle at 8 ticks per frame. Frightened flash warning: 2-frame cycle at 14 ticks per frame.

Pause animation when paused; freeze on the current frame.

### 9.6 Viewport and dead zones

The play field is centered in the canvas with black padding. The HUD (score, high score, lives, fruit indicators) lives above and below the play field. Total canvas: 224x288. Play field: 224x248 (rows 3-33 of the tile grid). Top HUD: rows 0-2. Bottom HUD: rows 34-35.

Touch dead zone: a 60px-tall band at the top and bottom of the screen on mobile that does *not* register swipes — reserved for OS chrome and pause UI.

---

## 10. Input

### 10.1 Keyboard

Listen on `window` (not on the canvas) so the canvas does not need focus:

- `ArrowUp`, `w`, `W` -> queue direction `up`
- `ArrowDown`, `s`, `S` -> queue direction `down`
- `ArrowLeft`, `a`, `A` -> queue direction `left`
- `ArrowRight`, `d`, `D` -> queue direction `right`
- `p`, `P`, `Escape` -> toggle pause
- `Enter` -> start / continue from game over

Call `preventDefault` on arrow keys to stop the page from scrolling. Do not preventDefault on other keys.

### 10.2 Touch (mobile)

Listen for `touchstart`, `touchend` on the canvas. Compute the swipe vector:

```ts
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return; // tap, ignore
  if (Math.abs(dx) > Math.abs(dy)) {
    queueDirection(dx > 0 ? 'right' : 'left');
  } else {
    queueDirection(dy > 0 ? 'down' : 'up');
  }
}
```

Minimum swipe length: 20px. Taps (under threshold) do nothing in v1; in v2 a tap could trigger pause.

### 10.3 Input buffering

The buffer is a single slot. New input overwrites the existing buffered direction. The buffer is consumed (cleared) the moment the direction is successfully applied to Pac-Man.

There is no time-based expiration on the buffer in the original game and we follow that. The buffer persists until consumed or overwritten.

### 10.4 Gamepad (out of scope for v1)

Standard `Gamepad` API integration is straightforward — d-pad maps to direction, Start to pause — but is not required for v1.

---

## 11. Scoring and game state

### 11.1 Point values

| Event                         | Points       |
|-------------------------------|--------------|
| Pellet                        | 10           |
| Power pellet                  | 50           |
| Ghost 1 / 2 / 3 / 4 in chain  | 200 / 400 / 800 / 1600 |
| Fruit (per level, see gameplay.md) | 100 - 5000 |

### 11.2 Game state shape

```ts
type GameState = {
  level: number;             // 1-indexed
  score: number;
  highScore: number;         // loaded from localStorage
  lives: number;
  extraAwarded: boolean;     // 10k extra-life one-shot
  pelletsRemaining: number;
  pelletsEatenThisLevel: number;  // for fruit triggers
  globalGhostCounter: number;     // see section 6.2
  globalGhostCounterEnabled: boolean;
  ghostEatChain: 0 | 1 | 2 | 3 | 4;
  phase: 'attract' | 'ready' | 'playing' | 'dying' | 'levelclear' | 'gameover';
  phaseTimer: number;        // ticks
  scheduleIndex: number;     // index into scatter/chase schedule
  scheduleTimer: number;     // ticks remaining in current phase
  frightenedTimer: number;   // 0 if not frightened
  fruit: { tile: Tile, type: FruitType, ticksRemaining: number } | null;
};
```

### 11.3 Extra life

When `score` crosses 10,000 and `extraAwarded` is false: `lives += 1`; `extraAwarded = true`. Play a brief sound/visual cue.

### 11.4 High-score persistence

Store as a single integer in `localStorage` under the key `arcade.pacman.highScore`. Read on module mount, write whenever `score > highScore`. Wrap in `try/catch` for environments where localStorage is unavailable (private browsing on some platforms).

```ts
function loadHighScore(): number {
  try { return parseInt(localStorage.getItem('arcade.pacman.highScore') || '0', 10) || 0; }
  catch { return 0; }
}
function saveHighScore(n: number): void {
  try { localStorage.setItem('arcade.pacman.highScore', String(n)); }
  catch { /* ignore */ }
}
```

### 11.5 Fruit triggers

When `pelletsEatenThisLevel` reaches **70** or **170**, spawn a fruit at tile `(13.5, 17)` (just below the ghost house exit). It lives for `9 * 60 + rand(0, 60)` ticks (9-10 seconds) then despawns. Pac-Man eating the fruit scores per level table and despawns it. Only one fruit exists at a time.

---

## 12. Sound

### 12.1 MVP (v1): silent

No audio in v1. Keep the API placeholder (`audio.play('chomp')` as a no-op) so v2 can drop in implementations without touching call sites.

### 12.2 v2: SFX + ambient

Sound effects needed (matching the arcade):

- Intro music (~4 seconds at game start)
- Chomp loop (alternating two-note pattern while eating pellets)
- Power pellet siren (continuous low rumble while any ghost is frightened)
- Ghost-eaten chime
- Pac-Man death wail
- Fruit-eaten ding
- Extra-life chime
- Ghost retreat (eyes returning home) loop
- Level-up ding

Use the Web Audio API. Decode samples on module mount. Cap simultaneous voices at 8. Provide a single mute toggle in the HUD; persist the mute state to localStorage.

The ambient siren has four intensity levels that step up as pellets are consumed (more pellets eaten = faster/higher siren); switch sample at thresholds of 0%, 25%, 50%, 75% pellets remaining.

---

## 13. Module layout

Framework-agnostic. The game is a self-contained TypeScript module. The host SPA imports it and mounts it into a DOM element. The module knows nothing about React/Vue/Svelte/Angular.

```
src/
  index.ts                  # public API: mount, unmount, pause, resume, getState
  data/
    maze.txt                # ASCII maze
    sprites.png             # sprite atlas
    sprites.json            # atlas coords
    speedTable.ts           # all per-level numeric constants
    fruitTable.ts           # per-level fruit types and values
    schedule.ts             # scatter/chase schedule per level
  engine/
    types.ts                # Dir, Tile, Vec2, GhostState, etc.
    maze.ts                 # loadMaze, tile queries, isWalkable, isIntersection
    movement.ts             # tile/pixel conversions, turn rules
    pacman.ts               # Pac-Man entity + update
    ghost.ts                # Ghost entity + update + targeting dispatch
    targeting.ts            # 4 targeting functions (blinkyTarget, etc.)
    schedule.ts             # scatter/chase state machine
    collision.ts            # Pac-vs-ghost, Pac-vs-pellet
    gameState.ts            # GameState type + reducers (eatPellet, killGhost, etc.)
    loop.ts                 # fixed-timestep tick loop
  render/
    renderer.ts             # Renderer interface
    canvas2d.ts             # Canvas2D implementation
    maze-canvas.ts          # pre-rendered maze off-screen canvas
    sprites.ts              # sprite atlas loader
    hud.ts                  # score, lives, fruit indicators
    animation.ts            # frame timing helpers
  input/
    keyboard.ts             # listener install/uninstall
    touch.ts                # swipe handler
    buffer.ts               # the nextDir slot
  audio/
    audio.ts                # no-op stub for v1; Web Audio impl for v2
  ui/
    overlay.ts              # READY/GAME OVER/PAUSE overlays (canvas-drawn, not DOM)
  util/
    rng.ts                  # seeded PRNG (used by frightened ghost decisions)
    debug.ts                # toggleable overlays: target tiles, paths
  index.test.ts
  engine/*.test.ts
```

### 13.1 Module boundaries

- **`engine/`** is pure logic. No DOM, no canvas, no audio. Deterministic given input and seed. Trivially unit-testable.
- **`render/`** consumes engine state and draws. No mutation of engine state.
- **`input/`** translates DOM events into intent (buffered direction, pause toggle). It mutates a small input-state object that the engine reads each tick.
- **`audio/`** consumes engine events.
- **`ui/`** is the in-game overlay text. The host SPA owns the page chrome.

### 13.2 No global state

The module exports a `createGame(opts)` factory that returns a `Game` object with `mount/unmount/pause/resume`. Multiple instances should be possible (for tests, for a demo-attract mode on the menu page, for whatever).

---

## 14. Public API for the host SPA

```ts
type MountOptions = {
  container: HTMLElement;       // div the canvas will be appended into
  initialHighScore?: number;
  onScoreChange?: (score: number) => void;
  onGameOver?: (finalScore: number) => void;
  onHighScoreChange?: (newHigh: number) => void;
  audio?: boolean;              // v2
  debug?: boolean;
};

type Game = {
  pause(): void;
  resume(): void;
  reset(): void;                // back to attract mode
  unmount(): void;              // remove canvas, drop listeners, cancel rAF
  getState(): Readonly<GameState>;
};

export function createPacman(opts: MountOptions): Game;
```

Lifecycle:

```ts
// React example (the host)
const game = useRef<Game | null>(null);
useEffect(() => {
  game.current = createPacman({
    container: containerRef.current!,
    initialHighScore: loadHighScore(),
    onHighScoreChange: saveHighScore,
  });
  return () => game.current?.unmount();
}, []);
```

The game must not leave behind any global event listeners, timers, or canvas elements after `unmount()`. Verify with a small test that mount/unmount cycles cleanly N times.

---

## 15. Testing

### 15.1 Unit tests (must have)

- **`movement.ts`**: tile<->pixel conversions; turn buffering rules; wall blocking; corner cutting; tunnel wrap.
- **`targeting.ts`**: each of the four targeting functions, including Pinky's up-bug and Inky's blinky-flank computation. Use property-style tests: assert that `inkyTarget` is symmetric about `pivot` regardless of Blinky position.
- **`schedule.ts`**: scatter/chase phase progression; pause-while-frightened behavior; final-chase-forever transition.
- **`collision.ts`**: tile-equality collision; outcomes (kill Pac-Man / kill ghost / nothing) by ghost state.
- **`gameState.ts`**: reducers — eatPellet decrements counter, eatPower resets chain, killGhost awards correct chain points, extra-life threshold awards exactly once, fruit triggers fire at 70/170.
- **`maze.ts`**: loading the canonical maze produces 240 pellets, 4 power pellets, 4 no-up-zone tiles correctly flagged.
- **`ghost-decision`**: at a given intersection, with a given target, the ghost picks the correct direction (regression suite of ~20 hand-computed scenarios).

### 15.2 Integration tests

- A deterministic replay test: feed a recorded input sequence + seeded RNG, assert that after N ticks the GameState matches a stored snapshot. Catches accidental behavior regressions across refactors.

### 15.3 Manual tests (no automation worth it)

- Visual rendering correctness (sprite positions, animation smoothness, maze walls).
- Input feel — turn responsiveness, corner cutting feel.
- Mobile swipe gestures across iOS Safari / Android Chrome.
- Performance on a low-end device (target: 60 FPS sustained on a 5-year-old phone).
- Sound mix (when v2 audio lands).
- Pause/resume from window blur and tab switching.

### 15.4 Debug overlays

In `debug: true` mode, render:

- Each ghost's current target tile as a colored 1-tile square.
- Pac-Man's current `dir` and `nextDir` as arrows above his head.
- The scatter/chase schedule timer in the corner.
- Tile grid lines.
- The no-up zones in a light overlay color.

These are invaluable for verifying targeting and reproducing player-reported bugs.

---

## 16. Out of scope for v1

Explicitly **not** implemented in v1:

- **Cutscenes** between levels (the famous intermissions after levels 2, 5, 9, 13, 17 in the original — Pac-Man chases Blinky, Blinky's sheet snags, etc.). Treat level transitions as just the flash and READY.
- **Two-player alternating mode.** Single-player only.
- **Attract mode demo loop.** Title screen sits on a "PRESS ENTER" prompt; no AI-driven demo.
- **The level-256 kill-screen bug.** The original's 8-bit fruit-counter overflow corrupts the right half of the screen on level 256. We use an unbounded level counter (just a JS number) and the fruit table caps at "key" from level 13 onward. No reproduction.
- **The split-screen bug or the "pattern" exploits.** Speedrun-only behaviors that depend on hardware-cycle-exact timing — irrelevant on the web.
- **Sound.** v1 is silent. v2 adds the SFX/ambient layer.
- **Gamepad input.** v2.
- **Localization.** All in-game text ("READY!", "GAME OVER", "HIGH SCORE") is English.
- **Online leaderboards / cloud sync.** High score is local only.
- **Accessibility audio cues** for visually-impaired players. v2.
- **Reduced-motion mode.** The death animation and maze flash are mandatory; v2 could add a flag.
- **Skins / themes.** One maze, one palette.

---

## 17. Appendix: maze data format

The canonical maze, as one string in `src/data/maze.txt`. 31 lines, each exactly 28 characters wide. Whitespace is significant.

```
############################
#............##............#
#.####.#####.##.#####.####.#
#o####.#####.##.#####.####o#
#.####.#####.##.#####.####.#
#..........................#
#.####.##.########.##.####.#
#.####.##.########.##.####.#
#......##....##....##......#
######.##### ## #####.######
     #.##### ## #####.#     
     #.##          ##.#     
     #.## ###--### ##.#     
######.## #HHHHHH# ##.######
TTTTTT.   #HHHHHH#   .TTTTTT
######.## #HHHHHH# ##.######
     #.## ######## ##.#     
     #.##          ##.#     
     #.## ######## ##.#     
######.## ######## ##.######
#............##............#
#.####.#####.##.#####.####.#
#o..##................##..o#
###.##.##.########.##.##.###
###.##.##.########.##.##.###
#......##....##....##......#
#.##########.##.##########.#
#.##########.##.##########.#
#..........................#
############################
                            
```

Counts produced by parsing this string:

- pellets (`.`): **240**
- power pellets (`o`): **4**
- walls (`#`): all wall tiles
- ghost-house interior (`H`): 6 tiles (2 wide x 3 tall)
- door (`-`): 2 tiles centered above the house
- tunnel padding (`T`): 12 tiles on row 14 (6 per side outside the visible region)

If any count is off after editing `maze.txt`, the loader throws and the game refuses to start. This is intentional — bad maze data must be a build-time failure, not a runtime mystery.

---

## Quick reference: numeric constants

For the busy developer:

```ts
export const TILE_SIZE = 8;                 // pixels
export const GRID_W = 28;                   // tiles
export const GRID_H = 31;                   // tiles
export const PLAYFIELD_W = GRID_W * TILE_SIZE;   // 224
export const PLAYFIELD_H = GRID_H * TILE_SIZE;   // 248
export const HUD_TOP_H = 24;                // 3 tiles
export const HUD_BOTTOM_H = 16;             // 2 tiles
export const CANVAS_H = HUD_TOP_H + PLAYFIELD_H + HUD_BOTTOM_H; // 288
export const CANVAS_W = PLAYFIELD_W;        // 224
export const TICK_HZ = 60;
export const TICK_MS = 1000 / 60;
export const FULL_SPEED_PX_PER_TICK = 1.0;  // 100% speed; multiply by table fraction
export const STARTING_LIVES = 3;
export const EXTRA_LIFE_THRESHOLD = 10_000;
export const PELLET_POINTS = 10;
export const POWER_PELLET_POINTS = 50;
export const GHOST_CHAIN_POINTS = [200, 400, 800, 1600] as const;
export const TOTAL_PELLETS = 240;
export const FRUIT_TRIGGER_THRESHOLDS = [70, 170] as const;
export const FRUIT_LIFETIME_TICKS_MIN = 9 * 60;
export const FRUIT_LIFETIME_TICKS_MAX = 10 * 60;
export const CORNER_CUT_PIXELS = 2;
export const COLLISION_USES_TILE_EQUALITY = true;
export const NO_UP_TILES: ReadonlyArray<[number, number]> =
  [[12, 14], [15, 14], [12, 26], [15, 26]];
export const GHOST_HOUSE_DOOR_TILE: [number, number] = [13, 11];
export const BLINKY_START_TILE: [number, number] = [13, 11];  // outside, above door
export const PINKY_START_TILE:  [number, number] = [13, 14];
export const INKY_START_TILE:   [number, number] = [11, 14];
export const CLYDE_START_TILE:  [number, number] = [15, 14];
export const HOME_CORNERS = {
  blinky: [25, 0],
  pinky:  [2, 0],
  inky:   [27, 29],
  clyde:  [0, 29],
} as const;
```

If you implement to this spec, you will have an arcade-faithful Pac-Man. The remaining work is polish: render quality, input feel, the small visual flourishes that make it feel like a real arcade port instead of a programming exercise. Those are not in this document because they are not specifiable — they are taste and iteration.
