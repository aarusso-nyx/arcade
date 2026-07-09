import type { Sound } from '../../../core';

export const BRICKS_SFX: Record<string, Sound> = {
  launch:    { frequencies: [440, 660],            durationMs: 90,  wave: 'square',   gain: 0.2  },
  paddle:    { frequencies: [300],                 durationMs: 45,  wave: 'triangle', gain: 0.18 },
  wall:      { frequencies: [220],                 durationMs: 35,  wave: 'square',   gain: 0.12 },
  brick:     { frequencies: [720, 960],            durationMs: 80,  wave: 'square',   gain: 0.22 },
  clear:     { frequencies: [660, 880, 1175, 1568], durationMs: 360, wave: 'triangle', gain: 0.24 },
  lifeLost:  { frequencies: [330, 220, 165],       durationMs: 320, wave: 'sawtooth', gain: 0.22 },
  gameover:  { frequencies: [440, 330, 220, 110],  durationMs: 520, wave: 'sawtooth', gain: 0.24 },
};

export type BricksSfxKey = keyof typeof BRICKS_SFX;
