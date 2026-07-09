import { DEFAULT_CONFIG } from './config';
import { createInitialState, launchBall, movePaddle, startRun, stepBricks } from './state';

describe('Bricks state', () => {
  it('starts a run with a full brick rack and the ball stuck to the paddle', () => {
    const state = createInitialState(DEFAULT_CONFIG, 123);

    startRun(state);

    expect(state.status).toBe('ready');
    expect(state.highScore).toBe(123);
    expect(state.lives).toBe(DEFAULT_CONFIG.lives);
    expect(state.bricksRemaining).toBe(DEFAULT_CONFIG.brickRows * DEFAULT_CONFIG.brickCols);
    expect(state.stuckToPaddle).toBeTrue();
    expect(state.ball.x).toBeCloseTo(state.paddleX + DEFAULT_CONFIG.paddleWidth / 2);
  });

  it('moves the stuck ball with the paddle and clamps to the playfield', () => {
    const state = createInitialState();
    startRun(state);

    for (let i = 0; i < 100; i++) movePaddle(state, -1);

    expect(state.paddleX).toBe(0);
    expect(state.ball.x).toBe(DEFAULT_CONFIG.paddleWidth / 2);

    for (let i = 0; i < 200; i++) movePaddle(state, 1);

    expect(state.paddleX).toBe(DEFAULT_CONFIG.width - DEFAULT_CONFIG.paddleWidth);
    expect(state.ball.x).toBe(DEFAULT_CONFIG.width - DEFAULT_CONFIG.paddleWidth / 2);
  });

  it('launches the ball into play', () => {
    const state = createInitialState();
    startRun(state);

    launchBall(state);

    expect(state.status).toBe('playing');
    expect(state.stuckToPaddle).toBeFalse();
    expect(state.ballVelocity.y).toBeLessThan(0);
  });

  it('scores and removes a hit brick', () => {
    const state = createInitialState();
    startRun(state);
    const brick = state.bricks[0];
    state.status = 'playing';
    state.stuckToPaddle = false;
    state.ball = { x: brick.x + brick.width / 2, y: brick.y + brick.height + DEFAULT_CONFIG.ballRadius - 1 };
    state.ballVelocity = { x: 0, y: -DEFAULT_CONFIG.baseBallSpeed };

    const events = stepBricks(state);

    expect(events.brickHits).toBe(1);
    expect(brick.alive).toBeFalse();
    expect(state.bricksRemaining).toBe(DEFAULT_CONFIG.brickRows * DEFAULT_CONFIG.brickCols - 1);
    expect(state.score).toBe(brick.points);
    expect(state.highScore).toBe(brick.points);
    expect(state.ballVelocity.y).toBeGreaterThan(0);
  });

  it('bounces from the paddle with an angle based on contact point', () => {
    const state = createInitialState();
    startRun(state);
    state.status = 'playing';
    state.combo = 3;
    state.stuckToPaddle = false;
    state.ball = {
      x: state.paddleX + DEFAULT_CONFIG.paddleWidth - 2,
      y: DEFAULT_CONFIG.paddleY - DEFAULT_CONFIG.ballRadius + 1,
    };
    state.ballVelocity = { x: 0, y: DEFAULT_CONFIG.baseBallSpeed };

    const events = stepBricks(state);

    expect(events.paddleHit).toBeTrue();
    expect(state.ballVelocity.y).toBeLessThan(0);
    expect(state.ballVelocity.x).toBeGreaterThan(0);
    expect(state.combo).toBe(0);
  });

  it('loses a life and resets the ball when it falls below the playfield', () => {
    const state = createInitialState();
    startRun(state);
    state.status = 'playing';
    state.stuckToPaddle = false;
    state.ball.y = DEFAULT_CONFIG.height + DEFAULT_CONFIG.ballRadius + 1;
    state.ballVelocity = { x: 0, y: DEFAULT_CONFIG.baseBallSpeed };

    const events = stepBricks(state);

    expect(events.lifeLost).toBeTrue();
    expect(events.gameOver).toBeFalse();
    expect(state.lives).toBe(DEFAULT_CONFIG.lives - 1);
    expect(state.status).toBe('ready');
    expect(state.stuckToPaddle).toBeTrue();
  });

  it('enters game over when the last life is lost', () => {
    const state = createInitialState();
    startRun(state);
    state.status = 'playing';
    state.lives = 1;
    state.stuckToPaddle = false;
    state.ball.y = DEFAULT_CONFIG.height + DEFAULT_CONFIG.ballRadius + 1;
    state.ballVelocity = { x: 0, y: DEFAULT_CONFIG.baseBallSpeed };

    const events = stepBricks(state);

    expect(events.gameOver).toBeTrue();
    expect(state.status).toBe('gameover');
    expect(state.lives).toBe(0);
  });

  it('advances to level clear when the final brick is removed', () => {
    const state = createInitialState();
    startRun(state);
    const finalBrick = state.bricks[0];
    for (const brick of state.bricks) brick.alive = false;
    finalBrick.alive = true;
    state.bricksRemaining = 1;
    state.status = 'playing';
    state.stuckToPaddle = false;
    state.ball = {
      x: finalBrick.x + finalBrick.width / 2,
      y: finalBrick.y + finalBrick.height + DEFAULT_CONFIG.ballRadius - 1,
    };
    state.ballVelocity = { x: 0, y: -DEFAULT_CONFIG.baseBallSpeed };

    const events = stepBricks(state);

    expect(events.levelCleared).toBeTrue();
    expect(state.status).toBe('levelclear');
    expect(state.bricksRemaining).toBe(0);
  });
});
