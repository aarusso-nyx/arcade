import { TETRIS_SFX } from './audio';

describe('TETRIS_SFX', () => {
  it('exposes the expected event keys', () => {
    const expected = [
      'lock',
      'single',
      'double',
      'triple',
      'tetris',
      'tspin',
      'b2b',
      'hold',
      'gameover',
    ].sort();
    expect(Object.keys(TETRIS_SFX).sort()).toEqual(expected);
  });

  it('every entry has a non-empty frequency list and positive duration', () => {
    for (const [name, sound] of Object.entries(TETRIS_SFX)) {
      expect(sound.frequencies.length).toBeGreaterThan(0);
      expect(sound.durationMs).toBeGreaterThan(0);
      expect(sound.frequencies.every((f) => f > 0)).withContext(name).toBe(true);
    }
  });
});
