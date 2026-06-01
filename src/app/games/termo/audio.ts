import type { Sound } from '../../../core';

/**
 * Per-game SFX map for Termo. Keys are the names passed to `audio.play()`
 * at the corresponding event site in `game.ts` / the component's effect
 * handler / the flip-reveal scheduler.
 */
export const TERMO_SFX: Record<string, Sound> = {
  tileFlip:   { frequencies: [880],                  durationMs: 35,  wave: 'square',   gain: 0.16 },
  invalid:    { frequencies: [180, 140],             durationMs: 220, wave: 'sawtooth', gain: 0.22 },
  rowReveal:  { frequencies: [523, 659, 784],        durationMs: 260, wave: 'triangle', gain: 0.22 },
  win:        { frequencies: [523, 659, 784, 1046],  durationMs: 520, wave: 'square',   gain: 0.26 },
  loss:       { frequencies: [392, 330, 262, 196],   durationMs: 640, wave: 'sawtooth', gain: 0.24 },
};

export type TermoSfxKey = keyof typeof TERMO_SFX;
