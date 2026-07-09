# Bricks Engineering

## Module Shape

The game follows the existing NYX Arcade split:

- `state.ts`: pure state creation, paddle movement, ball launch, collision,
  scoring, level clear, life loss, and pause transitions.
- `renderer.ts`: canvas-only drawing for the playfield, HUD, paddle, ball,
  bricks, and state overlays.
- `game.ts`: browser integration for keyboard input, audio, canvas mounting,
  persistence, the 60 Hz loop, and Angular-facing snapshots.
- `bricks.component.ts`: route host, help/credits dialogs, arcade-wide shortcuts,
  and HUD signal binding.

## State Model

`BricksState` tracks the run status, score, high score, lives, level, combo,
paddle position, ball position/velocity, and a brick array. Bricks are generated
from fixed row/column config so tests can address deterministic geometry.

The ball starts stuck to the paddle after a new run, level clear, or life loss.
`launchBall()` gives it an upward velocity and moves the state to `playing`.

## Collision

The simulation is intentionally simple and stable at 60 Hz:

- Side and ceiling collisions reflect the relevant velocity component.
- Paddle collisions compute a bounce angle from the hit position relative to
  the paddle center.
- Brick collisions use circle-vs-rectangle overlap, remove only the first hit
  brick for the tick, and reflect from the side inferred from the previous ball
  position.
- Falling below the playfield consumes a life and resets the ball to the paddle.

## Verification

Focused unit coverage lives in `src/app/games/bricks/state.spec.ts` and checks
run start, paddle clamping, launch, brick scoring, paddle bounce, life loss,
game over, and final-brick level clear.
