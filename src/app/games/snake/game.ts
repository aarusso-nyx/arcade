import {
  createAudio,
  createLoop,
  createKeyboard,
  createStorage,
  getCurrentTheme,
  mountCanvas,
  mulberry32,
  registerSounds,
  subscribeTheme,
  type Audio,
  type Loop,
  type Keyboard,
  type CanvasMount,
  type Replay,
  type SnakeAction,
} from '../../../core';
import { SNAKE_SFX } from './audio';
import { DEFAULT_CONFIG, SnakeConfig, tickIntervalFor } from './config';
import { DirectionQueue, KEY_TO_DIRECTION, PREVENT_DEFAULT_CODES } from './input';
import { drawReplayBadge, render } from './renderer';
import {
  createSnakeRecorder,
  createSnakeReplayCursor,
  snakeConfigFromReplay,
  type SnakeReplayCursor,
} from './replay';
import { loadPixelFont } from './sprites';
import { createInitialState, step } from './state';
import type { Direction } from '../../../core';
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
  /**
   * Snapshot of the current run as a shareable `Replay`. Returns null unless
   * recording is enabled and the run has ended (game over or cleared).
   */
  exportReplay(): Replay | null;
  /**
   * Play back a recorded run in spectator mode. Live keyboard input is
   * ignored (except global chrome, which is above this layer). The recorded
   * inputs are dispatched at the same tick numbers they were recorded at.
   */
  replayFrom(replay: Replay): void;
  /** True while a replay is being played back. */
  readonly isReplaying: boolean;
  /** Determinism-check result on replay completion. null while a replay is in progress. */
  readonly replayVerified: boolean | null;
}

export interface SnakeOptions extends Partial<SnakeConfig> {
  /** Fixed PRNG seed (testing/reproducibility). Otherwise derived from Date.now. */
  seed?: number;
}

const STORAGE_NS = 'arcade.snake';

