import type { Sound } from '../../../core';

/**
 * Per-game SFX map for Snake. Each key is the name passed to `audio.play()`
 * at the corresponding event site in `game.ts`.
 */
export const SNAKE_SFX: Record<string, Sound> = {
  chomp:       { frequencies: [440, 520],            durationMs: 60,  wave: 'square',   gain: 0.22 },
  bonus:       { frequencies: [660, 880, 1100],      durationMs: 180, wave: 'square',   gain: 0.24 },
  lengthBonus: { frequencies: [880],                 durationMs: 60,  wave: 'triangle', gain: 0.2  },
  death:       { frequencies: [440, 330, 220, 110],  durationMs: 600, wave: 'sawtooth', gain: 0.26 },
};

export type SnakeSfxKey = keyof typeof SNAKE_SFX;
