import {
  createKeyboard,
  createLoop,
  createStorage,
  mountCanvas,
  mulberry32,
  type CanvasMount,
  type Keyboard,
  type Loop,
} from '../../../core';
import { COLS, DEFAULT_CONFIG, type TetrisConfig } from './config';
import {
  createDASState,
  dasOnKeyDown,
  dasOnKeyUp,
  PREVENT_DEFAULT_CODES,
  tickDAS,
  type DASState,
} from './input';
import { createLockState, shouldLock, tickLock, tryResetLock } from './lock';
import { SevenBag } from './randomizer';
import { renderPlayfield, renderSidePanel } from './renderer';
import {
  applyGravity,
  awardDropPoints,
  createInitialState,
  hardDrop,
  isGrounded,
  lockAndScore,
  spawnFromBag,
  tickLineClear,
  tryHold,
  tryRotatePiece,
  tryTranslate,
} from './state';
import type { GameState } from './types';

export interface TetrisGame {
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  destroy(): void;
  readonly state: GameState;
  readonly highScore: number;
  onChange(cb: (snapshot: TetrisSnapshot) => void): () => void;
}

export interface TetrisSnapshot {
  score: number;
  lines: number;
  level: number;
  highScore: number;
  status: GameState['status'];
  combo: number;
  b2b: boolean;
}

export interface TetrisOptions extends Partial<TetrisConfig> {
  seed?: number;
}

const STORAGE_NS = 'arcade.tetris';

