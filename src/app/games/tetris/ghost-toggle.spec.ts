import { createTetrisGame, type TetrisGame } from './game';

describe('tetris ghost toggle', () => {
  let host: HTMLDivElement;
  let game: TetrisGame | null;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    game = null;
  });

  afterEach(() => {
    game?.destroy();
    host.remove();
    localStorage.clear();
  });

  function createGame(): TetrisGame {
    game = createTetrisGame(host, { seed: 1234 });
    return game;
  }

  it('starts with ghostEnabled = true', () => {
    const tetris = createGame();

    expect(tetris.ghostEnabled).toBe(true);
  });

  it('toggleGhost flips the state and returns the new state', () => {
    const tetris = createGame();

    expect(tetris.toggleGhost()).toBe(false);
    expect(tetris.ghostEnabled).toBe(false);
    expect(tetris.toggleGhost()).toBe(true);
    expect(tetris.ghostEnabled).toBe(true);
  });

  it('persists the boolean across destroy and a new game instance', () => {
    const first = createGame();
    expect(first.toggleGhost()).toBe(false);
    first.destroy();
    game = null;
    host.replaceChildren();

    const second = createGame();

    expect(second.ghostEnabled).toBe(false);
    expect(localStorage.getItem('arcade.tetris.ghostEnabled')).toBe('false');
  });

  it('does not affect engine state when toggled', () => {
    const tetris = createGame();
    tetris.reset();
    const before = {
      active: tetris.state.active ? { ...tetris.state.active } : null,
      lockState: {
        status: tetris.state.status,
        lineClearTimerMs: tetris.state.lineClearTimerMs,
        lineClearRows: [...tetris.state.lineClearRows],
      },
      score: tetris.state.score,
    };

    tetris.toggleGhost();

    expect(tetris.state.active).toEqual(before.active);
    expect(tetris.state.status).toBe(before.lockState.status);
    expect(tetris.state.lineClearTimerMs).toBe(before.lockState.lineClearTimerMs);
    expect(tetris.state.lineClearRows).toEqual(before.lockState.lineClearRows);
    expect(tetris.state.score).toBe(before.score);
  });
});
