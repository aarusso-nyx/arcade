import type { Sound } from '../../../core';

/**
 * Per-game SFX map for Pac-Man. Keys are the names passed to `audio.play()`
 * at the corresponding event site in `game.ts`.
 *
 * The pellet sound alternates `pelletA` / `pelletB` per pellet to produce the
 * canonical "waka-waka" alternation. The renderer's tick handler picks the
 * right key based on a parity bit on the world state.
 */
export const PACMAN_SFX: Record<string, Sound> = {
  pelletA:    { frequencies: [520],                       durationMs: 50,  wave: 'square',   gain: 0.16 },
  pelletB:    { frequencies: [392],                       durationMs: 50,  wave: 'square',   gain: 0.16 },
  power:      { frequencies: [330, 440, 587, 784],        durationMs: 320, wave: 'square',   gain: 0.24 },
  eatGhost:   { frequencies: [1568, 1175, 880, 587, 392], durationMs: 360, wave: 'sawtooth', gain: 0.26 },
  fruit:      { frequencies: [880, 1175, 1568],           durationMs: 200, wave: 'triangle', gain: 0.24 },
  extraLife:  { frequencies: [784, 1046, 1318, 1568, 2093], durationMs: 520, wave: 'square', gain: 0.26 },
  death:      { frequencies: [880, 740, 620, 520, 392, 262, 196, 130], durationMs: 1100, wave: 'sawtooth', gain: 0.28 },
};

export type PacmanSfxKey = keyof typeof PACMAN_SFX;
