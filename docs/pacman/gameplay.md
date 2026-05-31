# Pac-Man — Gameplay

This document describes the game from the player's perspective: what you do, what you see, what is trying to kill you. Engineering details (targeting math, exact speed tables, tick rates) live in `engineering.md`.

## Objective

Clear every pellet from the maze. There are 240 small pellets and 4 large power pellets on each board, for 244 total. Clearing all 244 advances you to the next level on a slightly harder version of the same maze. You have three lives by default, plus one bonus life at 10,000 points. The game ends when you lose your last life. There is no "winning" the game in the traditional sense — the goal is to score as high as you can before running out of lives.

## Controls

- **Arrow keys** or **WASD** — change direction
- **P** or **Esc** — pause / resume
- **Enter** — start game / continue from game over
- **Touch (mobile)** — swipe up / down / left / right on the play field

Direction inputs are buffered: if you press a direction while Pac-Man is between intersections, the game remembers it and turns at the next legal opportunity. The buffer window is generous (about a third of a second) and clears if you press a different direction.

You cannot stop Pac-Man. As long as he can move, he moves. The only way to "stop" is to face a wall, at which point he stays put with his mouth frozen open until you turn him.

## The maze

A single fixed maze, 28 tiles wide and 31 tiles tall. Standard layout:

```
+----------------------------+
|............||............|
|.+--+.+---+.||.+---+.+--+.|
|o|  |.|   |.||.|   |.|  |o|     o = power pellet
|.+--+.+---+.++.+---+.+--+.|     . = pellet
|..........................|
|.+--+.++.+------+.++.+--+.|
|.+--+.||.+--++--+.||.+--+.|
|......||....||....||......|
+----+.|+--+ || +--+|.+----+
     |.|+--+ ++ +--+|.|
     |.||          ||.|
     |.|| +--==--+ ||.|     == = ghost house door
+----+.|| |      | ||.+----+
       .   | GH   |   .          GH = ghost house interior
+----+.|| |      | ||.+----+
     |.|| +------+ ||.|
     |.||          ||.|
     |.|| +------+ ||.|
+----+.++ +--++--+ ++.+----+
|............||............|
|.+--+.+---+.||.+---+.+--+.|
|o|  |.|   |.||.|   |.|  |o|
|.+-+|.+---+.++.+---+.|+-+.|
|...||........  ........||..|
|+--+|.++.+------+.++.|+--+|
|......||....||....||......|
|.+----++--+.||.+--++----+.|
|..........................|
+----------------------------+
```

The two gaps on the middle row are the **tunnels**: walking off the left edge wraps to the right edge and vice versa. Ghosts move at half speed inside the tunnels, which is your main escape tool.

The central enclosure is the **ghost house**. Pac-Man cannot enter it. Ghosts spawn here, return here when eaten, and pause briefly before re-entering play. The door at the top opens only to let ghosts in and out.

## Scoring

| Action                                 | Points     |
|----------------------------------------|------------|
| Eat a pellet                           | 10         |
| Eat a power pellet                     | 50         |
| Eat a ghost (1st in a chain)           | 200        |
| Eat a ghost (2nd)                      | 400        |
| Eat a ghost (3rd)                      | 800        |
| Eat a ghost (4th — all four chained)   | 1600       |
| Eat a bonus fruit (level 1 cherry)     | 100        |
| Eat a bonus fruit (level 2 strawberry) | 300        |
| Eat a bonus fruit (level 3-4 orange)   | 500        |
| Eat a bonus fruit (level 5-6 apple)    | 700        |
| Eat a bonus fruit (level 7-8 melon)    | 1000       |
| Eat a bonus fruit (level 9-10 Galaxian)| 2000       |
| Eat a bonus fruit (level 11-12 bell)   | 3000       |
| Eat a bonus fruit (level 13+ key)      | 5000       |
| Clearing the board (no direct bonus)   | 0          |

The ghost-eating chain resets at the start of each power-pellet window — so if you eat a power pellet, eat one ghost (200), and the window expires before you catch another, your next ghost in your next power window starts back at 200.

Eating all four ghosts within a single power window awards 200 + 400 + 800 + 1600 = 3000 bonus points on top of the 50 for the pellet itself. This is the main scoring lever in the game.

## Lives

- Start with 3 lives.
- Earn 1 extra life when your score crosses 10,000 points (one-shot; no further extras).
- Losing your last life ends the game.

Remaining lives are shown as small Pac-Man icons in the bottom-left corner of the HUD.

## Levels

The maze layout never changes. What changes per level:

- **Pac-Man speed** increases up through level 5 and stays there.
- **Ghost speed** increases.
- **Frightened (power pellet) duration** shortens; by level 19 it stops triggering frightened mode entirely (ghosts still reverse direction when you eat the pellet, but you cannot eat them).
- **Frightened flash** (the blue-white blink warning the window is about to end) starts earlier in later levels.
- **Bonus fruit** changes (see scoring table) and is worth more.
- **Ghost "Elroy" mode**: once Pac-Man clears enough pellets on a level, the red ghost (Blinky) becomes "Cruise Elroy" — he speeds up and his scatter behavior is overridden so he keeps chasing you even during scatter phases. The pellet threshold lowers in later levels, so Elroy kicks in earlier and earlier. By level 5, Blinky is essentially always in Elroy mode.

Level transitions show a brief flash of the maze (blue-to-white-to-blue twice) and a one-to-two second pause before the new level starts with Pac-Man and ghosts at their starting positions.

## Power pellets

