# Snake Engineering Specification

This document specifies the implementation of Snake as a web-based game inside a routed SPA. The game itself is framework-agnostic. Only the host shell (routing, navigation chrome) is expected to come from a framework decision made elsewhere.

## 1. Board model

### Dimensions

The board is a rectangular grid of cells. Recommended defaults:

- **20 x 20** — square, classic feel, fits a 600x600 canvas at 30px per cell.
- **24 x 16** — widescreen, fits a 720x480 canvas at 30px per cell, more comfortable on landscape phones and laptops.

The recommendation is **20 x 20** as the default for desktop and **24 x 16** as the default for landscape mobile. Both should be configurable. Dimensions outside the range 10..40 in either axis are not supported in v1.

### Cell states

Each cell holds one of:

- `EMPTY` — nothing.
- `SNAKE_BODY` — occupied by a non-head, non-tail segment.
- `SNAKE_HEAD` — occupied by the head segment.
- `SNAKE_TAIL` — occupied by the tail segment.
- `FOOD` — standard food.
- `BONUS` — bonus food.

For collision-detection purposes, `SNAKE_HEAD`, `SNAKE_BODY`, and `SNAKE_TAIL` are treated identically (the head landing on the tail is a death even though the tail will move away this tick, because the head check resolves before the tail vacates). The distinction exists for rendering only.

A simple representation is a `Uint8Array` of length `width * height` with the cell-state enum as the byte value.

### Coordinate system

- Origin `(0, 0)` is the top-left cell.
- `x` increases east (right), `y` increases south (down).
- Direction vectors:
  - `NORTH = (0, -1)`
  - `SOUTH = (0, +1)`
  - `EAST  = (+1, 0)`
  - `WEST  = (-1, 0)`

`indexOf(x, y) = y * width + x`.

## 2. Snake representation

### Options

**Option A — Deque of segments.** Maintain a `Deque<{x, y}>` (or two arrays simulating a deque). On each tick, push a new head, and (unless growing) pop the tail.

**Option B — Tail-pointer in grid.** Each cell stores the coordinates of the next segment toward the tail (and the head/tail coords are stored separately). Movement is a constant-time pointer update.

**Option C — Plain array used as a ring buffer.** Pre-allocate an array of size `width * height`; use head and tail indices that wrap.

### Comparison

| Aspect | Deque | Tail-pointer in grid | Ring buffer |
|--------|-------|----------------------|-------------|
| Move cost | O(1) push + O(1) pop | O(1) pointer update | O(1) increment |
| Self-collision check | requires set or scan, OR rely on grid cell-state | O(1) via grid cell-state | O(1) via grid cell-state |
| Memory | O(L) segments | O(W*H) grid + 2 ptrs | O(W*H) buffer + 2 ptrs |
| Iteration for render | trivial | trivial via pointer walk | trivial |
| Implementation complexity | low | medium | low |

### Recommendation

Use **Option A (deque) backed by a separate grid for cell state**. The grid is the source of truth for collision; the deque is the source of truth for ordering (head, body sequence, tail). This is the simplest model that gives O(1) per tick for both movement and collision, at the cost of `O(W*H)` for the grid and `O(L)` for the deque. For 20x20 boards this is trivial.

Concretely:

```
class Snake {
  segments: Deque<{x, y}>   // head at front, tail at back
  direction: Direction
  pendingGrowth: number     // segments to grow over the next ticks
}
```

### Head, body, tail handling

- **Head**: `segments.front()`.
- **Tail**: `segments.back()`.
- **Body**: everything between.

Each tick:

1. Compute new head `H' = head + direction`.
2. Determine if `H'` is food, bonus, body, or wall.
3. If food: `pendingGrowth += 1`, consume food, spawn next food.
4. If bonus: `pendingGrowth += 1` (or `0` if you choose not to grow on bonus — design choice; the spec says bonus does not grow further, so use `0`), award bonus points.
5. If body: die.
6. If wall: die (classic) or wrap (wrap mode).
7. Otherwise empty: normal move.
8. Push `H'` onto front of deque, update grid cell at `H'` to `SNAKE_HEAD`. Update what was previously the head cell to `SNAKE_BODY`.
9. If `pendingGrowth > 0`: decrement; do not pop tail. Else: pop tail, set its grid cell to `EMPTY`. Update new tail cell to `SNAKE_TAIL`.

