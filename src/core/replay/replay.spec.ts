import {
  base64UrlToBytes,
  bytesToBase64Url,
  decodeReplay,
  encodeReplay,
  isReplayUrlSafe,
  type Replay,
} from './replay';

describe('replay codec', () => {
  const snakeReplay = (): Replay => ({
    game: 'snake',
    version: 1,
    seed: 0xdeadbeef,
    config: { cols: 20, rows: 20, mode: 0 },
    inputs: [
      { tick: 5, action: 'up' },
      { tick: 12, action: 'right' },
      { tick: 20, action: 'down' },
    ],
    endedAtTick: 42,
    finalScore: 130,
  });

  const tetrisReplay = (): Replay => ({
    game: 'tetris',
    version: 1,
    seed: 1234567,
    config: { cellPx: 30, startLevel: 1 },
    inputs: [
      { tick: 0, action: 'left' },
      { tick: 15, action: 'rotCW' },
      { tick: 30, action: 'hard' },
      { tick: 60, action: 'hold' },
    ],
    endedAtTick: 400,
    finalScore: 800,
  });

  it('round-trips a snake replay', () => {
    const r = snakeReplay();
    const s = encodeReplay(r);
    expect(isReplayUrlSafe(s)).toBe(true);
    const d = decodeReplay(s);
    expect(d.game).toBe('snake');
    expect(d.seed).toBe(r.seed);
    expect(d.config).toEqual(r.config);
    expect(d.inputs).toEqual(r.inputs);
    expect(d.endedAtTick).toBe(r.endedAtTick);
    expect(d.finalScore).toBe(r.finalScore);
  });

  it('round-trips a tetris replay', () => {
    const r = tetrisReplay();
    const s = encodeReplay(r);
    expect(isReplayUrlSafe(s)).toBe(true);
    const d = decodeReplay(s);
    expect(d.game).toBe('tetris');
    expect(d.seed).toBe(r.seed);
    expect(d.config).toEqual(r.config);
    expect(d.inputs).toEqual(r.inputs);
    expect(d.endedAtTick).toBe(r.endedAtTick);
    expect(d.finalScore).toBe(r.finalScore);
  });

  it('produces URL-safe output for randomized inputs', () => {
    // 50 random inputs, mixed actions, monotonically-increasing ticks.
    const actions = ['up', 'down', 'left', 'right', 'pause', 'resume'];
    const inputs: { tick: number; action: string }[] = [];
    let t = 0;
    for (let i = 0; i < 50; i++) {
      t += 1 + Math.floor(Math.random() * 30);
      inputs.push({ tick: t, action: actions[Math.floor(Math.random() * actions.length)] });
    }
    const r: Replay = {
      game: 'snake',
      version: 1,
      seed: (Math.random() * 0xffffffff) >>> 0,
      config: { cols: 20, rows: 20, mode: 1 },
      inputs,
      endedAtTick: t + 5,
      finalScore: Math.floor(Math.random() * 5000),
    };
    const s = encodeReplay(r);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeReplay(s).inputs).toEqual(r.inputs);
  });

  it('produces empty-inputs encoded output that round-trips', () => {
    const r: Replay = {
      game: 'snake',
      version: 1,
      seed: 1,
      config: { cols: 20, rows: 20, mode: 0 },
      inputs: [],
      endedAtTick: 3,
      finalScore: 0,
    };
    const s = encodeReplay(r);
    expect(isReplayUrlSafe(s)).toBe(true);
    const d = decodeReplay(s);
    expect(d.inputs).toEqual([]);
    expect(d.endedAtTick).toBe(3);
  });

  it('is compact for a synthetic 60-second snake input stream', () => {
    // Snake ticks around 5-16Hz depending on speed. Estimate ~10 direction
    // changes in 60s — realistic for a moderately active player.
    const inputs: { tick: number; action: string }[] = [];
    let t = 0;
    const acts = ['up', 'right', 'down', 'left'];
    for (let i = 0; i < 10; i++) {
      t += 30 + Math.floor(Math.random() * 20);
      inputs.push({ tick: t, action: acts[i % 4] });
    }
    const r: Replay = {
      game: 'snake',
      version: 1,
      seed: 0xabcdef01,
      config: { cols: 20, rows: 20, mode: 0 },
      inputs,
      endedAtTick: t + 5,
      finalScore: 250,
    };
    const s = encodeReplay(r);
    // Budget from the brief: ≤ 200 chars.
    expect(s.length).toBeLessThanOrEqual(200);
  });

  it('rejects encoded strings with non-alphabet characters', () => {
    expect(() => decodeReplay('abc!def')).toThrow();
  });

  it('rejects a truncated payload', () => {
    // 6-byte header is the minimum before config bytes; slice below that.
    const good = encodeReplay({
      game: 'snake',
      version: 1,
      seed: 1,
      config: { cols: 20, rows: 20, mode: 0 },
      inputs: [],
      endedAtTick: 0,
      finalScore: 0,
    });
    // Chop off almost everything.
    expect(() => decodeReplay(good.slice(0, 2))).toThrow();
  });

  it('rejects an out-of-order input list on encode', () => {
    expect(() =>
      encodeReplay({
        game: 'snake',
        version: 1,
        seed: 0,
        config: { cols: 20, rows: 20, mode: 0 },
        inputs: [
          { tick: 10, action: 'up' },
          { tick: 5, action: 'down' },
        ],
        endedAtTick: 20,
        finalScore: 0,
      }),
    ).toThrow();
  });

  describe('base64url helpers', () => {
    it('round-trips arbitrary bytes', () => {
      const bytes = new Uint8Array(300);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff;
      const s = bytesToBase64Url(bytes);
      expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
      const back = base64UrlToBytes(s);
      expect(Array.from(back)).toEqual(Array.from(bytes));
    });

    it('encodes empty input to empty string', () => {
      expect(bytesToBase64Url(new Uint8Array(0))).toBe('');
      expect(base64UrlToBytes('')).toEqual(new Uint8Array(0));
    });

    it('handles 1- and 2-byte tails (no padding)', () => {
      expect(bytesToBase64Url(new Uint8Array([0xff]))).toBe('_w');
      expect(bytesToBase64Url(new Uint8Array([0xff, 0xff]))).toBe('__8');
      expect(Array.from(base64UrlToBytes('_w'))).toEqual([0xff]);
      expect(Array.from(base64UrlToBytes('__8'))).toEqual([0xff, 0xff]);
    });
  });
});
