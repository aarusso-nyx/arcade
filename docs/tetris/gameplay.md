# Tetris — Gameplay

This document specifies the player-facing rules of the game. It is the source of truth for what the game does from the player's seat. Implementation details live in `engineering.md`.

## Objective

Place falling tetrominoes into the well to complete horizontal lines. Each completed line clears, the stack above it falls down by one row, and you are awarded points. The game ends when a new piece can no longer be spawned at the top of the well. The objective is to accumulate the highest score possible before that happens. There is no win condition in Marathon mode — only a top-out.

## The well

The visible play area is **10 columns wide by 20 rows tall**. There are an additional **20 buffer rows above the visible area** in which pieces spawn and can be manipulated; cells in the buffer area are not rendered but are otherwise fully part of the playfield (collision and rotation work the same).

## The pieces

There are seven tetrominoes, each made of four cells:

- **I** — four cells in a straight line, cyan.
- **O** — a 2x2 square, yellow.
- **T** — three cells in a row with one cell centered on top, purple.
- **S** — a zig-zag, green.
- **Z** — a mirror-image zig-zag, red.
- **J** — three cells in a row with one cell on the top-left, blue.
- **L** — three cells in a row with one cell on the top-right, orange.

Pieces appear in a randomized order via the **7-bag** system: the seven distinct pieces are shuffled into a bag, dispensed one at a time until empty, and then a fresh shuffled bag is dispensed. This guarantees you will never wait more than 12 pieces between any two instances of the same tetromino, and never less than 0.

## Controls

| Action                  | Key                            |
| ----------------------- | ------------------------------ |
| Move left               | `Left arrow`                   |
| Move right              | `Right arrow`                  |
| Soft drop               | `Down arrow`                   |
| Hard drop               | `Space`                        |
| Rotate clockwise        | `X` or `Up arrow`              |
| Rotate counter-clockwise| `Z`                            |
| Rotate 180              | `A` (optional)                 |
| Hold                    | `C` or `Left Shift`            |
| Pause                   | `Esc` or `P`                   |

Holding a horizontal direction or the soft-drop key triggers auto-repeat after a short delay (DAS) and then repeats at a configurable rate (ARR). Defaults: DAS 170 ms, ARR 30 ms, soft-drop factor 20x gravity. See `engineering.md` for tuning.

## Soft drop vs. hard drop

- **Soft drop** (`Down arrow`) accelerates the current piece downward at a fixed multiple of the current gravity rate (default: 20x). The piece does **not** lock the moment it touches the stack while soft-dropping; the normal lock-delay window applies. Soft-drop awards **1 point per cell** descended under player control.
- **Hard drop** (`Space`) instantly moves the piece to the lowest position it can legally occupy and locks it immediately. There is no lock-delay grace period. Hard-drop awards **2 points per cell** descended.

The ghost piece, a faint outline of the active piece projected to its lowest legal position, is always visible and updates in real time.

## Hold

Press `C` (or `Shift`) to move the current piece into the **hold slot**. If the hold slot is empty, a new piece is then drawn from the queue. If the hold slot already contained a piece, that piece becomes the active piece and spawns at the top of the well.

Hold may only be used **once per piece**. After a hold swap, hold is locked until the next piece is spawned (either by line clear / lock or by another hold operation populating a previously empty slot). The lock prevents trivial infinite-stall by hold-spamming.

The held piece is displayed in its spawn orientation regardless of how it was oriented at the moment of hold.

## Next queue

The next **5 pieces** are visible at all times in the next-queue panel, in the order they will spawn. The queue is replenished from the 7-bag transparently.

## Gravity and levels

The game begins at **level 1**. The level increases by 1 for every **10 lines cleared**, regardless of whether they were cleared individually or in clusters. There is no maximum level.

Gravity is expressed as **rows per frame** at 60 frames per second. The table below (the Tetris Worlds curve, which is the Guideline standard) gives the gravity for the first 20 levels. Levels beyond 20 continue the curve to its physical limit at level 29, at which point gravity is one row per frame (the piece spawns at the bottom of the well in the same frame it spawns at the top).

| Level | Rows per frame | Approx. seconds per row |
| ----- | -------------- | ----------------------- |
| 1     | 0.01667        | 1.000                   |
| 2     | 0.02137        | 0.793                   |
| 3     | 0.02768        | 0.618                   |
| 4     | 0.03620        | 0.473                   |
| 5     | 0.04791        | 0.355                   |
| 6     | 0.06410        | 0.262                   |
| 7     | 0.08741        | 0.190                   |
| 8     | 0.12158        | 0.137                   |
| 9     | 0.17216        | 0.097                   |
| 10    | 0.24762        | 0.067                   |
| 11    | 0.36185        | 0.046                   |
| 12    | 0.53570        | 0.031                   |
| 13    | 0.80531        | 0.021                   |
| 14    | 1.22769        | 0.014                   |
| 15    | 1.89998        | 0.009                   |
| 16    | 2.97983        | 0.005                   |
| 17    | 4.74313        | 0.004                   |
| 18    | 7.66064        | 0.002                   |
| 19    | 12.5585        | 0.001                   |
| 20+   | 20.0000        | locked at 20 rows/frame |

These values are derived from the formula `gravity = (0.8 - ((level - 1) * 0.007)) ^ (level - 1)` seconds per row, inverted to rows per frame at 60 Hz.

## Lock delay

When a piece comes to rest on the stack (i.e., gravity would move it into an occupied cell or below the floor), a **lock timer of 500 ms** begins. The piece remains active and movable during this window. When the timer expires, the piece locks into place and the next piece spawns.