export function createSnakeGame(host: HTMLElement, opts: SnakeOptions = {}): SnakeGame {
  const cfg: SnakeConfig = { ...DEFAULT_CONFIG, ...opts };
  const seedFixed = opts.seed != null;
  let seed = opts.seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  let rng = mulberry32(seed);
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

  // Replay recording + playback. The recorder is always fed on the "live"
  // path — cheap enough to keep on unconditionally so any run is shareable.
  const recorder = createSnakeRecorder();
  let currentTick = 0;
  let replayMode = false;
  let replayCursor: SnakeReplayCursor | null = null;
  let activeReplay: Replay | null = null;
  let replayVerified: boolean | null = null;
  let finalReplay: Replay | null = null;

  const directionToAction = (d: Direction): SnakeAction => d as SnakeAction;

  const applyReplayAction = (action: SnakeAction): void => {
    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        if (state.status === 'playing') queue.enqueue(action, state.direction);
        break;
      case 'pause':
        if (state.status === 'playing') state.status = 'paused';
        break;
      case 'resume':
        if (state.status === 'paused') state.status = 'playing';
        break;
    }
  };

  const finalizeReplayIfEnded = (): void => {
    if (finalReplay || replayMode) return;
    if (state.status === 'gameover' || state.status === 'cleared') {
      finalReplay = recorder.finalize({
        seed,
        cfg,
        endedAtTick: currentTick,
        finalScore: state.score,
      });
    }
  };

  const mount: CanvasMount = mountCanvas(host, {
    logicalWidth: cfg.cols * cfg.cellSize,
    logicalHeight: cfg.rows * cfg.cellSize,
    scaling: 'fit',
    background: getCurrentTheme().games.snake.bg,
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
        if (state.status === 'playing') {
          const dir = KEY_TO_DIRECTION[code];
          const accepted = queue.enqueue(dir, state.direction);
          if (accepted) recorder.push(currentTick, directionToAction(dir));
        }
      }
    }
    if (keyboard.consumePress('Space')) {
      const wasPlaying = state.status === 'playing';
      const wasPaused = state.status === 'paused';
      togglePause();
      if (wasPlaying && state.status === 'paused') recorder.push(currentTick, 'pause');
      else if (wasPaused && state.status === 'playing') recorder.push(currentTick, 'resume');
    }
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
    // Reseed for a fresh run so consecutive runs don't share entropy state.
    // Recording captures the resulting seed with the run, and replay saves
    // this seed verbatim so playback is deterministic. When opts.seed was
    // explicitly supplied (tests/reproducibility), we honour it every run.
    if (!replayMode) {
      if (!seedFixed) {
        seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      }
      rng = mulberry32(seed);
      recorder.reset();
      finalReplay = null;
      replayVerified = null;
    }
    currentTick = 0;
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
    if (replayMode && replayCursor && activeReplay) {
      // Spectator mode: consume recorded actions for this tick, ignore live
      // keys entirely.  Global chrome keys (Esc / M / help / arcade toggle)
      // are handled by the Angular component above this layer, so it's safe
      // to skip handleKeyEvents here.
      for (const action of replayCursor.actionsAt(currentTick)) {
        applyReplayAction(action);
      }
    } else {
      handleKeyEvents();
    }
    if (state.status !== 'playing') {
      // Even when paused/gameover, tick counter still advances so recorded
      // resume events are dispatched at the correct offset. However the
      // engine is idle, so we bail before step().
      if (replayMode) {
        const done =
          state.status === 'gameover' ||
          state.status === 'cleared' ||
          currentTick >= activeReplay!.endedAtTick;
        if (done && replayVerified === null && activeReplay) {
          verifyReplay();
        }
        currentTick++;
      }
      return;
    }
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
    if (events.died || events.cleared) {
      notify();
      finalizeReplayIfEnded();
    }

    // Replay-playback stop condition: when we've reached the recorded end
    // tick, force-terminate. The engine's own game-over path (wall/self)
    // usually beats this by one tick, but the guard defends against a subtle
    // divergence where the recorded run ends via bonus/food cleared state.
    if (replayMode && activeReplay) {
      if (
        currentTick >= activeReplay.endedAtTick &&
        state.status === 'playing'
      ) {
        state.status = 'gameover';
        notify();
      }
      const st = state.status as string;
      if ((st === 'gameover' || st === 'cleared') && replayVerified === null) {
        verifyReplay();
      }
    }

    currentTick++;
  };

  const verifyReplay = (): void => {
    if (!activeReplay) return;
    const ok = state.score === activeReplay.finalScore;
    replayVerified = ok;
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn(
        `[snake replay] determinism check failed: expected score ` +
          `${activeReplay.finalScore}, got ${state.score}`,
      );
    }
  };

  const draw = (alpha = lastAlpha): void => {
    lastAlpha = alpha;
    // beginFrame clears the canvas backing store AND applies ctx.scale, so
    // the renderer's logical (0..cols*cellSize, 0..rows*cellSize) drawing
    // fills the full canvas regardless of the host's actual size.
    mount.beginFrame(getCurrentTheme().games.snake.bg);
    render(mount.ctx, state, cfg, { highScore }, performance.now(), alpha);
    if (replayMode) drawReplayBadge(mount.ctx);
  };

  // React to live theme changes: re-render with the new palette immediately
  // so users see the swap without waiting for the next scheduled tick.
  const unsubTheme = subscribeTheme(() => draw());

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
      unsubTheme();
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
    exportReplay(): Replay | null {
      // Prefer the finalized snapshot (captures the exact ending state).
      // Fall back to an in-progress snapshot only if callers want it — the
      // interface currently returns null for that case per the brief.
      if (finalReplay) return finalReplay;
      if (state.status === 'gameover' || state.status === 'cleared') {
        finalReplay = recorder.finalize({
          seed,
          cfg,
          endedAtTick: currentTick,
          finalScore: state.score,
        });
        return finalReplay;
      }
      return null;
    },
    replayFrom(replay: Replay): void {
      if (replay.game !== 'snake') {
        throw new Error(`snake game got a ${replay.game} replay`);
      }
      // Apply the replay's config over top of current cfg so a wrap-mode
      // recording plays back as wrap even if the host page didn't set it.
      const partial = snakeConfigFromReplay(replay);
      if (partial.cols !== undefined) (cfg as SnakeConfig).cols = partial.cols;
      if (partial.rows !== undefined) (cfg as SnakeConfig).rows = partial.rows;
      if (partial.mode !== undefined) (cfg as SnakeConfig).mode = partial.mode;
      seed = replay.seed >>> 0;
      rng = mulberry32(seed);
      recorder.reset();
      finalReplay = null;
      replayMode = true;
      activeReplay = replay;
      replayCursor = createSnakeReplayCursor(replay);
      replayVerified = null;
      currentTick = 0;
      state = createInitialState(cfg, rng);
      state.status = 'playing';
      queue.clear();
      loop.setTickInterval(cfg.startTickMs);
      notify();
    },
    get isReplaying(): boolean {
      return replayMode;
    },
    get replayVerified(): boolean | null {
      return replayVerified;
    },
  };
}
