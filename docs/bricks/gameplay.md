# Bricks Gameplay

## Goal

Clear every brick on the board without letting the ball fall below the paddle.
Each cleared rack advances the level, rebuilds the wall, and increases ball speed.

## Controls

- Left / Right arrows, or A / D: move paddle.
- Space: launch the ball; pause or resume while the ball is moving.
- Enter: start a run or retry after game over.
- P: pause or resume.
- M: mute or unmute sound effects.
- H / ?: open help.
- C: open credits.
- Backslash: toggle arcade mode.
- Esc: pause while playing, then quit to the arcade home.

## Scoring

Rows closer to the top are worth more points. Consecutive brick hits add a small
combo bonus. The combo resets when the paddle is touched or a life is lost.

The browser stores the high score under the `arcade.bricks.highScore`
localStorage namespace.
