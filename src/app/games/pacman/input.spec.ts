import { TurnBuffer, KEY_TO_DIRECTION } from './input';

describe('pacman input', () => {
  describe('TurnBuffer', () => {
    it('starts empty', () => {
      const b = new TurnBuffer();
      expect(b.peek()).toBeNull();
      expect(b.consume()).toBeNull();
    });

    it('overwrites the previous slot when a new direction is pressed', () => {
      const b = new TurnBuffer();
      b.set('up');
      b.set('left');
      expect(b.peek()).toBe('left');
    });

    it('consume clears the slot', () => {
      const b = new TurnBuffer();
      b.set('right');
      expect(b.consume()).toBe('right');
      expect(b.peek()).toBeNull();
    });

    it('clear empties the buffer', () => {
      const b = new TurnBuffer();
      b.set('up');
      b.clear();
      expect(b.peek()).toBeNull();
    });
  });

  describe('KEY_TO_DIRECTION', () => {
    it('maps arrows', () => {
      expect(KEY_TO_DIRECTION['ArrowUp']).toBe('up');
      expect(KEY_TO_DIRECTION['ArrowDown']).toBe('down');
      expect(KEY_TO_DIRECTION['ArrowLeft']).toBe('left');
      expect(KEY_TO_DIRECTION['ArrowRight']).toBe('right');
    });
    it('maps WASD', () => {
      expect(KEY_TO_DIRECTION['KeyW']).toBe('up');
      expect(KEY_TO_DIRECTION['KeyA']).toBe('left');
      expect(KEY_TO_DIRECTION['KeyS']).toBe('down');
      expect(KEY_TO_DIRECTION['KeyD']).toBe('right');
    });
  });
});
