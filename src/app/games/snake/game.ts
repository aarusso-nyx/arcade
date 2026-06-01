import {
  createAudio,
  createLoop,
  createKeyboard,
  createStorage,
  mountCanvas,
  mulberry32,
  registerSounds,
  type Audio,
  type Loop,
  type Keyboard,
  type CanvasMount,
} from '../../../core';
import { SNAKE_SFX } from './audio';
import { DEFAULT_CONFIG, SnakeConfig, tickIntervalFor } from './config';
import { DirectionQueue, KEY_TO_DIRECTION, PREVENT_DEFAULT_CODES } from './input';
import { render } from './renderer';
import { loadPixelFont } from './sprites';
import { createInitialState, step } from './state';
import type { SnakeState } from './types';

export interface SnakeGame {
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  destroy(): void;
  readonly state: SnakeState;
  readonly highScore: number;
  /** Subscribe to score / high-score changes. Returns an unsubscribe fn. */
  onScoreChange(cb: (score: number, highScore: number) => void): () => void;
  /** Toggle global mute. Returns the new muted state. */
  toggleMute(): boolean;
  readonly muted: boolean;
}

export interface SnakeOptions extends Partial<SnakeConfig> {
  /** Fixed PRNG seed (testing/reproducibility). Otherwise derived from Date.now. */
  seed?: number;
}

const STORAGE_NS = 'arcade.snake';

export function createSnakeGame(host: HTMLElement, opts: SnakeOptions = {}): SnakeGame {
  const cfg: SnakeConfig = { ...DEFAULT_CONFIG, ...opts };
  const seed = opts.seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  const rng = mulberry32(seed);
  const storage = createStorage(STORAGE_NS);
  const audio: Audio = createAudio();
  registerSounds(audio, SNAKE_SFX);

  let state: SnakeState = createInitialState(cfg, rng);
  let bestScoreKey = `bestScore.${cfg.mode}`;
  let highScore = storage.get<number>(bestScoreKey, 0);
  const subscribers = new Set<(s: number, hs: number) => void>();
  const notify = (): void => subscribers.forEach((cb) => cb(state.score, highScore));

  const queue = new DirectionQueue(2);
  let lastAlpha = 0;

  const mount: CanvasMount = mountCanvas(host, {
    logicalWidth: cfg.cols * cfg.cellSize,
    logicalHeight: cfg.rows * cfg.cellSize,
    scaling: 'fit',
    background: '#0b0d10',
  });

  const keyboard: Keyboard = createKeyboard({
    preventDefault: PREVENT_DEFAULT_CODES,
  });

  const handleKeyEvents = (): void => {
    for (const code of Object.keys(KEY_TO_DIRECTION)) {
      if (keyboard.consumePress(code)) {
        if (state.status === 'idle' || state.status === 'gameover' || state.status === 'cleared') {
          beginRun();
        }
        if (state.status === 'playing') queue.enqueue(KEY_TO_DIRECTION[code], state.direction);
      }
    }
    if (keyboard.consumePress('Space')) togglePause();
    if (keyboard.consumePress('Enter')) {
      if (state.status === 'idle' || state.status === 'gameover' || state.status === 'cleared') {
        beginRun();
      }
    }
    // T: swap classic <-> wrap mid-session. The current run is sacrificed and
    // a fresh run begins under the new mode (matches the "fresh start" UX
    // described in the spec — also keeps mode-specific high scores honest).
    if (keyboard.consumePress('KeyT')) {
      cfg.mode = cfg.mode === 'classic' ? 'wrap' : 'classic';
      bestScoreKey = `bestScore.${cfg.mode}`;
      highScore = storage.get<number>(bestScoreKey, 0);
      beginRun();
    }
    // [ and ]: adjust the input queue depth (clamped to [1, 3]). Smaller =
    // snappier but inputs drop sooner; larger = more forgiving but inputs
    // may feel "remembered too long". 1/2/3 are reserved for global navigation.
    if (keyboard.consumePress('BracketLeft')) {
      queue.resize(Math.max(1, queue.capacity - 1));
    }
    if (keyboard.consumePress('BracketRight')) {
      queue.resize(Math.min(3, queue.capacity + 1));
    }
  };

  const beginRun = (): void => {
    state = createInitialState(cfg, rng);
    state.status = 'playing';
    queue.clear();
    loop.setTickInterval(cfg.startTickMs);
    notify();
  };

  const togglePause = (): void => {
    if (state.status === 'playing') {
      state.status = 'paused';
      loop.pause();
    } else if (state.status === 'paused') {
      state.status = 'playing';
      loop.resume();
    }
  };

  const tick = (): void => {
    handleKeyEvents();
    if (state.status !== 'playing') return;
    const nextDir = queue.shift();
    const before = state.foodsEaten;
    const lengthBefore = state.body.length;
    const events = step(state, nextDir, performance.now(), rng, cfg);
    if (events.ateFood) audio.play('chomp');
    if (events.ateBonus) audio.play('bonus');
    // Length-cross at multiples of 10 (matches scoring logic in state.ts).
    if (
      events.ateFood &&
      Math.floor(state.body.length / 10) > Math.floor(lengthBefore / 10)
    ) {
      audio.play('lengthBonus');
    }
    if (events.died) audio.play('death');
    if (events.scoreDelta > 0 && state.score > highScore) {
      highScore = state.score;
      storage.set(bestScoreKey, highScore);
    }
    if (events.scoreDelta > 0) notify();
    if (state.foodsEaten !== before) {
      loop.setTickInterval(tickIntervalFor(state.foodsEaten, cfg));
    }
    if (events.died || events.cleared) notify();
  };

  const draw = (alpha = lastAlpha): void => {
    lastAlpha = alpha;
    // beginFrame clears the canvas backing store AND applies ctx.scale, so
    // the renderer's logical (0..cols*cellSize, 0..rows*cellSize) drawing
    // fills the full canvas regardless of the host's actual size.
    mount.beginFrame('#0b0d10');
    render(mount.ctx, state, cfg, { highScore }, performance.now(), alpha);
  };

  const loop: Loop = createLoop({
    tickIntervalMs: cfg.startTickMs,
    tick,
    render: draw,
    pauseOnHidden: true,
  });

  return {
    start(): void {
      void loadPixelFont();
      keyboard.attach();
      loop.start();
      draw();
    },
    pause: togglePause,
    resume(): void {
      if (state.status === 'paused') togglePause();
    },
    reset: beginRun,
    destroy(): void {
      loop.stop();
      keyboard.detach();
      mount.destroy();
      audio.destroy();
      subscribers.clear();
    },
    get state(): SnakeState {
      return state;
    },
    get highScore(): number {
      return highScore;
    },
    onScoreChange(cb): () => void {
      subscribers.add(cb);
      cb(state.score, highScore);
      return () => subscribers.delete(cb);
    },
    toggleMute(): boolean {
      return audio.toggleMute();
    },
    get muted(): boolean {
      return audio.muted;
    },
  };
}