### Length tracking

`snake.length === segments.size()`. Growth is queued (`pendingGrowth`) so that even multiple-food edge cases (eating food on consecutive ticks) are handled deterministically. After eating, the snake visibly grows on the next tick — the tail does not slide on the eating tick.

## 3. Movement

### Tile-stepping

Snake is a strictly discrete-motion game. There is no sub-tile movement in the game logic. The snake's position changes only at tick boundaries.

### One cell per tick

The simulation advances by exactly one cell per tick, in the current direction. The tick rate is governed by the game loop (see Section 4).

### Direction queue

Direction inputs are buffered to allow sharp turns:

```
class DirectionQueue {
  buffer: Direction[]   // max length 2
  enqueue(dir): void    // ignored if would reverse last committed/queued
  dequeue(): Direction | null
}
```

On each tick:

1. If the queue is non-empty, dequeue a direction; otherwise reuse current direction.
2. Set this as the new current direction.
3. Advance the snake.

Buffering depth of 2 is the recommended default. Depth 1 makes diagonal-corner inputs feel laggy; depth 3+ accepts inputs the player has already forgotten about.

### 180-degree reversal guard

A direction `D'` is rejected if `D'` is the opposite of:

- The currently committed direction, **if the queue is empty**, OR
- The last direction in the queue, **if the queue is non-empty**.

This second clause matters. Without it, a player who is moving east could press north then south on the same tick — both legal individually — but the south input would reverse the now-queued north and put the snake immediately into its own body. The guard must consult the queue tail, not just the live direction.

Pseudocode:

```
enqueue(D'):
  last = queue.isEmpty() ? snake.direction : queue.back()
  if D' == opposite(last): return  // reject
  if queue.size() >= MAX: return   // drop
  queue.pushBack(D')
```

## 4. Game loop

### Fixed-timestep tick

Use `requestAnimationFrame` to drive the render loop, but step the simulation on a fixed-interval accumulator:

```
let lastTime = performance.now()
let accumulator = 0

function frame(now) {
  const dt = now - lastTime
  lastTime = now
  if (!paused) {
    accumulator += dt
    while (accumulator >= tickInterval) {
      simulationTick()
      accumulator -= tickInterval
    }
  }
  render(now)
  requestAnimationFrame(frame)
}
```

This is frame-rate independent. On a 144Hz display the render runs at 144Hz, but the simulation still ticks at the configured rate. On a slow frame, the accumulator catches up (with a cap — see below).

### Catch-up cap

If `dt` exceeds, say, `500ms` (tab was backgrounded), clamp it to one tick interval to avoid the snake teleporting forward after a long pause. Alternative: detect `visibilitychange` and auto-pause when the document becomes hidden.

### Tick interval and speed curve

- **Starting interval**: 200ms.
- **Decrement**: -10ms every 5 foods eaten.
- **Floor**: 60ms.

Equivalent formula:

```
tickInterval = max(60, 200 - 10 * floor(foodsEaten / 5))
```

The curve is monotonically non-increasing and bottoms out around 60 foods.

### Pause / resume

A `paused` boolean gates the simulation step. The render loop continues to run so that pause overlays can animate. Resuming does not flush a backlog of ticks — the accumulator is zeroed on resume.

## 5. Food spawning

### Goal

Place a food on a uniformly random empty cell.

### Algorithm A — Rejection sampling

```
do:
  x = randInt(0, width)
  y = randInt(0, height)
while grid[x, y] != EMPTY
place food at (x, y)
```

Simple, no extra state. Expected attempts = `total / empty`. When the board is mostly empty (early game), this is one or two tries. When the board fills up (long snake), it degrades to O(total / empty) per spawn.

### Algorithm B — Tracked empty-cell list

