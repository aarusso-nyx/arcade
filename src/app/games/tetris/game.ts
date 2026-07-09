import {
  createAudio,
  createKeyboard,
  createLoop,
  createStorage,
  mountCanvas,
  mulberry32,
  registerSounds,
  type Audio,
  type CanvasMount,
  type Keyboard,
  type Loop,
  type Replay,
  type TetrisAction,
} from '../../../core';
import { TETRIS_SFX } from './audio';
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
import {
  createTetrisRecorder,
  createTetrisReplayCursor,
  tetrisConfigFromReplay,
  type TetrisReplayCursor,
} from './replay';
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
  toggleGhost(): boolean;
  readonly ghostEnabled: boolean;
  toggleMute(): boolean;
  readonly muted: boolean;
  /** Snapshot the current run as a shareable Replay, once it has ended. */
  exportReplay(): Replay | null;
  /** Play back a recorded run in spectator mode. */
  replayFrom(replay: Replay): void;
  readonly isReplaying: boolean;
  readonly replayVerified: boolean | null;
}

export interface TetrisSnapshot {
  score: number;
  lines: number;
  level: number;
  highScore: number;
  status: GameState['status'];
  combo: number;
  b2b: boolean;
  ghostEnabled: boolean;
}

export interface TetrisOptions extends Partial<TetrisConfig> {
  seed?: number;
}

const STORAGE_NS = 'arcade.tetris';
const GHOST_ENABLED_KEY = 'ghostEnabled';

