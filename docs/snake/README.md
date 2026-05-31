# Snake

A web-based implementation of the classic Snake arcade game.

## What it is

Snake is a single-player game played on a rectangular grid. The player controls a line of segments — the "snake" — that moves continuously across the grid one cell at a time. The player steers by choosing one of four cardinal directions. Each time the head enters a cell containing food, the snake grows by one segment and a new piece of food appears elsewhere. The game ends when the snake's head collides with a wall (in classic mode) or with its own body.

The core tension is self-inflicted: the longer you survive, the longer the snake becomes, and the harder it is to avoid running into yourself. The board, the snake, and the food are the only objects on screen. There are no enemies, no projectiles, no levels in the traditional sense. Difficulty rises through two coupled mechanisms — the snake gets longer, and the tick rate gets faster.

## Origin

Snake's lineage runs through three distinct eras.

**Blockade (Gremlin Industries, 1976).** The mechanic first appeared in a two-player arcade cabinet called Blockade. Each player controlled a line that grew one segment per frame, leaving a permanent trail. The goal was to outlast the opponent by forcing them into a wall or trail. Blockade is the direct ancestor of both Snake and the Tron light-cycle game.

**Nokia 6110 (1997).** Taneli Armanto's port of Snake, preloaded on the Nokia 6110, turned the game into a generational phenomenon. The 84x48-pixel monochrome LCD displayed a single snake, dots of food, and a score. With no install step and no cost, hundreds of millions of people played it on idle commutes throughout the late 1990s and 2000s. The Nokia version cemented the single-player, food-eating variant as the canonical form.

**Web era.** Browser implementations are now ubiquitous — from the Google search Easter egg to thousands of educational coding tutorials. Snake has become a standard exercise for new programmers because its rules fit on an index card while exercising grids, queues, game loops, collision detection, and input handling.

## Look and feel

The visual language is deliberately spartan: a bounded play area, a snake rendered as a chain of equal-sized cells, food rendered as a single cell with a distinct color or shape, and a score in the corner. Movement is discrete — the snake snaps from cell to cell on each tick rather than gliding. The tick produces a steady, almost metronomic rhythm that accelerates as you eat. Sound, if any, is a short click on each food pickup and a terminal tone on death.

The aesthetic does not need decoration to work. Most successful Snake implementations rely on:

- A flat background, often dark.
- Two or three colors for snake, food, and (optionally) bonus food.
- A monospaced score display.
- Subtle motion polish — a brief food pulse, a flash on death.

## The appeal of minimalism

Snake has survived for fifty years because its rule set is irreducible. You cannot remove a rule without breaking the game, and adding rules tends to make it worse. The result is a game that:

- Is legible at a glance. A new player understands the goal within two seconds of watching.
- Demands no tutorial. The first death teaches the lesson.
- Rewards planning. Every food forces you to think one or two turns ahead about where your tail will be.
- Scales difficulty automatically. The player's success is what makes the game harder; no designer-tuned curve is required.
- Renders in any medium. ASCII, LED matrices, 84x48 LCDs, retina displays, and watch faces all suffice.

This implementation aims to honor that minimalism. The default presentation is a clean grid with the smallest set of features that produce the classic experience. Modes and polish are layered on top as opt-ins, never as defaults.
