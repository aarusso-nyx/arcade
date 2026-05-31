import { InputBuffer } from './buffer';

describe('InputBuffer', () => {
  it('starts empty', () => {
    const b = new InputBuffer<string>();
    expect(b.isEmpty).toBeTrue();
    expect(b.size).toBe(0);
    expect(b.peek()).toBeUndefined();
    expect(b.shift()).toBeUndefined();
  });

  it('pushes and shifts FIFO', () => {
    const b = new InputBuffer<string>(3);
    b.push('a');
    b.push('b');
    expect(b.size).toBe(2);
    expect(b.peek()).toBe('a');
    expect(b.shift()).toBe('a');
    expect(b.shift()).toBe('b');
    expect(b.isEmpty).toBeTrue();
  });

  it('drops the oldest entry when capacity is exceeded', () => {
    const b = new InputBuffer<string>(2);
    b.push('a');
    b.push('b');
    b.push('c');
    expect(b.size).toBe(2);
    expect(b.peek()).toBe('b');
    expect(b.peekLast()).toBe('c');
  });

  it('clear empties the buffer', () => {
    const b = new InputBuffer<string>();
    b.push('a');
    b.clear();
    expect(b.isEmpty).toBeTrue();
  });

  it('rejects capacity < 1', () => {
    expect(() => new InputBuffer<string>(0)).toThrow();
  });
});
