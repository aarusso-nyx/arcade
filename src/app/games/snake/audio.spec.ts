import { SNAKE_SFX } from './audio';

describe('SNAKE_SFX', () => {
  it('exposes the expected event keys', () => {
    expect(Object.keys(SNAKE_SFX).sort()).toEqual(
      ['bonus', 'chomp', 'death', 'lengthBonus'].sort(),
    );
  });

  it('every entry has a non-empty frequency list and positive duration', () => {
    for (const [name, sound] of Object.entries(SNAKE_SFX)) {
      expect(sound.frequencies.length).toBeGreaterThan(0);
      expect(sound.durationMs).toBeGreaterThan(0);
      expect(sound.frequencies.every((f) => f > 0)).withContext(name).toBe(true);
    }
  });
});
