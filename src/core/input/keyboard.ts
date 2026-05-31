export interface KeyboardOptions {
  /** Event target to listen on. Default `window`. */
  target?: EventTarget;
  /** KeyboardEvent.code values for which preventDefault should be called (e.g. arrow keys, Space). */
  preventDefault?: readonly string[];
}

export interface Keyboard {
  /** True while the key is currently held down. */
  isDown(code: string): boolean;
  /** True if the key was pressed since the last consume; consumes the edge. */
  consumePress(code: string): boolean;
  /** Snapshot of which codes are currently held. */
  pressed(): ReadonlySet<string>;
  attach(): void;
  detach(): void;
}

export function createKeyboard(opts: KeyboardOptions = {}): Keyboard {
  const target = opts.target ?? window;
  const preventSet = new Set(opts.preventDefault ?? []);

  const down = new Set<string>();
  const pressedSinceConsume = new Set<string>();

  const onKeyDown = (e: Event): void => {
    const ev = e as KeyboardEvent;
    if (preventSet.has(ev.code)) ev.preventDefault();
    if (ev.repeat) return;
    down.add(ev.code);
    pressedSinceConsume.add(ev.code);
  };

  const onKeyUp = (e: Event): void => {
    const ev = e as KeyboardEvent;
    down.delete(ev.code);
  };

  const onBlur = (): void => {
    down.clear();
  };

  return {
    isDown: (code) => down.has(code),
    consumePress: (code) => {
      const had = pressedSinceConsume.has(code);
      pressedSinceConsume.delete(code);
      return had;
    },
    pressed: () => down,
    attach(): void {
      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
    },
    detach(): void {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      down.clear();
      pressedSinceConsume.clear();
    },
  };
}
