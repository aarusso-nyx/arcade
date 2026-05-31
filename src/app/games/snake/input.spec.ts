import { DirectionQueue } from './input';

describe('DirectionQueue', () => {
  it('queues a direction perpendicular to the live one', () => {
    const q = new DirectionQueue();
    expect(q.enqueue('up', 'right')).toBeTrue();
    expect(q.shift()).toBe('up');
  });

  it('rejects a direction that reverses the live direction when queue is empty', () => {
    const q = new DirectionQueue();
    expect(q.enqueue('left', 'right')).toBeFalse();
    expect(q.size).toBe(0);
  });

  it('rejects a direction that reverses the queue tail', () => {
    // The scenario from spec §3: moving east, press north then south on the
    // same tick. North is legal vs east; south would reverse the queued north.
    const q = new DirectionQueue();
    expect(q.enqueue('up', 'right')).toBeTrue();
    expect(q.enqueue('down', 'right')).toBeFalse();
    expect(q.size).toBe(1);
    expect(q.shift()).toBe('up');
  });

  it('rejects a duplicate of the live direction with empty queue', () => {
    const q = new DirectionQueue();
    expect(q.enqueue('right', 'right')).toBeFalse();
  });

  it('drops the oldest entry when capacity (2) is exceeded', () => {
    const q = new DirectionQueue();
    q.enqueue('up', 'right');
    q.enqueue('left', 'right');
    // queue is now [up, left]; live=right
    // Adding 'down' would reverse 'up' from the head — but the guard checks the
    // tail (last), which is 'left'. 'down' is perpendicular to 'left', so it's
    // accepted and 'up' is dropped (FIFO capacity).
    q.enqueue('down', 'right');
    expect(q.size).toBe(2);
    expect(q.shift()).toBe('left');
    expect(q.shift()).toBe('down');
  });

  it('clear empties the queue', () => {
    const q = new DirectionQueue();
    q.enqueue('up', 'right');
    q.clear();
    expect(q.size).toBe(0);
  });
});