export function createTetrisGame(host: HTMLElement, opts: TetrisOptions = {}): TetrisGame {
  const cfg: TetrisConfig = { ...DEFAULT_CONFIG, ...opts };
  const seed = opts.seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  let rng = mulberry32(seed);
  const storage = createStorage(STORAGE_NS);

  let state: GameState = createInitialState();
  let bag = new SevenBag(rng);
  let highScore = storage.get<number>(cfg.storageKey, 0);

  const subscribers = new Set<(s: TetrisSnapshot) => void>();
  const notify = (): void => {
    const snap: TetrisSnapshot = {
      score: state.score,
      lines: state.lines,
      level: state.level,
      highScore,
      status: state.status,
      combo: state.combo,
      b2b: state.b2bActive,
    };
    for (const cb of subscribers) cb(snap);
  };

  // Build a wrapper element so we can side-by-side the playfield + side panel.
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'row';
  wrap.style.alignItems = 'flex-start';
  wrap.style.justifyContent = 'center';
  wrap.style.gap = '12px';
  host.appendChild(wrap);

  // Explicit pixel sizes for both panels so mountCanvas can measure a real
  // box on first apply() — otherwise flex children with no intrinsic content
  // report clientWidth = 0 and the canvas falls back to scale = 1 at logical
  // size, which on a high-pixel-density display is tiny.
  const playWidthPx = COLS * cfg.cellPx;
  const playHeightPx = cfg.rows * cfg.cellPx;
  const sideWidthPx = 5 * cfg.previewCellPx + 24;
  const sideHeightPx =
    4 * cfg.previewCellPx + 12 + cfg.nextQueueLength * (3 * cfg.previewCellPx) + 30 + 24;

  const playHost = document.createElement('div');
  playHost.style.flex = '0 0 auto';
  playHost.style.width = `${playWidthPx}px`;
  playHost.style.height = `${playHeightPx}px`;
  const sideHost = document.createElement('div');
  sideHost.style.flex = '0 0 auto';
  sideHost.style.width = `${sideWidthPx}px`;
  sideHost.style.height = `${sideHeightPx}px`;
  wrap.appendChild(playHost);
  wrap.appendChild(sideHost);

  const playMount: CanvasMount = mountCanvas(playHost, {
    logicalWidth: playWidthPx,
    logicalHeight: playHeightPx,
    scaling: 'fit',
    background: '#0b0d10',
  });
  const sideMount: CanvasMount = mountCanvas(sideHost, {
    logicalWidth: sideWidthPx,
    logicalHeight: sideHeightPx,
    scaling: 'fit',
    background: '#14171c',
  });

  // DAS state.
  const dasLeft: DASState = createDASState();
  const dasRight: DASState = createDASState();
  // Track left/right pressed for "last direction wins".
  let lastHorizontalKey: 'left' | 'right' | null = null;

  const keyboard: Keyboard = createKeyboard({ preventDefault: PREVENT_DEFAULT_CODES });

  // We need keydown / keyup edges as fed by createKeyboard's consumePress + isDown.
  // The core keyboard only exposes consumePress for the first edge; for held detection
  // we use isDown(). DAS state machine needs explicit press transitions, so we track them.
  const wasDown = new Set<string>();

  const onPressed = (code: string): boolean => keyboard.consumePress(code);

  const lockState = { state: createLockState() };

  const beginGame = (): void => {
    rng = mulberry32(seed ^ (state.score | 0) ^ Date.now());
    bag = new SevenBag(rng);
    state = createInitialState();
    state.status = 'playing';
    state.startedAtMs = performance.now();
    lockState.state = createLockState();
    dasOnKeyUp(dasLeft);
    dasOnKeyUp(dasRight);
    lastHorizontalKey = null;
    wasDown.clear();
    spawnFromBag(state, bag, cfg);
    notify();
  };

  let resumeTo: GameState['status'] = 'playing';
  const togglePause = (): void => {
    if (state.status === 'playing' || state.status === 'lineclear') {
      resumeTo = state.status;
      state.status = 'paused';
    } else if (state.status === 'paused') {
      state.status = resumeTo;
    }
    notify();
  };

  const tryHorizontal = (dx: number): void => {
    if (!state.active) return;
    const moved = tryTranslate(state, dx, 0);
    if (moved) {
      if (isGrounded(state)) {
        lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
      }
    }
  };

  const tryRotate = (dir: 'CW' | 'CCW' | '180'): void => {
    if (!state.active) return;
    const ok = tryRotatePiece(state, dir);
    if (ok) {
      if (isGrounded(state)) {
        lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
      }
    }
  };

  const doHardDrop = (): void => {
    if (!state.active) return;
    const cells = hardDrop(state);
    if (cells > 0) {
      awardDropPoints(state, 0, cells);
      notify();
    }
    forceLock();
  };

  const forceLock = (): void => {
    const events = lockAndScore(state, cfg);
    if (events.scoreDelta > 0 || events.lineClear) notify();
    if (state.status === 'gameover') {
      persistHigh();
      notify();
      return;
    }
    if (events.lineClear) {
      // animation tick handles spawning afterward.
      return;
    }
    afterLockSpawn();
  };

  const afterLockSpawn = (): void => {
    lockState.state = createLockState();
    const top = spawnFromBag(state, bag, cfg);
    if (top !== null) {
      persistHigh();
      notify();
    } else {
      notify();
    }
  };

  const persistHigh = (): void => {
    if (state.score > highScore) {
      highScore = state.score;
      storage.set(cfg.storageKey, highScore);
    }
  };

  /** Handle key edge events (called once per frame for each relevant key). */
  const handleEdges = (): void => {
    // Pause / restart that work regardless of state.
    // Escape is intentionally NOT bound here — the Angular component
    // intercepts it for the global pause → quit-to-home behaviour.
    if (onPressed('KeyP')) {
      if (state.status === 'playing' || state.status === 'paused' || state.status === 'lineclear') {
        togglePause();
      }
    }
    if (onPressed('Enter')) {
      if (state.status === 'idle' || state.status === 'gameover') {
        beginGame();
        return;
      }
    }

    if (state.status !== 'playing') {
      // Drain other edge presses (so they don't fire after resume).
      drainPresses();
      return;
    }

    // Horizontal: track keydown edges via wasDown + isDown delta.
    syncHorizontal('ArrowLeft', dasLeft, -1);
    syncHorizontal('ArrowRight', dasRight, 1);

    // Soft drop is a state (held), not an edge — see tick().
    state.softDropping = keyboard.isDown('ArrowDown');

    if (onPressed('Space')) doHardDrop();

    if (onPressed('ArrowUp') || onPressed('KeyX')) tryRotate('CW');
    if (onPressed('KeyZ')) tryRotate('CCW');
    if (cfg.enableT180 && onPressed('KeyA')) tryRotate('180');

    if (onPressed('KeyC') || onPressed('ShiftLeft') || onPressed('ShiftRight')) {
      const swapped = tryHold(state, bag, cfg);
      if (swapped) lockState.state = createLockState();
    }
  };

  const drainPresses = (): void => {
    for (const code of [
      'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space',
      'KeyX', 'KeyZ', 'KeyA', 'KeyC', 'ShiftLeft', 'ShiftRight',
    ]) {
      keyboard.consumePress(code);
    }
  };

  const syncHorizontal = (code: string, das: DASState, dx: number): void => {
    const justPressed = keyboard.consumePress(code);
    if (justPressed) {
      dasOnKeyDown(das, cfg.dasMs);
      tryHorizontal(dx);
      lastHorizontalKey = dx < 0 ? 'left' : 'right';
      wasDown.add(code);
    }
    const down = keyboard.isDown(code);
    if (!down && wasDown.has(code)) {
      dasOnKeyUp(das);
      wasDown.delete(code);
    }
  };

  const TICK_MS = cfg.tickIntervalMs;

  const tick = (): void => {
    handleEdges();

    if (state.status === 'lineclear') {
      const done = tickLineClear(state, TICK_MS);
      if (done) {
        afterLockSpawn();
      }
      return;
    }
    if (state.status !== 'playing') return;

    // DAS / ARR auto-repeat (left/right). Process in real-ms (== TICK_MS at 60Hz).
    // Last direction wins: if both are pressed, process the most recently pressed.
    const repeats = (dx: number, das: DASState): number => {
      return tickDAS(das, TICK_MS, cfg.dasMs, cfg.arrMs);
    };
    if (lastHorizontalKey === 'left' && dasLeft.pressed) {
      const n = repeats(-1, dasLeft);
      for (let i = 0; i < n; i++) {
        if (!tryTranslate(state, -1, 0)) break;
        if (isGrounded(state)) {
          lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
        }
      }
    } else if (lastHorizontalKey === 'right' && dasRight.pressed) {
      const n = repeats(1, dasRight);
      for (let i = 0; i < n; i++) {
        if (!tryTranslate(state, 1, 0)) break;
        if (isGrounded(state)) {
          lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
        }
      }
    } else if (dasLeft.pressed) {
      // Fallback: left is held even without explicit lastHorizontalKey reset.
      const n = repeats(-1, dasLeft);
      for (let i = 0; i < n; i++) {
        if (!tryTranslate(state, -1, 0)) break;
      }
    } else if (dasRight.pressed) {
      const n = repeats(1, dasRight);
      for (let i = 0; i < n; i++) {
        if (!tryTranslate(state, 1, 0)) break;
      }
    }

    // Gravity (with soft-drop multiplier).
    const { softDropCells } = applyGravity(state, cfg);
    if (softDropCells > 0) {
      awardDropPoints(state, softDropCells, 0);
      notify();
    }

    // Lock-delay update.
    const grounded = isGrounded(state);
    lockState.state = tickLock(lockState.state, TICK_MS, grounded, cfg.lockDelayMs);

    if (grounded && shouldLock(lockState.state)) {
      forceLock();
      return;
    }

    notify();
  };

  const render = (): void => {
    playMount.beginFrame('#0b0d10');
    renderPlayfield(playMount.ctx, state, cfg);
    sideMount.beginFrame('#14171c');
    renderSidePanel(sideMount.ctx, state, cfg);
  };

  const loop: Loop = createLoop({
    tickIntervalMs: TICK_MS,
    tick,
    render,
    pauseOnHidden: true,
  });

  return {
    start(): void {
      keyboard.attach();
      loop.start();
      render();
    },
    pause(): void {
      if (state.status === 'playing') togglePause();
    },
    resume(): void {
      if (state.status === 'paused') togglePause();
    },
    reset: beginGame,
    destroy(): void {
      loop.stop();
      keyboard.detach();
      playMount.destroy();
      sideMount.destroy();
      wrap.remove();
      subscribers.clear();
    },
    get state(): GameState {
      return state;
    },
    get highScore(): number {
      return highScore;
    },
    onChange(cb): () => void {
      subscribers.add(cb);
      const snap: TetrisSnapshot = {
        score: state.score,
        lines: state.lines,
        level: state.level,
        highScore,
        status: state.status,
        combo: state.combo,
        b2b: state.b2bActive,
      };
      cb(snap);
      return () => subscribers.delete(cb);
    },
  };
}
