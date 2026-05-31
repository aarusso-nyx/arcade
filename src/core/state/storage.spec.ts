import { createStorage } from './storage';

describe('createStorage', () => {
  beforeEach(() => localStorage.clear());

  it('namespaces keys', () => {
    const s = createStorage('arcade.pacman');
    s.set('highScore', 1234);
    expect(localStorage.getItem('arcade.pacman.highScore')).toBe('1234');
  });

  it('returns the fallback for missing keys', () => {
    const s = createStorage('arcade.pacman');
    expect(s.get('missing', 0)).toBe(0);
    expect(s.get('missing', { foo: 'bar' })).toEqual({ foo: 'bar' });
  });

  it('round-trips primitives and objects', () => {
    const s = createStorage('arcade.test');
    s.set('n', 42);
    s.set('s', 'hello');
    const obj = { a: 1, b: [true, false] };
    s.set('o', obj);
    expect(s.get('n', 0)).toBe(42);
    expect(s.get('s', '')).toBe('hello');
    expect(s.get<typeof obj | null>('o', null)).toEqual(obj);
  });

  it('removes individual keys', () => {
    const s = createStorage('arcade.test');
    s.set('a', 1);
    s.remove('a');
    expect(s.get('a', -1)).toBe(-1);
  });

  it('clearNamespace only removes keys under the namespace', () => {
    const s = createStorage('arcade.test');
    s.set('a', 1);
    s.set('b', 2);
    localStorage.setItem('other.unrelated', 'keep');
    s.clearNamespace();
    expect(s.get('a', -1)).toBe(-1);
    expect(s.get('b', -1)).toBe(-1);
    expect(localStorage.getItem('other.unrelated')).toBe('keep');
  });

  it('strips a trailing dot from the namespace', () => {
    const s = createStorage('arcade.pacman.');
    s.set('k', 1);
    expect(localStorage.getItem('arcade.pacman.k')).toBe('1');
  });

  it('falls back gracefully when localStorage throws', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    const s = createStorage('arcade.test');
    expect(s.get('any', 'fallback')).toBe('fallback');
    Storage.prototype.getItem = original;
  });
});