export function createTetrisGame(host: HTMLElement, opts: TetrisOptions = {}): TetrisGame {
  const cfg: TetrisConfig = { ...DEFAULT_CONFIG, ...opts };
  const seedFixed = opts.seed != null;
  // effectiveSeed is the seed actually threaded into mulberry32 for the CURRENT
  // run — captured verbatim by exportReplay so playback is byte-exact.
  let effectiveSeed = seedFixed
    ? (opts.seed as number)
    : ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  let rng = mulberry32(effectiveSeed);
  const storage = createStorage(STORAGE_NS);
  const audio: Audio = createAudio();
  registerSounds(audio, TETRIS_SFX);

  let state: GameState = createInitialState();
  let bag = new SevenBag(rng);
  let highScore = storage.get<number>(cfg.storageKey, 0);
  let ghostEnabled = storage.get<boolean>(GHOST_ENABLED_KEY, cfg.ghostEnabled);
  cfg.ghostEnabled = ghostEnabled;

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
      ghostEnabled,
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

  // Replay recording + playback.
  const recorder = createTetrisRecorder();
  let currentTick = 0;
  let replayMode = false;
  let activeReplay: Replay | null = null;
  let replayCursor: TetrisReplayCursor | null = null;
  let replayVerified: boolean | null = null;
  let finalReplay: Replay | null = null;
  let prevSoftDropping = false;

  const beginGame = (): void => {
    // Fresh seed each begin unless the caller explicitly pinned one (tests).
    // We stir Date.now for user runs so consecutive plays don't repeat the
    // exact bag. Replay path bypasses this: replayFrom() sets effectiveSeed
    // to the recorded value and skips beginGame's derivation.
    if (!replayMode) {
      if (!seedFixed) {
        effectiveSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      }
      rng = mulberry32(effectiveSeed);
      recorder.reset();
      finalReplay = null;
      replayVerified = null;
    }
    bag = new SevenBag(rng);
    state = createInitialState();
    state.status = 'playing';
    state.startedAtMs = performance.now();
    lockState.state = createLockState();
    dasOnKeyUp(dasLeft);
    dasOnKeyUp(dasRight);
    lastHorizontalKey = null;
    wasDown.clear();
    currentTick = 0;
    prevSoftDropping = false;
    spawnFromBag(state, bag, cfg);
    notify();
  };

  const record = (action: TetrisAction): void => {
    if (replayMode) return;
    recorder.push(currentTick, action);
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
      record(dx < 0 ? 'left' : 'right');
      if (isGrounded(state)) {
        lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
      }
    }
  };

  const tryRotate = (dir: 'CW' | 'CCW' | '180'): void => {
    if (!state.active) return;
    const ok = tryRotatePiece(state, dir);
    if (ok) {
      record(dir === 'CW' ? 'rotCW' : dir === 'CCW' ? 'rotCCW' : 'rot180');
      if (isGrounded(state)) {
        lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
      }
    }
  };

  const doHardDrop = (): void => {
    if (!state.active) return;
    const cells = hardDrop(state);
    record('hard');
    if (cells > 0) {
      awardDropPoints(state, 0, cells);
      notify();
    }
    forceLock();
  };

  const forceLock = (): void => {
    const b2bBefore = state.b2bActive;
    const events = lockAndScore(state, cfg);
    // Sound priority: line-clear chime takes precedence over the lock thunk
    // (a line-clear implies a lock, but we want the brighter sound to win).
    if (events.lineClear) {
      const { linesCleared, tspin } = events.lineClear.score;
      if (tspin === 'full' || tspin === 'mini') {
        audio.play('tspin');
      } else if (linesCleared === 4) {
        audio.play('tetris');
      } else if (linesCleared === 3) {
        audio.play('triple');
      } else if (linesCleared === 2) {
        audio.play('double');
      } else if (linesCleared >= 1) {
        audio.play('single');
      }
      // Back-to-back reinforcement: if the prior chain was active and this
      // clear continues it, layer in the b2b sting.
      if (b2bBefore && events.lineClear.score.newB2b && (tspin !== 'none' || linesCleared === 4)) {
        audio.play('b2b');
      }
    } else if (state.status !== 'gameover') {
      audio.play('lock');
    }
    if (events.scoreDelta > 0 || events.lineClear) notify();
    if (state.status === 'gameover') {
      audio.play('gameover');
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
      audio.play('gameover');
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
    finalizeReplayIfEnded();
  };

  const finalizeReplayIfEnded = (): void => {
    if (finalReplay || replayMode) return;
    if (state.status === 'gameover') {
      finalReplay = recorder.finalize({
        seed: effectiveSeed,
        cfg,
        endedAtTick: currentTick,
        finalScore: state.score,
      });
    }
  };

  const toggleGhost = (): boolean => {
    ghostEnabled = !ghostEnabled;
    cfg.ghostEnabled = ghostEnabled;
    storage.set(GHOST_ENABLED_KEY, ghostEnabled);
    notify();
    return ghostEnabled;
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
    if (onPressed('KeyG')) {
      toggleGhost();
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
      if (swapped) {
        record('hold');
        lockState.state = createLockState();
        audio.play('hold');
      }
    }

    // Detect soft-drop state transitions and record them as toggles.
    if (state.softDropping !== prevSoftDropping) {
      record('soft');
      prevSoftDropping = state.softDropping;
    }
  };

  const drainPresses = (): void => {
    for (const code of [
      'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space',
      'KeyX', 'KeyZ', 'KeyA', 'KeyC', 'ShiftLeft', 'ShiftRight', 'KeyG',
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

  /**
   * Apply a single recorded action during replay playback. Mirrors the discrete
   * effects the live path produces (post-DAS), so replay doesn't have to
   * re-simulate keydown/keyup timing.
   */
  const applyReplayAction = (action: TetrisAction): void => {
    if (!state.active) return;
    switch (action) {
      case 'left':
        if (tryTranslate(state, -1, 0)) {
          if (isGrounded(state)) {
            lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
          }
        }
        break;
      case 'right':
        if (tryTranslate(state, 1, 0)) {
          if (isGrounded(state)) {
            lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
          }
        }
        break;
      case 'rotCW':
      case 'rotCCW':
      case 'rot180': {
        const dir = action === 'rotCW' ? 'CW' : action === 'rotCCW' ? 'CCW' : '180';
        if (tryRotatePiece(state, dir)) {
          if (isGrounded(state)) {
            lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
          }
        }
        break;
      }
      case 'soft':
        state.softDropping = !state.softDropping;
        break;
      case 'hard': {
        const cells = hardDrop(state);
        if (cells > 0) awardDropPoints(state, 0, cells);
        forceLock();
        break;
      }
      case 'hold': {
        const swapped = tryHold(state, bag, cfg);
        if (swapped) lockState.state = createLockState();
        break;
      }
    }
  };

  const verifyReplay = (): void => {
    if (!activeReplay) return;
    const ok = state.score === activeReplay.finalScore;
    replayVerified = ok;
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn(
        `[tetris replay] determinism check failed: expected score ` +
          `${activeReplay.finalScore}, got ${state.score}`,
      );
    }
  };

  const tick = (): void => {
    if (replayMode && replayCursor && activeReplay) {
      // Spectator mode: skip handleEdges entirely and consume recorded
      // actions at this tick. Chrome keys (Esc/M/help) are handled above
      // this layer in the Angular component, so keyboard input is ignored
      // safely here.
      for (const a of replayCursor.actionsAt(currentTick)) {
        applyReplayAction(a);
      }
    } else {
      handleEdges();
    }

    if (state.status === 'lineclear') {
      const done = tickLineClear(state, TICK_MS);
      if (done) {
        afterLockSpawn();
      }
      currentTick++;
      return;
    }
    if (state.status !== 'playing') {
      if (replayMode && activeReplay && replayVerified === null &&
          (state.status === 'gameover')) {
        verifyReplay();
      }
      currentTick++;
      return;
    }

    // DAS / ARR auto-repeat (left/right). Process in real-ms (== TICK_MS at 60Hz).
    // Last direction wins: if both are pressed, process the most recently pressed.
    const repeats = (dx: number, das: DASState): number => {
      return tickDAS(das, TICK_MS, cfg.dasMs, cfg.arrMs);
    };
    if (lastHorizontalKey === 'left' && dasLeft.pressed) {
      const n = repeats(-1, dasLeft);
      for (let i = 0; i < n; i++) {
        if (!tryTranslate(state, -1, 0)) break;
        record('left');
        if (isGrounded(state)) {
          lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
        }
      }
    } else if (lastHorizontalKey === 'right' && dasRight.pressed) {
      const n = repeats(1, dasRight);
      for (let i = 0; i < n; i++) {
        if (!tryTranslate(state, 1, 0)) break;
        record('right');
        if (isGrounded(state)) {
          lockState.state = tryResetLock(lockState.state, cfg.lockDelayMs, cfg.moveResetCap);
        }
      }
    } else if (dasLeft.pressed) {
      // Fallback: left is held even without explicit lastHorizontalKey reset.
      const n = repeats(-1, dasLeft);
      for (let i = 0; i < n; i++) {
        if (!tryTranslate(state, -1, 0)) break;
        record('left');
      }
    } else if (dasRight.pressed) {
      const n = repeats(1, dasRight);
      for (let i = 0; i < n; i++) {
        if (!tryTranslate(state, 1, 0)) break;
        record('right');
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
      currentTick++;
      return;
    }

    notify();

    // Replay end / verify.
    if (replayMode && activeReplay) {
      if (currentTick >= activeReplay.endedAtTick && state.status === 'playing') {
        state.status = 'gameover';
        notify();
      }
      if (
        (state.status === 'gameover') &&
        replayVerified === null
      ) {
        verifyReplay();
      }
    }

    currentTick++;
  };

  const drawReplayBadge = (ctx: CanvasRenderingContext2D): void => {
    ctx.save();
    const w = 78;
    const h = 20;
    ctx.fillStyle = 'rgba(240,60,60,0.85)';
    ctx.fillRect(8, 8, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('● REPLAY', 8 + w / 2, 8 + h / 2 + 1);
    ctx.restore();
  };

  const render = (): void => {
    playMount.beginFrame('#0b0d10');
    renderPlayfield(playMount.ctx, state, cfg);
    if (replayMode) drawReplayBadge(playMount.ctx);
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
      audio.destroy();
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
        ghostEnabled,
      };
      cb(snap);
      return () => subscribers.delete(cb);
    },
    toggleGhost,
    get ghostEnabled(): boolean {
      return ghostEnabled;
    },
    toggleMute(): boolean {
      return audio.toggleMute();
    },
    get muted(): boolean {
      return audio.muted;
    },
    exportReplay(): Replay | null {
      if (finalReplay) return finalReplay;
      if (state.status === 'gameover') {
        finalReplay = recorder.finalize({
          seed: effectiveSeed,
          cfg,
          endedAtTick: currentTick,
          finalScore: state.score,
        });
        return finalReplay;
      }
      return null;
    },
    replayFrom(replay: Replay): void {
      if (replay.game !== 'tetris') {
        throw new Error(`tetris game got a ${replay.game} replay`);
      }
      const partial = tetrisConfigFromReplay(replay);
      if (partial.cellPx !== undefined) (cfg as TetrisConfig).cellPx = partial.cellPx;
      effectiveSeed = replay.seed >>> 0;
      rng = mulberry32(effectiveSeed);
      recorder.reset();
      finalReplay = null;
      replayMode = true;
      activeReplay = replay;
      replayCursor = createTetrisReplayCursor(replay);
      replayVerified = null;
      currentTick = 0;
      prevSoftDropping = false;
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
    },
    get isReplaying(): boolean {
      return replayMode;
    },
    get replayVerified(): boolean | null {
      return replayVerified;
    },
  };
}
