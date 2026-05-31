import {
  createLoop,
  createKeyboard,
  createStorage,
  mountCanvas,
  mulberry32,
  type Loop,
  type Keyboard,
  type CanvasMount,
} from '../../../core';
import { DEFAULT_CONFIG, SnakeConfig, tickIntervalFor } from './config';
import { DirectionQueue, KEY_TO_DIRECTION, PREVENT_DEFAULT_CODES } from './input';
import { render } from './renderer';
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
    border: '1px solid #2a2f38',
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
    // 1/2/3: adjust the input queue depth. Smaller = snappier but inputs drop
    // sooner; larger = more forgiving but inputs may feel "remembered too long".
    if (keyboard.consumePress('Digit1')) queue.resize(1);
    if (keyboard.consumePress('Digit2')) queue.resize(2);
    if (keyboard.consumePress('Digit3')) queue.resize(3);
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
    const events = step(state, nextDir, performance.now(), rng, cfg);
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
    render(mount.ctx, state, cfg, performance.now(), alpha);
  };

  const loop: Loop = createLoop({
    tickIntervalMs: cfg.startTickMs,
    tick,
    render: draw,
    pauseOnHidden: true,
  });

  return {
    start(): void {
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
  };
}