The four large flashing pellets in the corners. Eating one:

1. Awards 50 points.
2. Immediately reverses the direction of every ghost currently in the maze.
3. Puts the ghosts into **frightened** mode for a level-dependent duration (around 6 seconds at level 1, dropping to 1 second by level 18, none at all from level 19).
4. Resets the ghost-eating chain to 200.

While frightened, ghosts:

- Turn dark blue with little wobbling legs and scared eyes.
- Move noticeably slower than Pac-Man.
- Choose directions randomly at intersections (instead of pursuing).
- Cannot kill Pac-Man; instead, Pac-Man can eat them.
- Begin flashing white-and-blue about two seconds before the window ends.

Eaten ghosts are reduced to a pair of eyes that race back to the ghost house, where they regenerate and re-enter play (no longer frightened). Eyes do not threaten Pac-Man and pass through other ghosts.

Pro play hinges on power pellets: don't eat one the moment you see it. Lure ghosts toward the pellet first, then bite it when all four are in range.

## Bonus fruit

Twice per level, a bonus item appears just below the ghost house for about 9-10 seconds, then disappears if not eaten. It appears once when 70 pellets have been eaten, and again when 170 have been eaten. The item type and point value depend on the level (see scoring table). The icons cycle: cherry, strawberry, orange, apple, melon, Galaxian flagship, bell, key.

The level-indicator strip in the bottom-right corner shows the most recent fruits for the last several levels, to remind the player how far they have come.

## Ghost behaviors (as the player sees them)

You will play this game many times before noticing the patterns. They are deliberate.

**Blinky (red)** — the shadow. Chases Pac-Man directly, almost always coming from behind. In early levels he is the most predictable ghost: aim away from him and you'll stay alive. In later levels, "Cruise Elroy" mode makes him faster than Pac-Man on straight runs, so you have to use intersections to lose him.

**Pinky (pink)** — the ambusher. Aims at the tile in front of Pac-Man, four tiles ahead in the direction Pac-Man is currently facing. If you run in a straight line, Pinky converges on a meeting point ahead of you. The counter is to turn perpendicular to Pinky just before she reaches your projected position, which causes her to overshoot. Experienced players think of Pinky as "the one who knows where I'm going."

**Inky (cyan)** — the wildcard. Uses both Blinky's position and Pac-Man's position to compute a target. Effectively, Inky tries to flank — he heads to a tile on the opposite side of Pac-Man from Blinky. When Blinky is close to you, Inky is dangerous; when Blinky is far away, Inky wanders. Hardest ghost to predict.

**Clyde (orange)** — the bashful one. Chases Pac-Man when more than eight tiles away, but as soon as he gets close, he gives up and retreats to his corner. He almost never kills you on purpose. He kills you when you're cornered by the other three and have nowhere left to run.

All four ghosts cycle on a fixed timer between **scatter mode** (head to a fixed home corner) and **chase mode** (use the targeting rules above). The cycle, roughly:

- Scatter 7s, Chase 20s, Scatter 7s, Chase 20s, Scatter 5s, Chase 20s, Scatter 5s, Chase forever.

On later levels the scatter periods shrink to 5s, then to almost nothing. Whenever the mode switches, all non-frightened ghosts reverse direction in place — this is a tell, and you can use it to escape.

## Tunnels

The two side tunnels on the middle row wrap from edge to edge. Ghosts move at half speed inside the tunnel section (the few tiles immediately adjacent to the wrap), so the tunnel is your reliable get-out-of-jail tool when a ghost is on your tail. Pac-Man also slows down slightly in the tunnel, but less than the ghosts do, so you gain ground.

## Win / lose

- **Lose a life**: a ghost (not frightened, not eyes) touches Pac-Man. Pac-Man plays a brief death animation (spins and shrinks to a point). If you have lives left, the level restarts with everyone at their starting positions but with the pellets you have already eaten staying eaten.
- **Game over**: lose your last life. The screen shows "GAME OVER" in red. Pressing Enter returns to the title.
- **There is no win.** The board can be cleared infinitely many times in principle. The original arcade had a kill-screen bug at level 256 caused by an 8-bit overflow in the fruit drawing routine; this is explicitly not reproduced (see `engineering.md`).

## Difficulty progression summary

| Level    | Pac speed   | Ghost speed | Frightened secs | Elroy 1 threshold | Bonus fruit       |
|----------|-------------|-------------|-----------------|-------------------|-------------------|
| 1        | 80%         | 75%         | 6               | 20 pellets left   | Cherry (100)      |
| 2        | 90%         | 85%         | 5               | 30                | Strawberry (300)  |
| 3-4      | 90%         | 85%         | 4               | 40                | Orange (500)      |
| 5-6      | 100%        | 95%         | 3 / 2           | 40 / 50           | Apple (700)       |
| 7-8      | 100%        | 95%         | 2               | 50                | Melon (1000)      |
| 9-10     | 100%        | 95%         | 1               | 60                | Galaxian (2000)   |
| 11-12    | 100%        | 95%         | 1               | 80                | Bell (3000)       |
| 13-18    | 100%        | 95%         | 1               | 100               | Key (5000)        |
| 19+      | 100%        | 95%         | 0 (no fright)   | 120               | Key (5000)        |
| 21+      | 90%         | 95%         | 0               | 120               | Key (5000)        |

(Speeds are percentages of "full speed" — the maximum movement rate. Exact values per state per level are in `engineering.md`.)

That is the whole game. It is small. It is deep enough to play for a lifetime.
