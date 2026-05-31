# Tetris

## What it is

Tetris is a tile-matching puzzle game in which a continuous stream of seven distinct four-cell pieces (tetrominoes) falls from the top of a rectangular well. The player rotates and translates each piece as it descends, attempting to pack the pieces into horizontal rows. When a horizontal row is completely filled with blocks, that row clears, the rows above it collapse downward, and the player is awarded points. The game speeds up as the player clears more lines. The game ends when the stack of un-cleared blocks reaches the top of the well and a new piece can no longer be spawned.

That is the entire rule set. Everything else — scoring tables, rotation systems, randomizers, lock delay, hold pieces, T-spins, back-to-back bonuses — is a refinement layered on top of this primitive to give the game depth, fairness, and competitive structure.

## Origin

Tetris was designed in June 1984 by Alexey Pajitnov, then a 29-year-old computer engineer at the Computing Centre of the Soviet Academy of Sciences in Moscow. Pajitnov was working with an Elektronika 60 terminal that could not render graphics; the original pieces were drawn from bracket characters in text mode. The name is a contraction of "tetra" (the Greek prefix for four, referring to the four cells in every piece) and "tennis," Pajitnov's favorite sport.

The game spread through the Soviet Union by floppy disk in 1985, leaked westward through Budapest in 1986, and entered an extraordinarily tangled licensing war for the next several years. Henk Rogers eventually secured the worldwide handheld rights for Nintendo, and the Game Boy launch bundle of 1989 — Game Boy plus Tetris — fused the game and the platform into a single cultural object. The Tetris Company, formed in 1996 by Pajitnov and Rogers, has held the master license since.

In 2001, the Tetris Company published the Tetris Guideline, a specification that standardizes the seven-piece random bag, the Super Rotation System (SRS), the color of each tetromino, the hold queue, the ghost piece, lock delay, and the scoring of T-spins and back-to-back clears. Every modern licensed Tetris product implements the Guideline; competitive play assumes it. This document targets the Guideline.

## Look and feel

The visual identity of modern Tetris is austere and grid-bound. A 10-column-wide, 20-row-tall well dominates the screen. To the left or right of the well sit two smaller panels: a "hold" slot above and a "next" queue below (or vice versa). Score, level, and lines cleared are tabulated in a sidebar. The well is rendered in dark neutral tones; the seven tetrominoes are rendered in the Guideline-mandated colors:

| Piece | Color           | Hex (typical) |
| ----- | --------------- | ------------- |
| I     | Cyan            | `#00F0F0`     |
| O     | Yellow          | `#F0F000`     |
| T     | Purple          | `#A000F0`     |
| S     | Green           | `#00F000`     |
| Z     | Red             | `#F00000`     |
| J     | Blue            | `#0000F0`     |
| L     | Orange          | `#F0A000`     |

A faint outline of the active piece appears at the bottom of the well — the ghost piece — showing exactly where the piece will land if hard-dropped. The active piece itself sits at the top, flashing or pulsing subtly as the lock-delay counter ticks. When a line clears, the cleared row flashes white, briefly shears, and the stack collapses with a snap.

The feel is tactile in a way most software is not. The DAS (delayed auto-shift) and ARR (auto-repeat rate) values control how a held arrow key translates into successive cell shifts; a competent player tunes these the way a typist tunes key repeat. Hard drop is instantaneous and audibly final — the piece slams to the bottom and locks. Soft drop is a controlled acceleration. The lock delay, typically half a second with a move-reset cap, gives the player a small window to slide and rotate a piece into a tight fit after it has touched the stack. Mastery is the difference between someone who slots pieces into the obvious gap and someone who weaves T-pieces into corners they cut milliseconds ago.

The audio is, by tradition, a propulsive 4/4 loop. The most recognizable melody — known as "Korobeiniki" — is a Russian folk song that Nintendo paired with the Game Boy version and that has, for two generations of players, become inseparable from the falling block. Sound design is otherwise minimal: a short tick on movement, a deeper tick on rotation, a thud on lock, a rising chord on a line clear that scales with the number of lines cleared at once, and a flourish on a tetris (four lines at once).

## The core appeal

Tetris is one of the few games whose rule set is small enough to print on a postcard and whose skill ceiling is, in practice, unbounded. Three properties account for this:

1. **Information asymmetry against the self.** The next-queue gives you the next several pieces, but not all of them. You are always planning under partial information, and the plans you make for piece N constrain the moves available to you for piece N+4.

2. **Compounding consequence.** A poor placement does not cost you a turn; it costs you every turn that comes after, because the badly placed cell sits in the stack until you clear the line containing it. The game punishes you slowly.

3. **Forced acceleration.** Gravity increases with every ten lines cleared. The game does not let you stall in your comfort zone. At high levels the piece is, effectively, instantaneously at the bottom of the well, and the only thing you control is rotation and horizontal position during the lock-delay window. This is a different game from level 1, played by the same rules.

The aesthetic is also unusually satisfying. Most puzzle games reward the player with abstract congratulations: a number goes up, a meter fills. Tetris rewards the player by physically removing the mess they cleaned up. The well shortens. The stack falls. This is, possibly, the cleanest reinforcement loop in the medium.

## Cultural footprint

Tetris has sold more than 520 million copies across all platforms — more than any video game ever made except Minecraft. It has been ported to essentially every computing device with a screen, including oscilloscopes, graphing calculators, the side of buildings (the MIT Green Building in 2012), and a single strand of bacteria (academic prank, 2005).

The game is studied in psychology: the "Tetris effect," the involuntary visualization of falling blocks during sleep onset after a long session, is a documented phenomenon and has been used in clinical trials to interrupt the consolidation of traumatic memories. It is studied in computer science: optimal play is NP-complete (Demaine, Hohenberger, Liben-Nowell, 2002). It is studied in design: Tetris is the canonical example, in nearly every textbook on game design, of a game whose appeal is intrinsic to its mechanic rather than to its presentation.

Competitive Tetris is a live scene. The Classic Tetris World Championship (NES Tetris, 1989 ruleset) has run annually since 2010 and now routinely produces players who clear past level 30 — a level the original developers did not believe a human could reach. Modern Guideline Tetris has its own competitive ladder, dominated by Korean and Japanese players, with formats including sprint (clear 40 lines as fast as possible), ultra (score as high as possible in two minutes), and head-to-head garbage-sending versus modes.

This document specifies a single-player, Marathon-mode, Guideline-compliant implementation of Tetris suitable for embedding in a browser-based arcade.

## Scope of this implementation

- Single-player Marathon mode only.
- Guideline-compliant: SRS rotation, 7-bag randomizer, hold piece, ghost piece, T-spin recognition, back-to-back bonus, combo counter.
- Keyboard input only. No touch or pointer input.
- 2D canvas rendering.
- High score persisted to `localStorage`.
- No multiplayer, no garbage lines, no zone mechanic, no licensed music.

See `gameplay.md` for the player-facing rules and `engineering.md` for the implementation specification.
