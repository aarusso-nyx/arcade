# Tetris — Engineering Specification

This document specifies the implementation of a Guideline-compliant, single-player Marathon Tetris module suitable for embedding in a routed SPA. It is opinionated: where the Guideline permits variation, this spec picks one option and locks it in. Where the Guideline is silent, this spec picks defaults consistent with the most widely deployed modern implementations (Tetris Effect, Puyo Puyo Tetris, Jstris, TETR.IO).

A competent dev should be able to implement this without further research. Where additional reading is helpful for context (the Guideline is not freely published in full), the relevant community references are the [Tetris Wiki](https://tetris.wiki) SRS, scoring, and randomizer pages.

---

## 1. High-level architecture

The game is a **self-contained module** that mounts into a single DOM node provided by the host SPA. The module owns:

- A `<canvas>` element (or several, see § Rendering) inserted into the host node.
- A keyboard event listener attached to `window` (with proper teardown).
- A `requestAnimationFrame` loop.
- A snapshot of game state and a high-score read/write to `localStorage` under a namespaced key.

The module exposes:

```ts
interface TetrisModule {
  mount(host: HTMLElement, opts?: TetrisOptions): void;
  unmount(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  on(event: 'gameOver' | 'lineClear' | 'levelUp' | 'score', cb: (payload: any) => void): () => void;
}
```

The host SPA is responsible for routing the user to and from the game page and for providing the mount node. The game does not assume React, Vue, Svelte, Solid, or any specific framework. The module is plain TypeScript and ESM.

### Module boundaries

The codebase is partitioned into the following modules. Each module owns one concern and has narrow imports.

```
src/games/tetris/
  index.ts                    # public TetrisModule entry point, mount/unmount
  config.ts                   # all tunables (DAS, ARR, lock delay, etc.)
  engine/
    board.ts                  # playfield grid, collision, line detection, clears
    piece.ts                  # active piece state (type, rotation, position)
    pieces.ts                 # tetromino shape definitions in all 4 rotations
    srs.ts                    # SRS wall-kick tables, rotation resolution
    randomizer.ts             # 7-bag implementation
    scoring.ts                # line-clear scoring, T-spin detection, B2B, combo
    gravity.ts                # gravity curve, level → rows-per-frame lookup
    lock.ts                   # lock-delay state machine
    state.ts                  # GameState type, reducers, top-out checks
  input/
    keyboard.ts               # raw keyboard events → InputAction stream
    das.ts                    # DAS/ARR state machine
  render/
    canvas.ts                 # canvas setup, scaling, viewport
    renderBoard.ts            # background, locked stack
    renderPiece.ts            # active piece, ghost
    renderUI.ts               # score, level, lines, next, hold panels
    palette.ts                # Guideline colors
    particles.ts              # line-clear flash and shear (optional)
  loop.ts                     # fixed-timestep tick + variable render loop
  persistence.ts              # localStorage high-score read/write
  events.ts                   # tiny pub/sub for on() above
  __tests__/
    board.test.ts
    srs.test.ts
    randomizer.test.ts
    scoring.test.ts
    gravity.test.ts
    lock.test.ts
```

No file in `engine/` may import from `render/` or `input/`. No file in `render/` may import from `input/`. This enforces a unidirectional flow: input → engine → render.

---

## 2. Playfield

### Dimensions

- **Visible play area:** 10 columns wide, 20 rows tall.
- **Buffer area:** 20 additional rows above the visible area, for spawning and rotation. Buffer rows are part of the engine grid; only the visible rows are rendered.
- **Total grid:** 10 columns × 40 rows.

### Coordinate system

- Origin `(0, 0)` is the **top-left** of the buffer area (the topmost, leftmost cell of the entire grid).
- `x` increases rightward, range `[0, 9]`.
- `y` increases **downward**, range `[0, 39]`. Visible rows are `y ∈ [20, 39]`. Buffer rows are `y ∈ [0, 19]`.
- A piece's position is the position of its rotation pivot (a piece-local origin); see § Tetrominoes for per-piece pivot offsets.

We deliberately use `y` increases downward to match the canvas coordinate system. Some specs use `y` increases upward; do not.

### Cell state

A cell holds one of:

- `0` — empty.
- A piece identifier, one of `'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'`, indicating a locked block of that color.

The active piece is **not** stored in the grid; it is stored separately and only written to the grid at lock time. The ghost piece is never stored in the grid.

```ts
type Cell = 0 | 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
type Grid = Cell[][]; // grid[y][x], y ∈ [0,39], x ∈ [0,9]
```

The grid is row-major: outer index is `y`, inner is `x`. This makes per-row operations (line detection, line clear, row collapse) cheap.

---

## 3. Tetrominoes

There are seven pieces. Each piece exists in four rotation states, indexed `0`, `R`, `2`, `L` (spawn, right, 180, left).

Each piece's shape is defined as a 4×4 (I and O use a smaller bounding box logically but we represent everything in a 4×4 for uniformity in code, then trim at draw time — or use 3×3 for J/L/S/T/Z and 4×4 for I and 2×2 for O; both are valid, the SRS rotation math requires the larger bounding box for I).

For SRS correctness, the most reliable representation is:

- **I:** 4×4 bounding box.
- **O:** 2×2 bounding box (no rotation effect, but we still cycle states for hold-orientation consistency).
- **J, L, S, T, Z:** 3×3 bounding box.

The rotation origin (pivot) is at the center of the bounding box for J, L, S, T, Z (cell `(1, 1)` of the 3×3 box) and at a specific corner for I (see SRS wall-kicks). For O, rotation is a no-op visually but still cycles the rotation state for completeness.

### Spawn orientations

All pieces spawn in rotation state `0`. The spawn position places the piece horizontally centered (or as close as possible) and with its topmost cell at row `y = 19` for J/L/S/T/Z (top of the buffer area, just above the visible area) and `y = 18` for I (because I's bounding box is taller, we want its visible row at row 20). The O piece spawns in columns 4–5.

Concretely, on spawn:

| Piece | Bounding box origin (top-left) `(x, y)` |
| ----- | --------------------------------------- |
| I     | `(3, 18)`                               |
| O     | `(4, 19)`                               |
| T     | `(3, 19)`                               |
| S     | `(3, 19)`                               |
| Z     | `(3, 19)`                               |
| J     | `(3, 19)`                               |
| L     | `(3, 19)`                               |

The first downward gravity step moves them into the visible playfield. If the spawn position overlaps an existing locked cell, the game ends (block-out).

### Shape tables

Each shape is a list of `(x, y)` cell offsets from the bounding box top-left, for each of four rotation states. Use these directly; do not generate them via runtime rotation, because SRS's I-piece rotation is asymmetric and runtime rotation will produce subtly wrong cells.

#### I piece (cyan)

```
State 0:                State R:                State 2:                State L:
. . . .                 . . X .                 . . . .                 . X . .
X X X X                 . . X .                 . . . .                 . X . .
. . . .                 . . X .                 X X X X                 . X . .
. . . .                 . . X .                 . . . .                 . X . .

cells:                  cells:                  cells:                  cells:
(0,1)(1,1)(2,1)(3,1)    (2,0)(2,1)(2,2)(2,3)    (0,2)(1,2)(2,2)(3,2)    (1,0)(1,1)(1,2)(1,3)
```

#### O piece (yellow)

```
State 0 (and R, 2, L are identical):
X X
X X

cells: (0,0)(1,0)(0,1)(1,1)
```

#### T piece (purple)

```
State 0:        State R:        State 2:        State L:
. X .           . X .           . . .           . X .
X X X           . X X           X X X           X X .
. . .           . X .           . X .           . X .

cells:          cells:          cells:          cells:
(1,0)(0,1)      (1,0)(1,1)      (0,1)(1,1)      (1,0)(0,1)
(1,1)(2,1)      (2,1)(1,2)      (2,1)(1,2)      (1,1)(1,2)
```

#### S piece (green)

```
State 0:        State R:        State 2:        State L:
. X X           . X .           . . .           X . .
X X .           . X X           . X X           X X .
. . .           . . X           X X .           . X .

cells:          cells:          cells:          cells:
(1,0)(2,0)      (1,0)(1,1)      (1,1)(2,1)      (0,0)(0,1)
(0,1)(1,1)      (2,1)(2,2)      (0,2)(1,2)      (1,1)(1,2)
```

#### Z piece (red)

```
State 0:        State R:        State 2:        State L:
X X .           . . X           . . .           . X .
. X X           . X X           X X .           X X .
. . .           . X .           . X X           X . .

cells:          cells:          cells:          cells:
(0,0)(1,0)      (2,0)(1,1)      (0,1)(1,1)      (1,0)(0,1)
(1,1)(2,1)      (2,1)(1,2)      (1,2)(2,2)      (1,1)(0,2)
```

#### J piece (blue)

```
State 0:        State R:        State 2:        State L:
X . .           . X X           . . .           . X .
X X X           . X .           X X X           . X .
. . .           . X .           . . X           X X .

cells:          cells:          cells:          cells:
(0,0)(0,1)      (1,0)(2,0)      (0,1)(1,1)      (1,0)(1,1)
(1,1)(2,1)      (1,1)(1,2)      (2,1)(2,2)      (0,2)(1,2)
```

#### L piece (orange)

```
State 0:        State R:        State 2:        State L:
. . X           . X .           . . .           X X .
X X X           . X .           X X X           . X .
. . .           . X X           X . .           . X .

cells:          cells:          cells:          cells:
(2,0)(0,1)      (1,0)(1,1)      (0,1)(1,1)      (0,0)(1,0)
(1,1)(2,1)      (1,2)(2,2)      (2,1)(0,2)      (1,1)(1,2)
```

Encode these as a frozen lookup:

```ts
const SHAPES: Record<PieceType, ReadonlyArray<ReadonlyArray<readonly [number, number]>>> = {
  I: [
    [[0,1],[1,1],[2,1],[3,1]],  // 0
    [[2,0],[2,1],[2,2],[2,3]],  // R
    [[0,2],[1,2],[2,2],[3,2]],  // 2
    [[1,0],[1,1],[1,2],[1,3]],  // L
  ],
  // ... etc
};
```

### Color palette

Guideline colors, frozen:

```ts
const PALETTE: Record<PieceType, string> = {
  I: '#00F0F0',
  O: '#F0F000',
  T: '#A000F0',
  S: '#00F000',
  Z: '#F00000',
  J: '#0000F0',
  L: '#F0A000',
};
```

Renderers should darken these by ~25% for the inner fill and use the pure color for the outline, to give blocks a subtle bevel. The ghost piece uses the same color at 25% alpha with no inner fill.

---

## 4. Super Rotation System (SRS) and wall kicks

SRS is the Guideline-mandated rotation system. The behavior is:

1. Compute the piece's new cell positions in the target rotation state.
2. Try to place the rotated piece at its current position (the "0th kick" or identity test).
3. If that overlaps the wall, floor, or a locked cell, try **up to four additional offset tests** ("wall kicks"). The offsets depend on the piece type (I vs. everything else) and on the rotation transition (e.g., 0→R vs. 0→L).
4. The first offset that produces a valid (non-overlapping, in-bounds) placement is applied. If none of the five tests produces a valid placement, the rotation fails and the piece remains in its original state.

Kick offsets are applied as `(dx, dy)` translations to the piece's bounding-box origin. Note: by SRS convention, kick offsets are written as `(x, y)` with `y` **upward positive**. In our coordinate system (`y` increases downward), invert the `y` of every offset when applying.

### Kick tables — J, L, S, T, Z

These five pieces share one table.

| Transition | Test 1 (identity) | Test 2 | Test 3 | Test 4 | Test 5 |
| ---------- | ----------------- | ------ | ------ | ------ | ------ |
| 0 → R      | (0, 0)            | (-1, 0)| (-1, +1)| (0, -2)| (-1, -2)|
| R → 0      | (0, 0)            | (+1, 0)| (+1, -1)| (0, +2)| (+1, +2)|
| R → 2      | (0, 0)            | (+1, 0)| (+1, -1)| (0, +2)| (+1, +2)|
| 2 → R      | (0, 0)            | (-1, 0)| (-1, +1)| (0, -2)| (-1, -2)|
| 2 → L      | (0, 0)            | (+1, 0)| (+1, +1)| (0, -2)| (+1, -2)|
| L → 2      | (0, 0)            | (-1, 0)| (-1, -1)| (0, +2)| (-1, +2)|
| L → 0      | (0, 0)            | (-1, 0)| (-1, -1)| (0, +2)| (-1, +2)|
| 0 → L      | (0, 0)            | (+1, 0)| (+1, +1)| (0, -2)| (+1, -2)|

Recall: `+y` in the table means **upward** in SRS convention. Invert when applying to a `+y`-downward grid.

### Kick tables — I piece

The I piece has its own table because its bounding box is 4×4 and the pivot offsets differently.

| Transition | Test 1 (identity) | Test 2 | Test 3 | Test 4 | Test 5 |
| ---------- | ----------------- | ------ | ------ | ------ | ------ |
| 0 → R      | (0, 0)            | (-2, 0)| (+1, 0)| (-2, -1)| (+1, +2)|
| R → 0      | (0, 0)            | (+2, 0)| (-1, 0)| (+2, +1)| (-1, -2)|
| R → 2      | (0, 0)            | (-1, 0)| (+2, 0)| (-1, +2)| (+2, -1)|
| 2 → R      | (0, 0)            | (+1, 0)| (-2, 0)| (+1, -2)| (-2, +1)|
| 2 → L      | (0, 0)            | (+2, 0)| (-1, 0)| (+2, +1)| (-1, -2)|
| L → 2      | (0, 0)            | (-2, 0)| (+1, 0)| (-2, -1)| (+1, +2)|
| L → 0      | (0, 0)            | (+1, 0)| (-2, 0)| (+1, -2)| (-2, +1)|
| 0 → L      | (0, 0)            | (-1, 0)| (+2, 0)| (-1, +2)| (+2, -1)|

### O piece

The O piece does not have a kick table because rotation is a visual no-op. Implementations may either skip the kick attempt entirely or always succeed at test 1 with `(0, 0)`.

### 180-degree rotation

The Guideline does not specify a 180-degree rotation system. Many implementations support it via a separate kick table. This implementation supports 180 rotations with **no kicks** (single identity test): if it fits, it rotates; otherwise nothing happens. This is the simplest defensible behavior. If the host wants TETR.IO-style 180-kicks later, add a table; do not block v1 on it.

### Algorithm

```ts
function tryRotate(
  piece: ActivePiece,
  grid: Grid,
  direction: 'CW' | 'CCW' | '180'
): ActivePiece | null {
  const fromState = piece.rotation;
  const toState = nextState(fromState, direction);
  const kicks = getKickTable(piece.type, fromState, toState);
  for (const [dx, dy] of kicks) {
    const candidate = {
      ...piece,
      rotation: toState,
      x: piece.x + dx,
      y: piece.y - dy,           // invert because table is y-up
    };
    if (!collides(candidate, grid)) {
      return { ...candidate, lastMoveWasRotation: true, lastKickIndex: kicks.indexOf([dx, dy]) };
    }
  }
  return null;
}
```

Record `lastKickIndex` because T-spin detection needs to know whether the rotation used the 5th (last) kick offset — see § Scoring.

---

## 5. Randomizer — 7-bag

The randomizer is **7-bag** (also called "7-system" or "Random Generator" in the Guideline).

### Algorithm

```ts
class SevenBag {
  private bag: PieceType[] = [];

  constructor(private rng: () => number) {}

  next(): PieceType {
    if (this.bag.length === 0) this.refill();
    return this.bag.pop()!;
  }

  peek(n: number): PieceType[] {
    while (this.bag.length < n) this.refill();
    return this.bag.slice(-n).reverse();
  }

  private refill() {
    const fresh: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    // Fisher-Yates shuffle
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    // Prepend so we pop from the end
    this.bag = fresh.concat(this.bag);
  }
}
```

The `rng` is injected so tests can pass a seeded PRNG (mulberry32 or splitmix32 — anything deterministic and fast). Production uses `Math.random`.

### Why 7-bag

- **True random** can produce arbitrarily long droughts (no I-piece for 30 pieces). This is unfair in a way players notice immediately.
- **TGM history** (avoid recently-seen pieces, reroll up to N times) is fairer than true random but can still produce 2-3-piece droughts and is harder to reason about.
- **7-bag** caps the worst-case drought at 12 (last piece of one bag + skip the entire next bag → 6 + 6 = 12, but only if the same piece is first in one bag and last in the next, which is the worst case). Players can rely on this; it's the basis for several advanced opening patterns (e.g., "perfect clear openers").

The Guideline mandates 7-bag.

### Next queue

The next queue panel shows the next 5 pieces. Implement this by calling `bag.peek(5)` each frame (cheap; it just slices). Do not maintain a separate queue array; the bag is the queue.

---

## 6. Movement, rotation, and lock delay

### Translation

Left / right movement attempts to shift the piece by `(±1, 0)`. If the new position is in bounds and does not overlap a locked cell, the move succeeds. Otherwise it is rejected silently.

```ts
function tryTranslate(piece: ActivePiece, grid: Grid, dx: number): ActivePiece | null {
  const candidate = { ...piece, x: piece.x + dx };
  return collides(candidate, grid) ? null : { ...candidate, lastMoveWasRotation: false };
}
```

### DAS and ARR

**DAS (Delayed Auto-Shift)** is the delay between pressing a direction and the start of auto-repeat. **ARR (Auto-Repeat Rate)** is the interval between auto-repeats once started.

Defaults: DAS = **170 ms**, ARR = **30 ms**. Both should be configurable; expose them in `config.ts` but not in v1 UI.

State machine, per direction:

```
idle → keyDown → moveOnce, startDASTimer → DASTimer expires → moveOnce, startARRTimer
ARRTimer expires → moveOnce, restartARRTimer → ... → keyUp → idle
```

If ARR = 0, on DAS expiry the piece slides to the wall in a single frame (charge dash). This implementation supports ARR = 0.

Implementation note: process DAS/ARR in the input layer per **real time** (milliseconds), not per game tick. Input runs in the `requestAnimationFrame` callback and consumes `performance.now()` deltas.

### Soft drop

While the soft-drop key is held, gravity is multiplied by the **soft-drop factor** (default 20x). Award 1 point per cell descended this way. Soft drop does **not** bypass lock delay.

If `softDropFactor * baseGravity > 1`, multiple gravity steps may occur in a single frame; handle this by iterating gravity application until either the frame's accumulated row count is consumed or the piece comes to rest.

### Hard drop

`Space` triggers hard drop. Translate the piece downward repeatedly until the next downward step would collide. Award 2 points per cell descended. Lock the piece immediately, bypassing lock delay.

```ts
function hardDrop(piece: ActivePiece, grid: Grid): { piece: ActivePiece; cellsDropped: number } {
  let cells = 0;
  let p = piece;
  while (true) {
    const next = { ...p, y: p.y + 1 };
    if (collides(next, grid)) break;
    p = next;
    cells++;
  }
  return { piece: p, cellsDropped: cells };
}
```

### Lock delay state machine

When gravity would move the piece downward but the next downward step collides, the piece is **grounded**.

```
states:
  AIRBORNE
  GROUNDED (timer = 500ms, resetCount = 0..15)
  LOCKED   (terminal for the piece)

transitions:
  AIRBORNE:
    on gravity step that lands on stack → GROUNDED (timer = 500, resetCount = 0)
    on hard drop                        → LOCKED

  GROUNDED:
    on successful move/rotate that does NOT move down:
      if resetCount < 15: timer = 500, resetCount++
      else: ignore (do not reset; let current timer expire)
    on successful move/rotate that moves down (piece falls into a gap created by translation):
      → AIRBORNE  (and resetCount carries over, do NOT reset)
    on gravity step (timer == 0 → not allowed; this is handled below)
    on lock delay timeout                → LOCKED
    on hard drop                          → LOCKED
```

The `resetCount` carries across AIRBORNE re-entries from GROUNDED. This prevents an exploit where the player wiggles a piece into airborne, falls one row, and resets the counter. The counter is only reset on **piece spawn**.

Implementation:

```ts
interface LockState {
  grounded: boolean;
  timerMs: number;     // counts down from 500 while grounded
  resetCount: number;  // 0..15
}

function tickLock(state: LockState, dtMs: number, isGrounded: boolean): LockState {
  if (isGrounded && !state.grounded) {
    return { grounded: true, timerMs: 500, resetCount: state.resetCount };
  }
  if (!isGrounded && state.grounded) {
    return { ...state, grounded: false };
  }
  if (isGrounded) {
    return { ...state, timerMs: Math.max(0, state.timerMs - dtMs) };
  }
  return state;
}

function tryResetLock(state: LockState): LockState {
  if (!state.grounded) return state;
  if (state.resetCount >= 15) return state;
  return { ...state, timerMs: 500, resetCount: state.resetCount + 1 };
}
```

When `state.grounded && state.timerMs === 0`, the lock state machine signals lock. The engine then writes the piece into the grid, checks for line clears, scores, advances level, and spawns the next piece (or ends the game).

### Ghost piece

The ghost piece is computed on demand by running the hard-drop calculation without applying it:

```ts
function computeGhost(piece: ActivePiece, grid: Grid): ActivePiece {
  let p = piece;
  while (true) {
    const next = { ...p, y: p.y + 1 };
    if (collides(next, grid)) break;
    p = next;
  }
  return p;
}
```

Recompute every frame; it's cheap (worst case 40 iterations of a 4-cell collision check).

---

## 7. Game loop

### Fixed-timestep tick

The engine ticks at a **fixed 60 Hz** logical step. The renderer runs at whatever rate `requestAnimationFrame` provides. Decoupling these means a player on a 144 Hz monitor sees smoother visuals without the game running at 2.4x speed.

Pattern:

```ts
const TICK_MS = 1000 / 60;
let accumulator = 0;
let lastTime = performance.now();

function frame(now: number) {
  const dt = now - lastTime;
  lastTime = now;
  accumulator += Math.min(dt, 250); // clamp to avoid spiral of death on tab-switch
  while (accumulator >= TICK_MS) {
    tickEngine(TICK_MS, currentInputSnapshot());
    accumulator -= TICK_MS;
  }
  render(renderState());
  rafHandle = requestAnimationFrame(frame);
}
rafHandle = requestAnimationFrame(frame);
```

`tickEngine` is pure with respect to the input snapshot it receives, so the loop is deterministic given an input log — useful for replays (not in v1) and for unit testing.

### Gravity per tick

At the start of each tick, compute the current gravity in rows-per-tick. Multiply by soft-drop factor if soft-drop is held. Accumulate fractional rows; whenever the accumulated value crosses an integer, apply that many downward steps to the piece (clipping at collision).

```ts
const gravity = gravityForLevel(state.level); // rows per tick
const effective = isSoftDropping ? gravity * SOFT_DROP_FACTOR : gravity;
state.gravityAccumulator += effective;
while (state.gravityAccumulator >= 1) {
  state.gravityAccumulator -= 1;
  const moved = tryGravityStep(state);
  if (!moved) break; // grounded; let the rest of the accumulator be discarded? See below.
}
```

When grounded, **discard** the remainder of the gravity accumulator for the current tick rather than carrying it over. Otherwise at high levels (level 20+, gravity = 20/tick) the moment the player slides the piece into a gap it would teleport multiple rows down in the same tick, which is visually jarring and not what players expect.

### Frame-rate independence

The engine only consumes the fixed-step `TICK_MS`. The renderer interpolates if desired (not in v1 — interpolation looks fine for slow gravity but produces ghosting at high levels; not worth the complexity).

Lock-delay timer and DAS/ARR timers consume **real elapsed time** (`dt` from `performance.now()`), not ticks. This means lock delay is consistent at 500 ms regardless of frame rate.

---

## 8. Gravity curve

The gravity formula is:

```
secondsPerRow(level) = (0.8 - ((level - 1) * 0.007)) ^ (level - 1)
rowsPerTick(level)   = TICK_MS / 1000 / secondsPerRow(level)
                     = (1 / 60) / secondsPerRow(level)
```

Precompute and cache.

| Level | secondsPerRow | rowsPerTick (60 Hz) |
| ----- | ------------- | ------------------- |
| 1     | 1.00000       | 0.01667             |
| 2     | 0.79300       | 0.02102             |
| 3     | 0.61780       | 0.02698             |
| 4     | 0.47273       | 0.03525             |
| 5     | 0.35520       | 0.04691             |
| 6     | 0.26200       | 0.06361             |
| 7     | 0.18968       | 0.08787             |
| 8     | 0.13473       | 0.12369             |
| 9     | 0.09388       | 0.17753             |
| 10    | 0.06415       | 0.25988             |
| 11    | 0.04298       | 0.38784             |
| 12    | 0.02822       | 0.59072             |
| 13    | 0.01815       | 0.91854             |
| 14    | 0.01143       | 1.45895             |
| 15    | 0.00705       | 2.36608             |
| 16    | 0.00426       | 3.91574             |
| 17    | 0.00252       | 6.61744             |
| 18    | 0.00146       | 11.42204            |
| 19    | 0.00082       | 20.27737            |
| 20    | 0.00046       | clamp to 20.0       |
| 21+   | -             | clamp to 20.0       |

Clamp `rowsPerTick` at **20** (one full board height per tick) to avoid numerical absurdities at level 20+. By that level the piece is effectively at the floor on spawn and the game is purely a reaction test against lock delay.

Implementation:

```ts
const GRAVITY_TABLE: number[] = [];
for (let level = 1; level <= 30; level++) {
  const sec = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
  GRAVITY_TABLE[level] = Math.min(20, (1 / 60) / sec);
}

export function gravityForLevel(level: number): number {
  return GRAVITY_TABLE[Math.min(level, 30)];
}
```

---

## 9. Line clears

### Detection

After a lock, scan every row the piece occupied (at most 4 distinct rows). For each, check whether every cell in that row is non-zero. Collect the indices of full rows.

```ts
function detectFullRows(grid: Grid, rowsToCheck: number[]): number[] {
  return rowsToCheck.filter(y =>
    grid[y].every(cell => cell !== 0)
  );
}
```

### Animation

For 200 ms (12 ticks at 60 Hz), the cleared rows flash white. The engine pauses gravity and piece-spawning during this animation; input is queued but not applied to the (absent) active piece. After the animation, the cleared rows are removed, rows above collapse, and the next piece spawns.

Alternative: skip animation in v1 and just snap. Player feedback is preserved by the score popup and sound. For polish, implement the flash; it's a 50-line addition.

### Collapse

Remove the full rows and prepend equally many empty rows at the top:

```ts
function clearRows(grid: Grid, rows: number[]): Grid {
  const remaining = grid.filter((_, y) => !rows.includes(y));
  const emptyRow = (): Cell[] => new Array(10).fill(0);
  return [...Array(rows.length).fill(0).map(emptyRow), ...remaining];
}
```

The grid stays 40 rows tall.

---

## 10. Scoring

### Point values

```ts
const BASE_POINTS = {
  single:        100,
  double:        300,
  triple:        500,
  tetris:        800,
  tspinMini:     100,
  tspinMiniSingle: 200,
  tspin:         400,
  tspinSingle:   800,
  tspinDouble:   1200,
  tspinTriple:   1600,
};
const B2B_MULTIPLIER = 1.5;
const COMBO_BASE = 50;
const SOFT_DROP_POINTS = 1;
const HARD_DROP_POINTS = 2;
```

### T-spin detection (three-corner rule)

A lock counts as a T-spin if:

1. `piece.type === 'T'`.
2. `piece.lastMoveWasRotation === true` (the last successful move was a rotation, not a translation, not a gravity step).
3. At least 3 of the 4 cells diagonally adjacent to the T's center are filled. "Filled" means a wall, the floor, or a locked cell.

The T's center cell is `(piece.x + 1, piece.y + 1)` (center of the 3×3 bounding box). The four diagonal corners are at offsets `(0,0), (2,0), (0,2), (2,2)` from the bounding box origin.

```ts
function detectTSpin(piece: ActivePiece, grid: Grid): 'none' | 'mini' | 'full' {
  if (piece.type !== 'T') return 'none';
  if (!piece.lastMoveWasRotation) return 'none';
  const cx = piece.x + 1, cy = piece.y + 1;
  const corners = [
    [piece.x,     piece.y],     // top-left
    [piece.x + 2, piece.y],     // top-right
    [piece.x,     piece.y + 2], // bottom-left
    [piece.x + 2, piece.y + 2], // bottom-right
  ];
  const filled = corners.map(([x, y]) =>
    x < 0 || x >= 10 || y < 0 || y >= 40 || grid[y][x] !== 0
  );
  const filledCount = filled.filter(Boolean).length;
  if (filledCount < 3) return 'none';
  if (piece.lastKickIndex === 4) return 'full'; // last kick → always full
  // Front corners are the two on the side the T points to
  const front = frontCornersForRotation(piece.rotation); // returns indices into `filled`
  const frontFilled = front.filter(i => filled[i]).length;
  return frontFilled >= 2 ? 'full' : 'mini';
}

function frontCornersForRotation(r: Rotation): [number, number] {
  switch (r) {
    case '0': return [0, 1]; // T pointing up → front is top
    case 'R': return [1, 3]; // pointing right → front is right
    case '2': return [2, 3]; // pointing down → front is bottom
    case 'L': return [0, 2]; // pointing left → front is left
  }
}
```

### Back-to-back

Track a single boolean `b2bActive`. A "difficult" clear is a Tetris or any T-spin line clear (including T-spin Single, Double, Triple, and Mini T-spin Single).

```
After scoring a clear:
  if linesCleared === 0:
    // T-spin-no-lines: neither sets nor breaks B2B
    no change
  else if isDifficult:
    apply B2B 1.5x multiplier if b2bActive was already true
    b2bActive = true
  else:
    b2bActive = false
```

### Combo

Track an integer `combo`, initialized to -1.

```
After a lock:
  if linesCleared >= 1:
    combo += 1
    if combo >= 1:
      bonus = COMBO_BASE * combo * level
      add bonus to score
  else:
    combo = -1
```

### Full scoring procedure

```ts
function scoreLock(state: GameState, piece: ActivePiece, linesCleared: number, tspin: 'none' | 'mini' | 'full'): ScoreUpdate {
  let basePoints = 0;
  let isDifficult = false;

  if (tspin === 'full') {
    if (linesCleared === 0) basePoints = BASE_POINTS.tspin;
    else if (linesCleared === 1) { basePoints = BASE_POINTS.tspinSingle; isDifficult = true; }
    else if (linesCleared === 2) { basePoints = BASE_POINTS.tspinDouble; isDifficult = true; }
    else if (linesCleared === 3) { basePoints = BASE_POINTS.tspinTriple; isDifficult = true; }
  } else if (tspin === 'mini') {
    if (linesCleared === 0) basePoints = BASE_POINTS.tspinMini;
    else if (linesCleared === 1) { basePoints = BASE_POINTS.tspinMiniSingle; isDifficult = true; }
  } else {
    if (linesCleared === 1) basePoints = BASE_POINTS.single;
    else if (linesCleared === 2) basePoints = BASE_POINTS.double;
    else if (linesCleared === 3) basePoints = BASE_POINTS.triple;
    else if (linesCleared === 4) { basePoints = BASE_POINTS.tetris; isDifficult = true; }
  }

  let linePoints = basePoints * state.level;

  // B2B
  let newB2b = state.b2bActive;
  if (linesCleared === 0) {
    // no change to b2b
  } else if (isDifficult) {
    if (state.b2bActive) linePoints = Math.floor(linePoints * B2B_MULTIPLIER);
    newB2b = true;
  } else {
    newB2b = false;
  }

  // Combo
  let newCombo = state.combo;
  let comboPoints = 0;
  if (linesCleared >= 1) {
    newCombo = state.combo + 1;
    if (newCombo >= 1) comboPoints = COMBO_BASE * newCombo * state.level;
  } else {
    newCombo = -1;
  }

  return {
    pointsDelta: linePoints + comboPoints,
    newB2b,
    newCombo,
    linesCleared,
  };
}
```

Drop points (soft and hard) are added separately at the moment of the drop, not at the moment of the lock.

---

## 11. Level progression

```ts
function shouldLevelUp(linesBefore: number, linesAfter: number): boolean {
  return Math.floor(linesAfter / 10) > Math.floor(linesBefore / 10);
}
```

Level starts at 1 and equals `Math.floor(totalLines / 10) + 1`. No cap. The gravity table clamps at level 20+.

Optionally support a starting level (Marathon often lets you start at level 1-9 for handicap). Defer to v2.

---

## 12. Hold mechanic

State:

```ts
interface HoldState {
  piece: PieceType | null;
  locked: boolean; // true means hold has been used since last spawn
}
```

On hold key press:

```
if holdState.locked: ignore
if holdState.piece == null:
  holdState.piece = activePiece.type
  spawn next piece from bag
else:
  swap = holdState.piece
  holdState.piece = activePiece.type
  spawn piece of type `swap` at standard spawn position
holdState.locked = true
```

On spawn (any spawn — line clear, lock, initial):

```
holdState.locked = false
```

The held piece is always displayed in spawn orientation.

When a held piece is brought out, its lock-delay reset count is freshly 0.

---

## 13. Game over

Three conditions, checked in the listed places:

1. **Block-out.** Immediately after a spawn, if the piece's cells overlap any locked cells in the grid, end the game.
   ```ts
   if (collides(newPiece, grid)) return endGame(state, 'block-out');
   ```

2. **Lock-out.** Immediately after a lock, if **all** of the piece's cells are in rows `y < 20` (entirely in the buffer area), end the game.
   ```ts
   const allInBuffer = pieceCells(piece).every(([_, y]) => y < 20);
   if (allInBuffer) return endGame(state, 'lock-out');
   ```

3. **Partial lock-out.** Off in v1. If enabled, end if **any** cell is in `y < 20` after a lock.

On game over:

- Stop the loop's engine tick (but keep the render loop running so the final frame is visible).
- Compare `state.score` against `localStorage.getItem('tetris.highScore')`; if greater, persist.
- Emit `gameOver` event with `{ score, lines, level, time, reason }`.
- Display a "Game Over" overlay with score, high score, and a "Play Again" button.

---

## 14. Rendering

### Canvas vs. DOM grid

Use a **single 2D canvas** for the playfield. Justification:

- 200 cells × 60 fps = 12,000 cell paints/sec. DOM updates at this rate cause GC churn and layout thrash. Canvas blits are essentially free in comparison.
- Line-clear animations (flash, shear, particle effects) are trivial on canvas, awkward on DOM.
- Ghost piece alpha blending is one line on canvas; on DOM it requires per-cell opacity classes.
- We do not need accessibility tree access into individual cells; the game is keyboard-only with score and state announced separately.

For the side panels (score, level, next, hold), use either DOM (easier to style, accessible) or a second canvas. Recommend **DOM for the UI shell, canvas for the playfield + next + hold previews.** DOM handles the typography and layout; the canvas previews are small and crisp.

### Canvas setup

- One `<canvas>` per game module, e.g. 300×600 logical pixels for a 30 px cell at 10×20.
- Set `canvas.width` and `canvas.height` to `logicalSize * window.devicePixelRatio` for crisp rendering on HiDPI. Scale the drawing context by `devicePixelRatio` so drawing code uses logical coordinates.
- Set the canvas CSS size to the logical size.
- Use `imageSmoothingEnabled = false` since blocks are pixel-aligned rectangles.

```ts
function setupCanvas(canvas: HTMLCanvasElement, logicalW: number, logicalH: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = logicalW * dpr;
  canvas.height = logicalH * dpr;
  canvas.style.width = `${logicalW}px`;
  canvas.style.height = `${logicalH}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
```

### Cell size and scaling

Cell size is **30 logical pixels** by default. The playfield canvas is therefore 300×600. The next-queue preview cells are **20 px**, and the hold preview cells are **20 px**. These are configurable in `config.ts`.

Viewport scaling: the game container is a flex layout with the playfield in the middle and panels on either side. The container has a max-width of, say, 600 px; when the viewport is smaller, scale the entire container down with CSS `transform: scale(...)`. Do not re-render the canvas at a smaller logical size; just scale the rendered output. This keeps gameplay identical across screens.

### Render order

Each frame, render in this order:

1. **Background.** Solid dark color (e.g., `#101018`), or a faint grid (every 30 px, 1 px line, `rgba(255,255,255,0.04)`).
2. **Locked stack.** Iterate visible rows (y ∈ [20, 39]) and paint each non-empty cell with its color (palette inner fill + bevel outline).
3. **Ghost piece.** Compute via `computeGhost`, paint with 25% alpha and no inner fill.
4. **Active piece.** Paint with full color.
5. **Line-clear flash.** White rectangle over cleared rows, alpha fading from 1 to 0 over the animation duration.
6. **Particles** (optional, v1.1).

Side panels (score, level, lines, next, hold) are DOM and update via their own reactive bindings — typically `textContent` writes inside a `requestAnimationFrame` callback, or React/Vue/etc. state if integrated.

### Why this order

- Background first so it doesn't paint over anything.
- Locked stack before ghost so the ghost can be alpha-blended on top of empty cells.
- Ghost before active piece so the active piece is always crisp.
- Flash last so it sits on top of everything in cleared rows.

### Block drawing

```ts
function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const px = x * CELL_SIZE;
  const py = y * CELL_SIZE;
  // Inner fill (darker)
  ctx.fillStyle = darken(color, 0.25);
  ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
  // Outline (pure color)
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
}
```

For ghost:

```ts
function drawGhost(ctx, x, y, color) {
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
  ctx.globalAlpha = 1.0;
}
```

The visible playfield maps grid `y ∈ [20, 39]` to canvas `y ∈ [0, 19]` — subtract 20 from grid y before multiplying by `CELL_SIZE`. Cells in the buffer area are not drawn (they may contain an active piece, but only the portions of that piece in the visible region paint).

---

## 15. Input

### Keyboard mapping

| Action                  | Primary    | Secondary    |
| ----------------------- | ---------- | ------------ |
| Move left               | `ArrowLeft`|              |
| Move right              | `ArrowRight`|             |
| Soft drop               | `ArrowDown`|              |
| Hard drop               | `Space`    |              |
| Rotate CW               | `ArrowUp`  | `KeyX`       |
| Rotate CCW              | `KeyZ`     |              |
| Rotate 180              | `KeyA`     |              |
| Hold                    | `KeyC`     | `ShiftLeft`, `ShiftRight` |
| Pause                   | `Escape`   | `KeyP`       |
| Restart (game-over)     | `Enter`    |              |

Use `event.code` (physical key, layout-independent) for all bindings except where the user has remapped. v1 does not expose remapping.

`event.preventDefault()` for all game-relevant keys to prevent the browser from scrolling on `Space`/arrows.

### Event handling

Attach listeners on `window` in the module's `mount` and remove in `unmount`. Track key state in a `Set<KeyCode>` updated on `keydown` and `keyup`. The engine reads this state once per tick.

```ts
const pressed = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (RELEVANT_KEYS.has(e.code)) e.preventDefault();
  if (!pressed.has(e.code)) {
    pressed.add(e.code);
    handleKeyDown(e.code);
  }
});
window.addEventListener('keyup', (e) => {
  pressed.delete(e.code);
  handleKeyUp(e.code);
});
```

Note: `handleKeyDown` is triggered only on actual transition from up to down (browser autorepeat is suppressed by checking `pressed.has`). DAS/ARR is implemented manually in the input layer.

### DAS/ARR implementation

For each direction key (left, right, soft drop):

```ts
interface DASState {
  pressed: boolean;
  dasTimer: number; // ms until DAS expires
  arrTimer: number; // ms until next ARR repeat
  hasFired: boolean; // has the initial press fired?
}

function tickDAS(state: DASState, dtMs: number): { repeat: boolean } {
  if (!state.pressed) return { repeat: false };
  if (!state.hasFired) return { repeat: false }; // initial press already fired on keydown
  state.dasTimer -= dtMs;
  if (state.dasTimer > 0) return { repeat: false };
  // DAS has expired; ARR-repeat
  state.arrTimer -= dtMs;
  if (state.arrTimer <= 0) {
    state.arrTimer = ARR_MS;
    return { repeat: true };
  }
  return { repeat: false };
}

function onKeyDown(state: DASState) {
  state.pressed = true;
  state.hasFired = true;
  state.dasTimer = DAS_MS;
  state.arrTimer = ARR_MS;
  // fire one immediate move
  fireAction();
}

function onKeyUp(state: DASState) {
  state.pressed = false;
  state.hasFired = false;
}
```

The DAS/ARR ticker is called from `frame()` with the real `dt`, not from `tickEngine`. Repeats it emits are fed into the engine on the next engine tick.

### Touch (optional)

For touchscreens, implement:

- Tap on left/right half of playfield → move 1 cell (or hold to DAS).
- Tap upper portion → rotate CW.
- Swipe down → soft drop.
- Swipe down hard / flick → hard drop.
- Two-finger tap → hold.

This is a v2 concern. v1 ships keyboard-only and displays an "unsupported on touch" notice when no keyboard is detected (heuristic: no `keydown` event within 5 s of mount).

---

## 16. Persistence

### High score

Stored in `localStorage` under the key `'arcade.tetris.highScore'`. Value is the integer score as a string.

```ts
const STORAGE_KEY = 'arcade.tetris.highScore';

export function readHighScore(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0; // localStorage may throw in private mode on Safari
  }
}

export function writeHighScore(score: number): void {
  try {
    if (score > readHighScore()) {
      localStorage.setItem(STORAGE_KEY, String(score));
    }
  } catch {
    // ignore
  }
}
```

No other state is persisted in v1. No mid-game save/resume.

---

## 17. Configuration

All tunables live in `config.ts` as a frozen object. The module accepts an optional override at mount time.

```ts
export const DEFAULT_CONFIG = Object.freeze({
  // Timing (ms)
  dasMs: 170,
  arrMs: 30,
  lockDelayMs: 500,
  moveResetCap: 15,
  lineClearAnimMs: 200,
  // Speeds
  softDropFactor: 20,
  // Layout
  cellPx: 30,
  previewCellPx: 20,
  nextQueueLength: 5,
  // Scoring base values
  // (see scoring.ts; not duplicated here)
  // Gravity
  maxGravityRowsPerTick: 20,
  // Storage
  storageKey: 'arcade.tetris.highScore',
  // Features
  enableT180: true,
  enablePartialLockOut: false,
});

export type TetrisConfig = typeof DEFAULT_CONFIG;
```

---

## 18. Testing

### Unit tests (Vitest or Jest)

**`board.test.ts`**

- Empty grid is 40×10 of zeros.
- `collides` returns true for piece overlapping wall (`x < 0`, `x >= 10`).
- `collides` returns true for piece overlapping floor (`y >= 40`).
- `collides` returns true for piece overlapping non-zero cell.
- `collides` returns false otherwise.
- `detectFullRows` returns correct indices for: no full rows, one full row at top, one full row at bottom, four full rows (Tetris).
- `clearRows` removes the indicated rows and prepends empty rows.
- Row collapse preserves cell colors above the cleared rows.

**`srs.test.ts`** (the most important test file)

- For each of the 7 pieces, in each of the 4 rotation states, the cell offsets match the spec table exactly.
- For each transition (0↔R, R↔2, 2↔L, L↔0) for J/L/S/T/Z, the 5 kick offsets match the spec.
- Same for I-piece kick table.
- Property: rotation is reversible — rotating CW then CCW on an empty board returns to the original state and position.
- Property: 0→R→2→L→0 returns to original on empty board.
- Specific case: T-spin triple setup — construct a known board, rotate a T into position with a specific kick, verify the resulting position matches the canonical T-spin triple slot.
- Specific case: I-piece "Tetris" rotation against the right wall uses kick test 2 (`(-2, 0)` from R→2 etc.) — verify.

**`randomizer.test.ts`**

- Over 7,000 pieces from a 7-bag, each piece appears exactly 1,000 times (±0).
- Within any 7 consecutive pieces, all 7 types appear at least once.
- `peek(5)` returns the next 5 pieces in correct order without consuming them.
- Multiple `next()` calls after `peek(5)` return the previously-peeked pieces in order.
- Seeding the RNG produces a deterministic sequence.

**`scoring.test.ts`**

- Single at level 1 = 100.
- Tetris at level 5 = 4000.
- B2B Tetris at level 5 = 6000 (after a previous Tetris).
- T-spin Double at level 3 = 3600 (1200 * 3).
- B2B T-spin Double at level 3 = 5400.
- Combo: 2nd consecutive line clear adds `50 * 1 * level`; 3rd adds `50 * 2 * level`.
- Combo resets after a no-clear lock.
- B2B resets after a non-difficult clear.
- B2B is not affected by a T-spin no-line.
- T-spin detection: classic T-spin double setup → 'full'.
- T-spin detection: T placed via translation only → 'none'.
- T-spin detection: piece other than T → 'none'.
- T-spin detection: only 2 corners occupied → 'none'.
- T-spin detection: kick index 4 (last kick) always returns 'full'.

**`gravity.test.ts`**

- `gravityForLevel(1)` ≈ 0.0167.
- `gravityForLevel(10)` ≈ 0.26.
- `gravityForLevel(20)` === 20 (clamped).
- `gravityForLevel(100)` === 20.

**`lock.test.ts`**

- A grounded piece locks after 500 ms.
- A successful move resets the lock timer (within the 15-reset cap).
- After 15 resets, further attempts do not reset.
- Moving off the ground (into airborne) does not reset the reset counter.
- Spawning a new piece resets the reset counter to 0.

### Integration tests

- Start a game, press Right 5 times, hard-drop — verify the piece lands at column 8 (or whatever the spawn column is + 5).
- Hold an active piece — next piece spawns; hold key locked.
- Hold again — operation rejected.
- After lock (next piece spawns) — hold available again.
- Line clear updates score and lines counter.
- 10 lines triggers level-up.

### Manual / "feel" tests

These cannot be reliably automated. Maintain a manual test checklist in `__tests__/MANUAL.md`:

- DAS at 170 ms feels responsive but not twitchy.
- ARR at 30 ms moves the piece across the well in ~10 frames.
- Soft drop at 20x is fast enough to use as a fine-grained drop but not so fast it skips lock delay.
- Lock delay at 500 ms gives enough time for a slide-and-rotate but does not let players stall indefinitely.
- Ghost piece updates without flicker.
- Line-clear flash is visible without being distracting.
- 60 fps maintained on a 5-year-old laptop in Chrome.

---

## 19. Performance budget

Target: **stable 60 fps on hardware as old as 2019-era laptops with integrated graphics.**

Budget per frame (16.67 ms):

- Engine tick: < 1 ms (essentially free; small grid, simple ops).
- Render: < 5 ms. The hot path is 200 cell-paints plus the active piece and ghost. At 5 µs per cell paint (canvas fillRect + strokeRect), this is 1 ms.
- Browser overhead (GC, compositing, etc.): treat as 5 ms slack.

Hot-path rules:

- Do not allocate inside `tickEngine` or `render` except where unavoidable. Reuse arrays for the grid; mutate the active piece object in place if profile shows allocation cost. (v1: allocate freely; optimize only if measurement says so.)
- Do not re-create the canvas context each frame.
- Cache the gravity table.
- Do not call `getBoundingClientRect` in the hot path.
- Use `event.code` not `event.key` for fast string comparison.

If performance is a problem on a target device:

- Move locked stack rendering to an offscreen canvas that only repaints on lock/clear; blit to the main canvas every frame.
- Pre-rasterize block sprites for each color.

---

## 20. Out of scope for v1

The following are explicitly **not** in v1 and should not be implemented unless re-scoped:

- Multiplayer (head-to-head, garbage lines, attack tables).
- Sprint mode (40 lines as fast as possible, timer).
- Ultra mode (highest score in 2 minutes).
- Zone mechanic (Tetris Effect-style time freeze with bonus line clears).
- Original music or sound effects (use silence; SFX hooks are stubs).
- Replay recording / playback.
- Online leaderboards.
- Touchscreen controls.
- Theme switching, alternative tile sets.
- Settings UI (DAS/ARR/lock-delay tuning panel).
- Tutorial / first-run experience.
- Garbage queue display.
- Animated background.
- Account system, persistent player profile beyond high score.
- Mobile-optimized layout.
- Accessibility features beyond standard keyboard input.
- Internationalization (UI is English-only).

---

## 21. Definition of done

v1 ships when:

1. The game is playable end to end: spawn → move/rotate/drop → lock → clear → level up → eventual top-out.
2. SRS rotations behave correctly per the kick tables (verified by `srs.test.ts`).
3. The 7-bag randomizer behaves correctly (verified by `randomizer.test.ts`).
4. Scoring matches the worked examples in `gameplay.md` for at least: single, double, triple, tetris, T-spin double, back-to-back tetris, 5-combo.
5. Lock delay is exactly 500 ms with a 15-reset cap.
6. Hold works once per piece.
7. Ghost piece renders correctly.
8. Game over fires on block-out and lock-out.
9. High score persists across sessions.
10. The game runs at a sustained 60 fps in Chrome 120+ and Safari 17+ on a 2019 MacBook Pro 13".
11. The module mounts and unmounts cleanly with no leaked listeners or RAF handles (verified by mounting/unmounting 100 times in a test page and observing no growth in listener count via `getEventListeners` or memory profile).

---

## 22. Implementation order (suggested)

A reasonable build order, where each step produces something testable:

1. **Grid + collision.** Build the 10×40 grid, the collision function, and a console-only harness that prints the grid.
2. **Piece definitions.** All 7 pieces in all 4 rotations as raw data. Test that the offsets match.
3. **SRS rotations + kick tables.** Implement `tryRotate`. Write the kick-table test first; pass it.
4. **7-bag randomizer.** Test the distribution and the no-repeat-in-7 property.
5. **Basic game loop (no rendering).** Spawn → gravity → lock → clear → spawn. Use console output to verify.
6. **Canvas rendering.** Background, locked stack, active piece. Wire it to the loop.
7. **Ghost piece.**
8. **Keyboard input + DAS/ARR.** Move and rotate the piece interactively.
9. **Hard drop and soft drop.** With drop-point bonuses.
10. **Lock delay.** With move-reset and 15-cap.
11. **Hold mechanic.**
12. **Scoring + level + gravity curve.** Full scoring table including T-spins, B2B, combo.
13. **Line-clear animation.**
14. **Next-queue and hold panels.**
15. **Game-over screen + high-score persistence.**
16. **Pause.**
17. **Polish: bevels on blocks, score popups, sound stubs.**
18. **Tests:** fill out the unit-test suite to coverage targets (board, srs, randomizer, scoring at 100%; gravity, lock at 90%+).
19. **Manual playtest.** Tune DAS/ARR/lock-delay if they feel off; do not change the defaults without good reason.

Each step is < 1 day for a competent dev. Total: ~3 weeks including polish and test.

---

## 23. Glossary

- **Active piece.** The tetromino currently under player control.
- **ARR.** Auto-Repeat Rate. The interval between successive auto-repeated moves after DAS has expired.
- **B2B.** Back-to-back. A bonus for consecutive "difficult" clears (Tetris or T-spin line clears).
- **Block-out.** Top-out condition: new piece spawns overlapping locked cells.
- **Buffer area.** The 20 rows above the visible playfield where pieces spawn.
- **Combo.** A bonus for consecutive line-clearing pieces.
- **DAS.** Delayed Auto-Shift. The initial delay before auto-repeat begins on a held direction key.
- **Ghost piece.** A visual indicator showing where the active piece will land on a hard drop.
- **Gravity.** The rate, in rows per tick, at which the active piece descends.
- **Guideline.** The Tetris Company's specification, last revised circa 2009, that standardizes modern Tetris behavior.
- **Hard drop.** Instantly drop the active piece to the bottom and lock it.
- **Hold.** Set aside the active piece for later. One swap allowed per piece.
- **Kick.** An offset applied to a rotated piece to make it fit when its naive rotated position overlaps something.
- **Lock delay.** The grace period (default 500 ms) between a piece becoming grounded and locking into the grid.
- **Lock-out.** Top-out condition: piece locks entirely above the visible playfield.
- **Mini T-spin.** A T-spin where the T piece points into a corner with fewer than 2 "front" corners occupied. Worth less than a full T-spin.
- **Move-reset.** The mechanic by which a successful move or rotation resets the lock-delay timer.
- **Next queue.** The panel showing the next several pieces to be spawned.
- **Pivot.** The center of rotation of a piece, expressed as a cell within the piece's bounding box.
- **Rotation state.** One of `0`, `R`, `2`, `L` (spawn, right, 180, left).
- **Soft drop.** Accelerate the active piece downward at a fixed multiple of gravity.
- **SRS.** Super Rotation System. The Guideline rotation system with piece-specific wall-kick tables.
- **T-spin.** A T-piece that locks via rotation into a slot with at least 3 of its 4 diagonal corners occupied. Bonus scoring.
- **Tetris.** A four-line clear. Worth 800 base points, B2B-eligible.
- **Tetromino.** A polyomino of four cells. The seven of them — I, O, T, S, Z, J, L — are the only pieces in the game.
- **7-bag.** The Guideline randomizer: shuffle all seven pieces and dispense them, repeat.

---

End of specification.
