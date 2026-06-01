import {
  buildSound,
  type AudioContextLike,
  type GainNodeLike,
  type ScheduledSound,
  type Wave,
} from './synth';

export interface Sound {
  /** Frequencies in Hz; each frequency plays for `durationMs / frequencies.length`. */
  readonly frequencies: readonly number[];
  /** Total duration of the sound in ms. */
  readonly durationMs: number;
  /** Oscillator waveform. Default 'square' (8-bit feel). */
  readonly wave?: Wave;
  /** 0..1 attack envelope (default 0.01) and release (default 0.06). */
  readonly attack?: number;
  readonly release?: number;
  /** Final gain multiplier (0..1). Default 0.25. */
  readonly gain?: number;
}

export interface Audio {
  /** Plays `name` if registered. Cheap no-op when muted or AudioContext is unavailable. */
  play(name: string): void;
  /** Register or override a sound. */
  define(name: string, sound: Sound): void;
  /** Toggle the global mute. Returns the new muted state. */
  toggleMute(): boolean;
  readonly muted: boolean;
  /** Tear down the AudioContext. */
  destroy(): void;
}

export interface AudioOptions {
  /** Namespace for persisting the mute state. Default 'arcade.audio'. */
  storageNamespace?: string;
  /** Initial volume (0..1). Default 0.5. */
  volume?: number;
  /**
   * Inject a factory that returns an AudioContext-like instance. Defaults to
   * the browser AudioContext (or webkitAudioContext). Tests pass a mock; if
   * the factory throws or returns null, the audio object becomes a no-op.
   */
  contextFactory?: () => AudioContextLike | null;
}

const DEFAULT_NS = 'arcade.audio';
const MUTED_KEY = 'muted';

/** Read the persisted mute flag without throwing in private-mode contexts. */
function readMuted(ns: string): boolean {
  try {
    const raw = localStorage.getItem(`${ns}.${MUTED_KEY}`);
    if (raw === null) return false;
    return raw === 'true' || raw === '"true"' || raw === '1';
  } catch {
    return false;
  }
}

function writeMuted(ns: string, value: boolean): void {
  try {
    localStorage.setItem(`${ns}.${MUTED_KEY}`, String(value));
  } catch {
    /* ignore */
  }
}

/**
 * Default AudioContext factory: lazy-instantiates the browser's AudioContext
 * (with the webkit-prefixed fallback for older Safari). Returns null if no
 * such API is available (server rendering, very old browsers).
 */
function defaultContextFactory(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  type Win = typeof window & {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const w = window as Win;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    // The DOM AudioContext is a structural superset of AudioContextLike
    // (e.g. OscillatorType includes 'custom' while our Wave doesn't). Cast
    // is safe because we only ever assign Wave values to oscillator.type.
    return new Ctor() as unknown as AudioContextLike;
  } catch {
    return null;
  }
}

export function createAudio(opts: AudioOptions = {}): Audio {
  const ns = opts.storageNamespace ?? DEFAULT_NS;
  const initialVolume = clamp01(opts.volume ?? 0.5);
  const factory = opts.contextFactory ?? defaultContextFactory;

  const sounds = new Map<string, ScheduledSound>();
  let muted = readMuted(ns);

  // The AudioContext is created lazily on first play() so that we don't
  // instantiate it before the user has interacted with the page (browsers
  // suspend autoplay contexts otherwise). Once attempted and failed, we
  // remember and stay in the no-op state for the lifetime of the instance.
  let ctx: AudioContextLike | null = null;
  let master: GainNodeLike | null = null;
  let attemptedContext = false;

  const ensureContext = (): boolean => {
    if (ctx) return true;
    if (attemptedContext) return false;
    attemptedContext = true;
    const created = factory();
    if (!created) return false;
    ctx = created;
    master = ctx.createGain();
    master.gain.value = initialVolume;
    master.connect(ctx.destination);
    return true;
  };

  return {
    play(name: string): void {
      if (muted) return;
      const sound = sounds.get(name);
      if (!sound) return;
      if (!ensureContext() || !ctx || !master) return;
      sound.schedule(ctx, ctx.currentTime, master);
    },

    define(name: string, sound: Sound): void {
      sounds.set(
        name,
        buildSound({
          frequencies: sound.frequencies,
          durationMs: sound.durationMs,
          wave: sound.wave,
          attack: sound.attack,
          release: sound.release,
          gain: sound.gain,
        }),
      );
    },

    toggleMute(): boolean {
      muted = !muted;
      writeMuted(ns, muted);
      return muted;
    },

    get muted(): boolean {
      return muted;
    },

    destroy(): void {
      sounds.clear();
      const c = ctx as (AudioContextLike & { close?: () => void }) | null;
      if (c && typeof c.close === 'function') {
        try {
          c.close();
        } catch {
          /* ignore */
        }
      }
      ctx = null;
      master = null;
    },
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Convenience: bulk-register a map of named sounds at once. Common pattern
 * for per-game SFX wiring (see src/app/games/&lt;game&gt;/audio.ts).
 */
export function registerSounds(audio: Audio, map: Record<string, Sound>): void {
  for (const [name, sound] of Object.entries(map)) {
    audio.define(name, sound);
  }
}