Two additional rules govern the lock window:

1. **Move-reset.** Any successful movement or rotation (one that actually changes the piece's position or orientation) resets the lock timer to 500 ms. This allows the player to slide a piece along the floor or rotate it into a final position.
2. **Move-reset cap.** The lock timer may be reset at most **15 times** per piece. The sixteenth reset attempt is ignored and the piece locks at the end of the current timer. This prevents indefinite stalling.

If the piece moves downward (gravity or soft drop) into an unoccupied cell, the lock state is cleared entirely and a new lock timer is started fresh the next time the piece comes to rest. The 15-reset counter resets only when the piece spawns.

A **hard drop bypasses lock delay entirely**.

## Line clears and scoring

When a piece locks, any rows that are completely filled are cleared simultaneously. The scoring depends on how many rows clear at once and on whether the clear was a T-spin, a back-to-back, or part of a combo.

### Base scoring

| Clear                | Name           | Base points |
| -------------------- | -------------- | ----------- |
| 1 line               | Single         | 100         |
| 2 lines              | Double         | 300         |
| 3 lines              | Triple         | 500         |
| 4 lines              | Tetris         | 800         |
| T-spin, 0 lines      | T-spin         | 400         |
| T-spin, 1 line       | T-spin Single  | 800         |
| T-spin, 2 lines      | T-spin Double  | 1200        |
| T-spin, 3 lines      | T-spin Triple  | 1600        |
| Mini T-spin, 0 lines | Mini T-spin    | 100         |
| Mini T-spin, 1 line  | Mini T-spin Single | 200     |

All base point values are **multiplied by the current level**. Soft-drop and hard-drop bonuses are added on top and are **not** multiplied by level.

### T-spin detection (three-corner rule)

A clear is recognized as a **T-spin** if and only if all of the following hold:

1. The piece that locked is a T.
2. The most recent successful movement of the piece was a **rotation** (not a translation, not a gravity step).
3. Of the four diagonal corners surrounding the center cell of the T, **at least three are occupied** by either the wall, the floor, or a previously locked cell.

A T-spin is further classified as a **Mini T-spin** if the two corners on the "pointing" side of the T (the side opposite the flat edge) are both *unoccupied*. Otherwise it is a full T-spin. Exception: a T-spin that triggered a wall-kick using the last (fifth) kick offset is always treated as a full T-spin regardless of the corner check, because that offset is only reachable by a true T-spin maneuver.

### Back-to-back

A clear is **back-to-back** (B2B) if it is a tetris or any T-spin line clear (i.e., a "difficult" clear), and the *previous* line-clearing move was also a difficult clear. T-spin no-line clears do not count as line clears for B2B purposes (they neither set nor reset the B2B chain). Any non-difficult line clear (single, double, triple without T-spin) breaks the B2B chain.

A back-to-back clear awards an additional **1.5x multiplier** on the base score (after the level multiplier). For example, a back-to-back Tetris at level 5 scores `800 * 5 * 1.5 = 6000` points.

### Combo

A **combo counter** increments by 1 each time a piece-lock clears at least one line, and resets to -1 whenever a piece-lock clears no lines. The combo bonus is `50 * combo * level` points, awarded in addition to the base score, when the combo counter is >= 1 (i.e., the second consecutive line-clearing piece is the first one to score a combo bonus).

### Drop bonuses

- Soft drop: **+1 point per cell** descended under soft-drop control, not multiplied by level.
- Hard drop: **+2 points per cell** descended by the hard drop, not multiplied by level.

### Worked example

Player is at level 3, B2B-active. They place a T-piece that triggers a T-spin Double and continues a 2-combo:

- Base: T-spin Double = 1200.
- Level multiplier: `1200 * 3 = 3600`.
- B2B bonus: `3600 * 1.5 = 5400`.
- Combo bonus: `50 * 2 * 3 = 300`.
- Total for the lock: **5700**.

## Game over (top-out)

Three conditions end the game. All are checked in order at the moments described.

1. **Block-out.** A newly spawned piece overlaps an already-occupied cell in its spawn position. Checked at spawn time. This is the most common top-out.
2. **Lock-out.** A piece locks entirely within the buffer area (above row 20 of the playfield, i.e., entirely above the visible playfield). Checked at lock time.
3. **Partial lock-out (optional, off by default).** Any portion of a piece locks within the buffer area. Stricter variant of lock-out, used in some tournament rulesets. Off in this implementation.

When the game ends, the final score is compared against the persisted high score in `localStorage` and replaced if greater. The player is shown their score, lines cleared, level reached, longest combo, and time played, and offered a restart.

## Pause

Pressing `Esc` or `P` pauses the game. The well, next queue, and hold slot are obscured (to prevent the player using pause to plan); the score and level remain visible. The same key resumes.

## Tuning summary

The following defaults are recommended and should be considered authoritative for this implementation:

| Parameter            | Default       |
| -------------------- | ------------- |
| DAS                  | 170 ms        |
| ARR                  | 30 ms         |
| Soft-drop factor     | 20x gravity   |
| Lock delay           | 500 ms        |
| Move-reset cap       | 15            |
| Next queue length    | 5             |
| Spawn row            | row 20 (top of visible area, in buffer) |
| Line-clear animation | 200 ms        |
| Gravity curve        | Tetris Worlds |

These values are configurable in code (see `engineering.md` § Configuration) but should not be exposed in a settings UI in v1.
