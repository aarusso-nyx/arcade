# Snake Gameplay

## Objective

Steer the snake so that its head enters cells containing food. Each food eaten grows the snake by one segment and increases the score. Survive as long as possible. There is no win state in the traditional sense — play continues until the snake dies. The implicit goal is to maximize score (and equivalently, length) before that happens.

## Controls

### Keyboard

- **Arrow Up** or **W** — turn north
- **Arrow Down** or **S** — turn south
- **Arrow Left** or **A** — turn west
- **Arrow Right** or **D** — turn east
- **Space** — pause / resume
- **Enter** — start new game from the game-over screen
- **Esc** — return to main menu (if applicable)

A direction input that would reverse the snake 180 degrees (e.g. moving east and pressing west) is ignored. This prevents instant self-collision from a misclick.

The game is keyboard-only. No touch or pointer input.

### Input buffering

Between two ticks, the game accepts up to two queued direction changes. This allows sharp turns — for example, pressing up then right in quick succession executes both turns on consecutive ticks. Without buffering, fast players outrun the tick rate and lose inputs.

## How the snake moves

The snake occupies a continuous chain of grid cells. On each tick:

1. The head advances one cell in the current direction.
2. If the new head cell contains food, the food is consumed, the score increases, and the snake's length grows by one (the tail does not move this tick).
3. Otherwise, the tail vacates its cell (the snake slides forward as a whole).
4. Collisions are checked against the new head position.

Movement is strictly one cell per tick. There is no sub-tile motion in the game logic — any smoothing is purely visual.

## Scoring

- **Standard food**: +10 points.
- **Bonus food**: +50 points (subject to a time limit; see below).
- **Length bonus**: every 10 segments of length grants an additional +25 one-time bonus.

The final score is shown on the game-over modal alongside the highest score recorded in the current browser (persisted to `localStorage`). A new high score is highlighted.

## How the snake grows

Each piece of food eaten extends the snake by exactly one segment. The new segment appears at the head's new position (the tail stays put for one tick instead of vacating). After the growth tick, normal movement resumes.

The snake's length therefore equals (initial length) + (food eaten). The initial length is 3 segments by default, placed horizontally near the center of the board.

## Speed progression

The tick interval starts long and shortens as the player eats more food. A representative curve:

| Food eaten | Tick interval | Effective speed |
|------------|---------------|-----------------|
| 0          | 200 ms        | 5 cells/sec     |
| 5          | 180 ms        | ~5.5 cells/sec  |
| 10         | 160 ms        | 6.25 cells/sec  |
| 20         | 130 ms        | ~7.7 cells/sec  |
| 40         | 90 ms         | ~11 cells/sec   |
| 60+        | 60 ms (floor) | ~16.6 cells/sec |

The exact decrement and floor are tunable. The floor exists to prevent the game from becoming literally unplayable past a certain length.

A "level" or "speed" indicator in the HUD reflects this. It is purely informational — there are no discrete level transitions, just a continuously tightening tick.

## Win / lose conditions

- **Lose**: the head enters a cell occupied by the snake's own body, OR (in classic mode) the head crosses a wall boundary.
- **Win**: there is no formal win state. The theoretical maximum is the snake filling every cell of the board, at which point food can no longer spawn. If this state is reached, the game treats it as a victory and shows a congratulatory message. On a 20x20 board this requires 397 food (initial length 3, plus 397 = 400 cells).

When a losing collision occurs, the game freezes the final frame, plays a death tone (if audio is enabled), and shows the game-over modal with the final score, the best score, and a button to play again.

## Modes

### Classic (walls kill)

The play area is bounded by solid walls. The snake dies if its head crosses any boundary. This is the canonical Nokia-era rule set and is the default mode.

### Wrap-around (walls warp)

The play area is topologically a torus. A head exiting the east edge re-enters from the west edge at the same row; the same applies to north/south. The body and tail also wrap. Self-collision remains the only death condition. This is significantly more forgiving and is offered as an alternative mode for casual play.

Mode is a setting in the main menu and is persisted to `localStorage`. The same level layout is used for both modes; only the wall behavior differs.

### Modern variants (optional)

If the host project chooses to expose them, additional modes may include:

- **Speed-only**: tick rate increases with score, but the snake does not grow. A pure reflex test.
- **No-grow until N**: the snake stays at its initial length for the first N foods, then begins growing. A warm-up variant.
- **Hard**: starts at a fast tick and a faster speed curve.

These are off by default and not required for v1.

## Bonus food

In addition to standard food, the game occasionally spawns a bonus food. Rules:

- A bonus food appears at random intervals — for example, every 8 to 15 standard foods eaten, jittered.
- Only one bonus food exists at a time.
- It is visually distinct from standard food (different color, optional pulse).
- It exists for a limited time — for example, 8 seconds — then disappears if not eaten.
- Eating it grants the bonus score (+50) but does not grow the snake any more than standard food.
- The standard food is unaffected by the bonus food's lifecycle; both can coexist.

## HUD

The on-screen display contains:

- **Score** (top left).
- **Best score** (top right, smaller).
- **Speed indicator** (top center or below score) — a simple numeric or bar reading.
- **Bonus food timer** (when active) — a thin shrinking bar near the bonus food, or a numeric countdown in the HUD.

Game-over modal contains: final score, best score, "New record!" badge if applicable, **Play Again** button, **Main Menu** button.

## Pause behavior

Pressing Space (or the pause button) freezes the tick loop. Inputs are ignored except for unpause and quit. The board remains visible. No countdown is shown on resume — the next tick fires after the standard interval. This is deliberate: pause is for interruptions, not strategic planning.
