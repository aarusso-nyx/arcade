import type { Direction } from '../../../core';

export const KEY_TO_DIRECTION: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

// Escape is intentionally NOT bound here — the Angular component intercepts
// it for the global pause → quit-to-home behaviour. KeyP and Space pause.
export const PAUSE_CODES = ['KeyP', 'Space'] as const;
export const ACTION_CODES = ['Enter'] as const;

export const PREVENT_DEFAULT_CODES = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
] as const;

/**
 * Single-slot turn buffer (spec § 4.2, § 10.3). New input overwrites the
 * existing buffered direction. The buffer is consumed (cleared) the moment
 * the direction is successfully applied to Pac-Man.
 */
export class TurnBuffer {
  private slot: Direction | null = null;

  set(dir: Direction): void {
    this.slot = dir;
  }

  peek(): Direction | null {
    return this.slot;
  }

  consume(): Direction | null {
    const d = this.slot;
    this.slot = null;
    return d;
  }

  clear(): void {
    this.slot = null;
  }
}
