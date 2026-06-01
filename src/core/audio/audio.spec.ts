import { createAudio } from './audio';
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  GainNodeLike,
  OscillatorNodeLike,
  Wave,
} from './synth';

/* ───────────── Mock AudioContext ──────────────────────────────────────────
 * Records create/connect/start/stop calls and the frequencies set on each
 * oscillator so assertions can pin down what the synth scheduled.
 */

interface OscillatorRecord {
  type: Wave;
  frequencySetAt: { value: number; when: number }[];
  startedAt: number | null;
  stoppedAt: number | null;
}

interface MockContextRecord {
  oscillators: OscillatorRecord[];
  gainNodes: number;
  connectionsToDestination: number;
  closed: boolean;
}

function makeMockContext(now = 1.0): {
  ctx: AudioContextLike & { close(): void };
  record: MockContextRecord;
} {
  const record: MockContextRecord = {
    oscillators: [],
    gainNodes: 0,
    connectionsToDestination: 0,
    closed: false,
  };

  const destination: AudioNodeLike = {
    connect: (target: AudioNodeLike): AudioNodeLike => target,
  };

  const makeParam = (initial: number): AudioParamLike => ({
    value: initial,
    setValueAtTime: (): void => undefined,
    linearRampToValueAtTime: (): void => undefined,
  });

  const makeGain = (): GainNodeLike => {
    record.gainNodes++;
    const node: GainNodeLike = {
      gain: makeParam(1),
      connect: (target: AudioNodeLike): AudioNodeLike => {
        if (target === destination) record.connectionsToDestination++;
        return target;
      },
    };
    return node;
  };

  const makeOscillator = (): OscillatorNodeLike => {
    const rec: OscillatorRecord = {
      type: 'square',
      frequencySetAt: [],
      startedAt: null,
      stoppedAt: null,
    };
    record.oscillators.push(rec);
    const freqParam: AudioParamLike = {
      value: 0,
      setValueAtTime: (v: number, when: number): void => {
        rec.frequencySetAt.push({ value: v, when });
      },
      linearRampToValueAtTime: (): void => undefined,
    };
    const node: OscillatorNodeLike = {
      get type(): Wave {
        return rec.type;
      },
      set type(v: Wave) {
        rec.type = v;
      },
      frequency: freqParam,
      connect: (target: AudioNodeLike): AudioNodeLike => target,
      start: (when?: number): void => {
        rec.startedAt = when ?? 0;
      },
      stop: (when?: number): void => {
        rec.stoppedAt = when ?? 0;
      },
    };
    return node;
  };

  return {
    record,
    ctx: {
      currentTime: now,
      destination,
      createOscillator: makeOscillator,
      createGain: makeGain,
      close: (): void => {
        record.closed = true;
      },
    },
  };
}

/* ───────────── Tests ─────────────────────────────────────────────────────── */

describe('createAudio', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('does not throw when no AudioContext is available', () => {
    const audio = createAudio({ contextFactory: () => null });
    audio.define('blip', { frequencies: [440], durationMs: 50 });
    expect(() => audio.play('blip')).not.toThrow();
    expect(audio.muted).toBe(false);
    audio.destroy();
  });

  it('schedules the expected frequency sequence on play()', () => {
    const { ctx, record } = makeMockContext(2.5);
    const audio = createAudio({ contextFactory: () => ctx });
    audio.define('arp', {
      frequencies: [440, 550, 660],
      durationMs: 120,
      wave: 'triangle',
    });
    audio.play('arp');

    expect(record.oscillators.length).toBe(3);
    const freqs = record.oscillators.map((o) => o.frequencySetAt[0]?.value);
    expect(freqs).toEqual([440, 550, 660]);
    expect(record.oscillators.every((o) => o.type === 'triangle')).toBe(true);
    // Each oscillator should have been started (non-null startedAt).
    expect(record.oscillators.every((o) => o.startedAt !== null)).toBe(true);
    // First osc should start at ctx.currentTime (t0 = 2.5).
    expect(record.oscillators[0].startedAt).toBeCloseTo(2.5, 5);
    // Second osc starts after the first slice (120/3 = 40ms = 0.04s).
    expect(record.oscillators[1].startedAt).toBeCloseTo(2.54, 5);
    // Two gain nodes: the master gain created on context boot + the per-sound
    // envelope created by schedule(). All three oscillators share the
    // envelope; the envelope connects to master; master connects to dest.
    expect(record.gainNodes).toBe(2);
    expect(record.connectionsToDestination).toBe(1);
  });

  it('toggleMute() flips state, persists, and stops subsequent plays', () => {
    const { ctx, record } = makeMockContext();
    const audio = createAudio({
      contextFactory: () => ctx,
      storageNamespace: 'arcade.audio.test',
    });
    audio.define('beep', { frequencies: [440], durationMs: 50 });

    expect(audio.muted).toBe(false);
    audio.play('beep');
    const oscCountBeforeMute = record.oscillators.length;
    expect(oscCountBeforeMute).toBe(1);

    expect(audio.toggleMute()).toBe(true);
    expect(audio.muted).toBe(true);
    audio.play('beep'); // should be a no-op
    expect(record.oscillators.length).toBe(oscCountBeforeMute);

    // Persistence: a fresh instance with the same namespace reads the flag.
    const next = createAudio({
      contextFactory: () => ctx,
      storageNamespace: 'arcade.audio.test',
    });
    expect(next.muted).toBe(true);
    next.destroy();

    expect(audio.toggleMute()).toBe(false);
    expect(audio.muted).toBe(false);
    audio.destroy();
  });

  it('play() on an unknown sound is a no-op', () => {
    const { ctx, record } = makeMockContext();
    const audio = createAudio({ contextFactory: () => ctx });
    expect(() => audio.play('does-not-exist')).not.toThrow();
    expect(record.oscillators.length).toBe(0);
    audio.destroy();
  });

  it('destroy() closes the underlying context when present', () => {
    const { ctx, record } = makeMockContext();
    const audio = createAudio({ contextFactory: () => ctx });
    audio.define('x', { frequencies: [440], durationMs: 10 });
    audio.play('x'); // forces context creation
    audio.destroy();
    expect(record.closed).toBe(true);
  });
});
