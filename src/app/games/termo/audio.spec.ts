import { TERMO_SFX } from './audio';

describe('TERMO_SFX', () => {
  it('exposes the expected event keys', () => {
    expect(Object.keys(TERMO_SFX).sort()).toEqual(
      ['invalid', 'loss', 'rowReveal', 'tileFlip', 'win'].sort(),
    );
  });

  it('every entry has a non-empty frequency list and positive duration', () => {
    for (const [name, sound] of Object.entries(TERMO_SFX)) {
      expect(sound.frequencies.length).toBeGreaterThan(0);
      expect(sound.durationMs).toBeGreaterThan(0);
      expect(sound.frequencies.every((f) => f > 0)).withContext(name).toBe(true);
    }
  });
});