Maintain a `Set<index>` or array of empty cells. When the snake vacates a cell, add it; when the snake enters, remove it. Spawning is `O(1)` (pick a random index from the array). Updates are amortized O(1).

If using an array with random-index removal: swap-and-pop. Maintain an `index-to-arrayPosition` map to make removal O(1).

### Comparison and recommendation

| Fill ratio | Rejection sampling | Tracked list |
|------------|--------------------|--------------|
| < 50%      | very fast          | fast         |
| 50-90%     | acceptable         | fast         |
| > 90%      | slow (many retries)| fast         |

For default board sizes (20x20 = 400 cells), even a snake of length 200 with rejection sampling averages ~2 attempts per spawn. **Use rejection sampling for v1.** It is simpler and the overhead is negligible at supported board sizes. If larger boards or endgame fill become a concern, switch to Algorithm B.

Edge case: if zero empty cells remain, do not attempt to spawn — trigger the "board cleared" victory state.

### Bonus food

- Spawned after a random number of standard foods eaten, jittered in `[8, 15]`.
- Lifetime: 8 seconds (track via wall clock or tick count — wall clock is cleaner because pausing the simulation should pause the bonus timer too; gate the timer on `!paused`).
- Higher score: +50 (vs. +10 standard).
- Visually distinct (different color, optional pulse).
- Only one bonus food may exist at a time.
- Despawns silently if its timer expires.

## 6. Collision

Collision is resolved on the head cell after its new position is computed, before the tail vacates.

### Head vs wall

- **Classic mode**: if `H'.x < 0 || H'.x >= width || H'.y < 0 || H'.y >= height`, the snake dies.
- **Wrap mode**: replace `H'` with `((H'.x + width) % width, (H'.y + height) % height)` before the body check.

### Head vs body

After the wall check (and wrap correction if applicable), inspect `grid[H'.x, H'.y]`:

- If it is any of `SNAKE_BODY`, `SNAKE_HEAD` (impossible by construction unless the snake is length 1, which it never is post-init), or `SNAKE_TAIL`: the snake dies.

The tail edge case (head moving into the cell the tail is about to vacate) is **a death**, because the tail check resolves after the head check. This matches the canonical Nokia behavior. If you want to allow it, you would need to special-case: if `H' == tail` and the snake is not growing this tick, treat it as empty. The spec leaves this off.

### Head vs food

If `grid[H'.x, H'.y] == FOOD`:

- Consume food (clear cell, schedule new spawn).
- `pendingGrowth += 1`.
- `score += 10`.
- Decrement food counter for tick-interval recomputation.
- Check length bonus thresholds.

If `grid[H'.x, H'.y] == BONUS`:

