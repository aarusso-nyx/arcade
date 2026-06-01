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
} from '../../../core';
import { PACMAN_SFX } from './audio';
import {
  CANVAS_H,
  CANVAS_W,
  TICK_MS,
  TOTAL_PELLETS,
} from './config';
import {
  KEY_TO_DIRECTION,
  PAUSE_CODES,
  PREVENT_DEFAULT_CODES,
} from './input';
import { parseMaze } from './maze';
import {
  buildMazeCache,
  render,
  type MazeCache,
} from './renderer';
import {
  buildPelletGrid,
  createGhost,
  createInitialGameState,
  createPacman,
  tickWorld,
  type World,
} from './state';
import type { GameState } from './types';

const STORAGE_NS = 'arcade.pacman';

export interface PacmanGame {
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  destroy(): void;
  readonly state: GameState;
  readonly highScore: number;
  onScoreChange(cb: (s: GameState) => void): () => void;
  toggleMute(): boolean;
  readonly muted: boolean;
}

export interface PacmanOptions {
  seed?: number;
}

export function createPacmanGame(host: HTMLElement, opts: PacmanOptions = {}): PacmanGame {
  const seed = opts.seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  const rng = mulberry32(seed);
  const storage = createStorage(STORAGE_NS);
  const highKey = 'highScore';
  let highScore = storage.get<number>(highKey, 0);
  const audio: Audio = createAudio();
  registerSounds(audio, PACMAN_SFX);
  // Alternates between pelletA / pelletB on each pellet eaten — the
  // canonical "waka-waka" rhythm.
  let pelletParity = 0;

  const maze = parseMaze();
  if (maze.pelletCount !== TOTAL_PELLETS) {
    console.warn(`Pac-Man: maze pellet count ${maze.pelletCount} (expected ${TOTAL_PELLETS}).`);
  }

  const pelletGrid = buildPelletGrid(maze);
  const game = createInitialGameState(maze, highScore);
  const pacman = createPacman();
  const ghosts = [createGhost('blinky'), createGhost('pinky'), createGhost('inky'), createGhost('clyde')];

  const world: World = { maze, pelletGrid, game, pacman, ghosts, rng };

  const mount: CanvasMount = mountCanvas(host, {
    logicalWidth: CANVAS_W,
    logicalHeight: CANVAS_H,
    scaling: 'pixel-art',
    background: '#000000',
  });
  const mazeCache: MazeCache = buildMazeCache(maze);

  const keyboard: Keyboard = createKeyboard({
    preventDefault: PREVENT_DEFAULT_CODES,
  });

  const subscribers = new Set<(s: GameState) => void>();
  const notify = (): void => subscribers.forEach((cb) => cb(world.game));

  const handleInput = (): void => {
    for (const code of Object.keys(KEY_TO_DIRECTION)) {
      if (keyboard.consumePress(code)) {
        // Single-slot buffer: latest press wins (spec § 10.3).
        pacman.nextDirection = KEY_TO_DIRECTION[code];
      }
    }
    for (const code of PAUSE_CODES) {
      if (keyboard.consumePress(code)) togglePause();
    }
    if (keyboard.consumePress('Enter')) {
      if (game.phase === 'gameover') resetRun();
    }
  };

  const togglePause = (): void => {
    if (game.phase === 'paused') {
      game.phase = game.prePausePhase ?? 'playing';
      game.prePausePhase = null;
    } else if (game.phase === 'playing' || game.phase === 'ready') {
      game.prePausePhase = game.phase;
      game.phase = 'paused';
    }
  };

  const resetRun = (): void => {
    const fresh = createInitialGameState(maze, highScore);
    Object.assign(world.game, fresh);
    const grid = buildPelletGrid(maze);
    world.pelletGrid.set(grid);
    const newPac = createPacman();
    pacman.position = newPac.position;
    pacman.direction = newPac.direction;
    pacman.nextDirection = null;
    pacman.animFrame = 0;
    pacman.deathFrame = 0;
    pacman.alive = true;
    world.ghosts.forEach((g, i) => {
      const id = (['blinky', 'pinky', 'inky', 'clyde'] as const)[i];
      const f = createGhost(id);
      Object.assign(g, f);
    });
    pelletParity = 0;
    notify();
  };

  const tick = (): void => {
    handleInput();
    if (game.phase === 'paused') return;
    const prevScore = game.score;
    const prevPhase = game.phase;
    const prevLives = game.lives;
    const prevLevel = game.level;
    const events = tickWorld(world);
    if (events.atePellet) {
      audio.play(pelletParity === 0 ? 'pelletA' : 'pelletB');
      pelletParity ^= 1;
    }
    if (events.atePowerPellet) audio.play('power');
    if (events.ateGhost) audio.play('eatGhost');
    if (events.ateFruit) audio.play('fruit');
    if (events.extraLifeAwarded) audio.play('extraLife');
    if (events.died) audio.play('death');
    if (game.score > highScore) {
      highScore = game.score;
      game.highScore = highScore;
      storage.set(highKey, highScore);
    }
    if (
      events.died ||
      events.levelCleared ||
      events.ateGhost ||
      events.ateFruit ||
      events.extraLifeAwarded ||
      game.score !== prevScore ||
      game.phase !== prevPhase ||
      game.lives !== prevLives ||
      game.level !== prevLevel
    ) {
      notify();
    }
  };

  const draw = (_alpha: number): void => {
    const now = performance.now();
    const flashing =
      game.phase === 'levelclear' && Math.floor(game.phaseTimer / 15) % 2 === 0;
    mount.beginFrame('#000000');
    render(mount.ctx, world, mazeCache, now, flashing);
  };

  const loop: Loop = createLoop({
    tickIntervalMs: TICK_MS,
    tick,
    render: draw,
    pauseOnHidden: true,
  });

  return {
    start(): void {
      keyboard.attach();
      loop.start();
      draw(0);
      notify();
    },
    pause: togglePause,
    resume(): void {
      if (game.phase === 'paused') togglePause();
    },
    reset: resetRun,
    destroy(): void {
      loop.stop();
      keyboard.detach();
      mount.destroy();
      audio.destroy();
      subscribers.clear();
    },
    get state(): GameState {
      return world.game;
    },
    get highScore(): number {
      return highScore;
    },
    onScoreChange(cb): () => void {
      subscribers.add(cb);
      cb(world.game);
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
