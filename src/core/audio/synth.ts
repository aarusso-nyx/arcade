/**
 * Pure synth primitives.
 *
 * Each builder returns a `ScheduledSound`: a description of oscillator
 * segments and the associated gain envelope. The `schedule(ctx, t0, master)`
 * method realises the description against a real (or mock) AudioContext
 * starting at time `t0`, routing through the provided `master` gain node.
 *
 * The deliberate separation lets `audio.spec.ts` assert what the synth would
 * have scheduled without spinning up a real AudioContext — `schedule()` simply
 * forwards the segment plan to the context's create/connect/start APIs.
 */

export type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine';

export interface ToneSegment {
  /** Frequency in Hz. */
  readonly frequency: number;
  /** Start time offset (seconds, relative to t0). */
  readonly offset: number;
  /** Duration (seconds). */
  readonly duration: number;
}

export interface ScheduledSound {
  readonly segments: readonly ToneSegment[];
  readonly wave: Wave;
  /** Final peak gain (0..1). */
  readonly gain: number;
  /** Linear attack in seconds. */
  readonly attack: number;
  /** Linear release in seconds. */
  readonly release: number;
  /** Total duration of the sound in seconds. */
  readonly totalDuration: number;
  schedule(ctx: AudioContextLike, t0: number, master: AudioNodeLike): void;
}

/**
 * The minimum AudioContext shape the synth needs. Keeps the production code
 * compatible with both `AudioContext` and `webkitAudioContext`, and lets tests
 * inject a tiny mock that records create/connect/start/stop calls.
 */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
}

export interface AudioNodeLike {
  connect(target: AudioNodeLike): AudioNodeLike;
  disconnect?(): void;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: Wave;
  frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, when: number): void;
  linearRampToValueAtTime(value: number, when: number): void;
}

export interface BuildOptions {
  readonly frequencies: readonly number[];
  readonly durationMs: number;
  readonly wave?: Wave;
  readonly attack?: number;
  readonly release?: number;
  readonly gain?: number;
}

const DEFAULTS = {
  wave: 'square' as Wave,
  attack: 0.01,
  release: 0.06,
  gain: 0.25,
};

/**
 * Build a scheduled sound. Frequencies are played sequentially, each occupying
 * an equal slice of `durationMs`. A single attack/release envelope wraps the
 * full duration so consecutive notes blend without click artefacts.
 */
export function buildSound(opts: BuildOptions): ScheduledSound {
  if (opts.frequencies.length === 0) {
    throw new Error('buildSound: at least one frequency required');
  }
  if (opts.durationMs <= 0) {
    throw new Error('buildSound: durationMs must be positive');
  }
  const total = opts.durationMs / 1000;
  const sliceSec = total / opts.frequencies.length;
  const wave = opts.wave ?? DEFAULTS.wave;
  const gain = clamp01(opts.gain ?? DEFAULTS.gain);
  const attack = Math.max(0, opts.attack ?? DEFAULTS.attack);
  const release = Math.max(0, opts.release ?? DEFAULTS.release);

  const segments: ToneSegment[] = [];
  for (let i = 0; i < opts.frequencies.length; i++) {
    segments.push({
      frequency: opts.frequencies[i],
      offset: i * sliceSec,
      duration: sliceSec,
    });
  }

  return {
    segments,
    wave,
    gain,
    attack,
    release,
    totalDuration: total,
    schedule(ctx, t0, master): void {
      // One oscillator per segment, all sharing a single envelope gain node.
      // The envelope ramps in at t0, holds at `gain` until the release window,
      // and decays linearly to silence at t0 + total + release.
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(gain, t0 + Math.min(attack, total));
      const sustainUntil = t0 + Math.max(total - release, attack);
      env.gain.setValueAtTime(gain, sustainUntil);
      env.gain.linearRampToValueAtTime(0, t0 + total + release);
      env.connect(master);

      for (const seg of segments) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.setValueAtTime(seg.frequency, t0 + seg.offset);
        osc.connect(env);
        osc.start(t0 + seg.offset);
        osc.stop(t0 + seg.offset + seg.duration + release);
      }
    },
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