- Consume bonus.
- `pendingGrowth += 0` (does not grow further beyond the standard food's growth — spec choice).
- `score += 50`.
- Cancel bonus expiry timer.

## 7. Rendering

### Canvas vs DOM grid

**Canvas (recommended).** A single `<canvas>` element. Each tick, clear and redraw the snake, food, and bonus. Total draw cost is O(L + 1 + 1) rects per frame, trivial on any device. Smooth interpolation is straightforward via per-frame interpolation between the previous and current tile positions.

**DOM grid.** A `<div>` per cell, toggling class names. Easy to style with CSS but expensive (`W*H` style writes per tick) and awkward for animation between cells.

Use canvas. DOM is fine only as a fallback for very-low-end environments.

### Render order

Each frame:

1. Clear canvas (`fillRect` with background color).
2. Optionally draw a faint grid.
3. Draw food (and bonus if present).
4. Draw snake body segments.
5. Draw snake head (slightly distinct — different shade, eye dots, or a chevron in the movement direction).
6. Draw HUD overlays (score, pause icon) — or render HUD as separate DOM elements above the canvas; both work.

### Smooth interpolation (optional polish)

Game logic remains discrete, but render positions can be interpolated. Each frame, given the accumulator's progress toward the next tick (`alpha = accumulator / tickInterval`, clamped to `[0, 1]`):

```
renderX = prevX + (currX - prevX) * alpha
renderY = prevY + (currY - prevY) * alpha
```

Store each segment's previous position alongside its current position. Update `prev` to `curr` at the start of each simulation tick, then set `curr` after the move.

For the tail in a non-growing tick, the segment that just vacated needs to interpolate out of its cell. Handle this by keeping the tail's previous cell as `prevX/prevY` for one frame.

In wrap mode, interpolation across a wrap boundary must be suppressed: if the segment wrapped this tick, snap rather than interpolate (or interpolate both off-screen exit and on-screen entry).

This polish is recommended but optional; ship without it in v1 if time-constrained.

### Pulse animation for food

Modulate the food's radius (if rendered as a circle) or alpha by `sin(now * 2pi / 1000)`. Bonus food can pulse faster and also tint between two colors. Pure render-side effect; does not interact with simulation.

### Viewport scaling

The canvas internal resolution is `width * cellSize` by `height * cellSize` (e.g. 600x600 for 20x20 at 30px). The CSS size is fit to the container with `object-fit: contain` semantics:

- Compute the largest integer `cellSize` such that `width*cellSize <= container.width` and `height*cellSize <= container.height`.
- Apply this via CSS `transform: scale()` or by sizing the canvas element directly.

Use `devicePixelRatio` for crisp rendering on high-DPI displays: set the canvas backing-store size to `cssSize * dpr` and scale the 2D context by `dpr`.

## 8. Input

### Keyboard

Attach a global `keydown` listener on `window`. Map keys:

```
ArrowUp, KeyW -> NORTH
ArrowDown, KeyS -> SOUTH
ArrowLeft, KeyA -> WEST
ArrowRight, KeyD -> EAST
Space -> togglePause
Enter -> restartIfGameOver
Escape -> exitToMenu
```

Call `directionQueue.enqueue(...)` for direction keys. Call `e.preventDefault()` for the arrow keys so the page doesn't scroll.

### Touch swipe

Attach `touchstart`, `touchmove`, `touchend` listeners on the canvas (or its container).

```
on touchstart: record startX, startY
on touchend:
  dx = endX - startX
  dy = endY - startY
  if max(|dx|, |dy|) < 20: ignore  // tap, not swipe
  if |dx| > |dy|:
    enqueue(dx > 0 ? EAST : WEST)
  else:
    enqueue(dy > 0 ? SOUTH : NORTH)
```

Mid-gesture `touchmove` can be ignored, or used to detect partial swipes for responsiveness — for v1, end-of-gesture is sufficient.

Apply `touch-action: none` to the canvas element to suppress browser scrolling and double-tap zoom.

### Input buffering

The direction queue (Section 3) accepts up to 2 pending direction changes. Additional inputs while the queue is full are dropped silently.

## 9. Scoring

### Point values

- Standard food: +10
- Bonus food: +50
- Length bonus: +25 each time the snake's length crosses a multiple of 10 (length 10, 20, 30, ...)

### High score

Persisted under a single `localStorage` key:

```
localStorage.setItem('snake:bestScore', String(bestScore))
```

On game over: compare `score > bestScore`. If so, update both state and `localStorage`. If `localStorage` is unavailable (private mode, disabled), degrade gracefully — keep the best score in memory only and never throw.

If modes are independently scored, namespace the key:

```
snake:bestScore:classic
snake:bestScore:wrap
```

## 10. Modes

Mode is a single config flag passed to the game on start:

```
type GameConfig = {
  width: number
  height: number
  mode: 'classic' | 'wrap'
  startingTickInterval: number
  initialLength: number
  // ... etc
}
```

The mode flag is consulted **only** in the wall-collision step. Do not fork the code path. A `wrapPosition(x, y)` helper either returns the wrapped coordinates (wrap mode) or returns `null` to signal death (classic mode):

```
function wrapOrDie({x, y}): {x, y} | null {
  if (mode === 'wrap') {
    return {
      x: (x + width) % width,
      y: (y + height) % height,
    }
  }
  if (x < 0 || x >= width || y < 0 || y >= height) return null
  return {x, y}
}
```

Everything else — collision, growth, rendering — is mode-agnostic.

## 11. Module layout

Framework-agnostic core, separated from any UI shell. The host app is a routed SPA; the framework is TBD. The game exports a self-contained `Game` class (or a set of pure functions plus an orchestrator). The host mounts a canvas into the route's container, hands it to `Game`, and binds menu UI to its public API.

```
src/games/snake/
  index.ts              // public API: createGame(canvas, config) -> Game
  game.ts               // Game class: lifecycle (start, pause, resume, stop)
  state.ts              // Board, Snake, mutable state; pure update functions
  input.ts              // KeyboardInput, TouchInput; direction queue
  food.ts               // food spawner, bonus food lifecycle
  loop.ts               // fixed-timestep loop wrapper
  renderer.ts           // canvas rendering, interpolation, DPR handling
  scoring.ts            // score logic, high-score persistence
  config.ts             // default config, mode flag, tick-interval curve
  types.ts              // shared types: Direction, CellState, Mode, etc.
  __tests__/
    state.test.ts
    food.test.ts
    input.test.ts
    scoring.test.ts
```

The host SPA provides:

- A route mounting `<SnakePage />` (or framework equivalent).
- A page component that:
  - Renders a `<canvas>` and a HUD (score, best score, speed indicator).
  - Calls `createGame(canvas, config)` on mount, `game.stop()` on unmount.
  - Listens to `game.events` (`onScoreChange`, `onGameOver`) and updates HUD/modal state.
- A main menu (mode select, start button).
- A game-over modal with replay and main-menu buttons.

Game core has zero framework imports. It accepts a canvas element and emits events via a small `EventEmitter` (or a passed-in callback object). Renderer, input, and loop talk only to the DOM canvas and the `window` object — both freely replaceable for testing or for non-browser hosts.

## 12. Testing

Use a standard JS test runner (Vitest, Jest). The pure-function modules are the priority. The renderer and host integration are checked manually or with a separate visual harness.

### Movement

- Snake moves one cell in the direction set.
- After a turn, the head moves in the new direction on the next tick.
- Body segments follow in order.
- Tail vacates correctly on non-growth ticks.

### Collision

- Head into wall (classic): game over.
- Head into wall (wrap): no game over; head reappears on opposite edge.
- Head into body segment: game over.
- Head into food cell: no game over; food consumed; growth pending.
- Head into the cell the tail is about to vacate: game over (per spec choice).

### Growth

- Eating one food increases length by 1 on the next tick.
- Eating two foods in two consecutive ticks increases length by 2.
- `pendingGrowth` is consumed correctly.

### Food spawning

- Spawned food is always on an `EMPTY` cell.
- Distribution sanity: over 10,000 spawns on an empty board, distribution across cells is approximately uniform (chi-squared test, p > 0.05).
- When the board has only one empty cell, the food spawns there.
- When the board has zero empty cells, the spawner triggers the victory state.

### Direction queue (180-degree guard)

- Reversing into the live direction is rejected.
- Reversing into the queue's last direction is rejected (the subtle case).
- Queue is capped at 2 entries; further inputs are dropped.
- Queue drains one entry per tick.

### Scoring

- +10 per standard food, +50 per bonus.
- Length bonus +25 fires exactly once per length threshold.
- High-score persistence: writes to `localStorage`, restores on next session, namespaces by mode.

### Speed curve

- Tick interval decreases per the formula at the right thresholds.
- Tick interval floors at 60ms.

### Pause

- Simulation does not advance while paused.
- Bonus food timer does not advance while paused.
- Accumulator is zeroed on resume.

## 13. Out of scope for v1

The following are explicitly deferred:

- Multiplayer (local or networked).
- AI opponent (Tron-style).
- Portals (teleport pairs on the board).
- Obstacles (static walls inside the play area).
- Themes (multiple palettes, skins, custom sprites).
- Audio beyond a basic eat-click and death-tone (deferred unless trivial).
- Mobile-specific UI chrome beyond a pause button and swipe input.
- Save / resume across browser sessions (only high score is persisted).
- Leaderboards or score submission.

Anything above can be built as an additive layer over the v1 module boundaries without rewriting the core.
