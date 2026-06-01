import type { Sound } from '../../../core';

/**
 * Per-game SFX map for Tetris. Keys are the names passed to `audio.play()`
 * at the corresponding event site in `game.ts`.
 *
 * The line-clear hierarchy (single → tetris) deliberately grows in pitch and
 * note-count so the player gets escalating positive feedback. T-spin uses a
 * distinctive octave jump to stand apart from the standard line-clear chimes.
 */
export const TETRIS_SFX: Record<string, Sound> = {
  lock:        { frequencies: [180],                       durationMs: 60,  wave: 'square',   gain: 0.18 },
  single:      { frequencies: [880, 1175],                 durationMs: 200, wave: 'triangle', gain: 0.22 },
  double:      { frequencies: [880, 1175, 1318],           durationMs: 260, wave: 'triangle', gain: 0.24 },
  triple:      { frequencies: [880, 1175, 1318, 1568],     durationMs: 320, wave: 'triangle', gain: 0.26 },
  tetris:      { frequencies: [1046, 1318, 1568, 2093],    durationMs: 420, wave: 'square',   gain: 0.28 },
  tspin:       { frequencies: [660, 1320],                 durationMs: 220, wave: 'square',   gain: 0.26 },
  b2b:         { frequencies: [1320, 1760, 2093],          durationMs: 280, wave: 'square',   gain: 0.26 },
  hold:        { frequencies: [620, 740],                  durationMs: 90,  wave: 'sine',     gain: 0.2  },
  gameover:    { frequencies: [660, 523, 392, 262, 196],   durationMs: 700, wave: 'sawtooth', gain: 0.28 },
};

export type TetrisSfxKey = keyof typeof TETRIS_SFX;
