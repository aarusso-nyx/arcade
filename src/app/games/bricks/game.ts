import {
  createAudio,
  createKeyboard,
  createLoop,
  createStorage,
  getCurrentTheme,
  mountCanvas,
  registerSounds,
  subscribeTheme,
  type Audio,
  type CanvasMount,
  type Keyboard,
  type Loop,
} from '../../../core';
import { BRICKS_SFX } from './audio';
import { DEFAULT_CONFIG, type BricksConfig } from './config';
import { createInitialState, launchBall, movePaddle, startRun, stepBricks, togglePause } from './state';
import { renderBricks } from './renderer';
import type { BricksState, BricksStatus } from './types';

export interface BricksGame {
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  destroy(): void;
  toggleMute(): boolean;
  readonly muted: boolean;
  readonly state: BricksState;
  onChange(cb: (snapshot: BricksSnapshot) => void): () => void;
}

export interface BricksSnapshot {
  readonly score: number;
  readonly highScore: number;
  readonly lives: number;
  readonly level: number;
  readonly bricksRemaining: number;
  readonly status: BricksStatus;
}

export interface BricksOptions extends Partial<BricksConfig> {}

const STORAGE_NS = 'arcade.bricks';
const PREVENT_DEFAULT_CODES = ['ArrowLeft', 'ArrowRight', 'Space', 'Enter'] as const;

export function createBricksGame(host: HTMLElement, opts: BricksOptions = {}): BricksGame {
  const cfg: BricksConfig = { ...DEFAULT_CONFIG, ...opts };
  const storage = createStorage(STORAGE_NS);
  const highScore = storage.get<number>(cfg.storageKey, 0);
  const audio: Audio = createAudio();
  registerSounds(audio, BRICKS_SFX);

  const mountHost = document.createElement('div');
  mountHost.style.width = `${cfg.width}px`;
  mountHost.style.height = `${cfg.height}px`;
  mountHost.style.maxWidth = '100%';
  mountHost.style.maxHeight = '100%';
  host.appendChild(mountHost);

  const canvas: CanvasMount = mountCanvas(mountHost, {
    logicalWidth: cfg.width,
    logicalHeight: cfg.height,
    scaling: 'fit',
    background: getCurrentTheme().games.bricks.bg,
  });
  const keyboard: Keyboard = createKeyboard({ preventDefault: PREVENT_DEFAULT_CODES });
  let state = createInitialState(cfg, highScore);
  const subscribers = new Set<(snapshot: BricksSnapshot) => void>();

  const notify = (): void => {
    const snapshot: BricksSnapshot = {
      score: state.score,
      highScore: state.highScore,
      lives: state.lives,
      level: state.level,
      bricksRemaining: state.bricksRemaining,
      status: state.status,
    };
    for (const cb of subscribers) cb(snapshot);
  };

  const persistHigh = (): void => {
    storage.set(cfg.storageKey, state.highScore);
  };

  const reset = (): void => {
    const retainedHigh = state.highScore;
    state = createInitialState(cfg, retainedHigh);
    startRun(state, cfg);
    notify();
  };

  const tick = (): void => {
    handleInput();

    const direction = keyboard.isDown('ArrowLeft') || keyboard.isDown('KeyA')
      ? -1
      : keyboard.isDown('ArrowRight') || keyboard.isDown('KeyD')
        ? 1
        : 0;
    movePaddle(state, direction, cfg);

    const beforeHigh = state.highScore;
    const events = stepBricks(state, cfg);
    if (events.wallHit) audio.play('wall');
    if (events.paddleHit) audio.play('paddle');
    if (events.brickHits > 0) audio.play('brick');
    if (events.levelCleared) audio.play('clear');
    if (events.lifeLost) audio.play('lifeLost');
    if (events.gameOver) audio.play('gameover');
    if (state.highScore !== beforeHigh) persistHigh();
    notify();
  };

  const handleInput = (): void => {
    if (keyboard.consumePress('Enter')) {
      if (state.status === 'idle' || state.status === 'gameover') {
        reset();
      } else if (state.stuckToPaddle) {
        launchBall(state, cfg);
        audio.play('launch');
      }
    }
    if (keyboard.consumePress('Space')) {
      if (state.status === 'idle' || state.status === 'gameover') {
        reset();
      } else if (state.stuckToPaddle) {
        launchBall(state, cfg);
        audio.play('launch');
      } else if (state.status === 'playing' || state.status === 'paused') {
        togglePause(state);
      }
    }
    if (keyboard.consumePress('KeyP')) {
      togglePause(state);
    }
  };

  const render = (): void => {
    canvas.beginFrame(getCurrentTheme().games.bricks.bg);
    renderBricks(canvas.ctx, state, cfg);
  };

  const unsubTheme = subscribeTheme(() => render());

  const loop: Loop = createLoop({
    tickIntervalMs: cfg.tickIntervalMs,
    tick,
    render,
    pauseOnHidden: true,
  });

  return {
    start(): void {
      keyboard.attach();
      loop.start();
      render();
      notify();
    },
    pause(): void {
      if (state.status === 'playing' || state.status === 'ready') {
        togglePause(state);
        notify();
      }
    },
    resume(): void {
      if (state.status === 'paused') {
        togglePause(state);
        notify();
      }
    },
    reset,
    destroy(): void {
      loop.stop();
      keyboard.detach();
      canvas.destroy();
      mountHost.remove();
      audio.destroy();
      unsubTheme();
      subscribers.clear();
    },
    toggleMute(): boolean {
      return audio.toggleMute();
    },
    get muted(): boolean {
      return audio.muted;
    },
    get state(): BricksState {
      return state;
    },
    onChange(cb): () => void {
      subscribers.add(cb);
      cb({
        score: state.score,
        highScore: state.highScore,
        lives: state.lives,
        level: state.level,
        bricksRemaining: state.bricksRemaining,
        status: state.status,
      });
      return () => subscribers.delete(cb);
    },
  };
}
