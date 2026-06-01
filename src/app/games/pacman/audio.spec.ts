import { PACMAN_SFX } from './audio';

describe('PACMAN_SFX', () => {
  it('exposes the expected event keys', () => {
    const expected = [
      'pelletA',
      'pelletB',
      'power',
      'eatGhost',
      'fruit',
      'extraLife',
      'death',
    ].sort();
    expect(Object.keys(PACMAN_SFX).sort()).toEqual(expected);
  });

  it('every entry has a non-empty frequency list and positive duration', () => {
    for (const [name, sound] of Object.entries(PACMAN_SFX)) {
      expect(sound.frequencies.length).toBeGreaterThan(0);
      expect(sound.durationMs).toBeGreaterThan(0);
      expect(sound.frequencies.every((f) => f > 0)).withContext(name).toBe(true);
    }
  });
});
