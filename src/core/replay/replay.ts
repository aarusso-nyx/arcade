/**
 * Shared replay codec for arcade games.
 *
 * A `Replay` captures everything needed to deterministically re-execute a run:
 *   - the game's RNG seed
 *   - a compact per-game config snapshot (so a replay recorded on a 20×20 board
 *     doesn't get re-run on a 30×30 board and diverge)
 *   - the ordered stream of player inputs, tagged with the tick at which they
 *     were consumed by the engine
 *   - the tick at which the run ended and the final score (for verification)
 *
 * The wire format is a URL-safe base64 of a compact binary layout:
 *
 *   byte 0        game id (0 = snake, 1 = tetris)
 *   byte 1        replay format version (currently 1)
 *   bytes 2..5    RNG seed (uint32 little-endian)
 *   bytes 6..N    per-game config block (fixed layout, see game-specific)
 *                     snake  — 3 bytes: cols, rows, mode(0=classic|1=wrap)
 *                     tetris — 2 bytes: cellPx, startLevel
 *   varint        input count
 *   varint        endedAtTick
 *   varint        finalScore
 *   for each input:
 *     varint      tick delta from previous input (first is delta from 0)
 *     byte        action code (per-game enum, see ACTIONS below)
 *
 * Base64 alphabet is URL-safe (RFC 4648 §5) with `=` padding stripped.
 * The character set of an encoded replay is exactly `[A-Za-z0-9_-]`.
 */

export type ReplayGame = 'snake' | 'tetris';

export interface ReplayConfig {
  readonly [k: string]: number;
}

export interface ReplayInput {
  readonly tick: number;
  readonly action: string;
}

export interface Replay {
  readonly game: ReplayGame;
  readonly version: 1;
  readonly seed: number;
  readonly config: ReplayConfig;
  readonly inputs: readonly ReplayInput[];
  readonly endedAtTick: number;
  readonly finalScore: number;
}

/**
 * Per-game action enums. Keeping these here (rather than in each game's own
 * replay.ts) keeps the codec self-contained: encode/decode never needs to
 * import a game module, so tests round-trip without touching game code.
 */
const SNAKE_ACTIONS = ['up', 'down', 'left', 'right', 'pause', 'resume'] as const;
const TETRIS_ACTIONS = [
  'left',
  'right',
  'rotCW',
  'rotCCW',
  'rot180',
  'soft',
  'hard',
  'hold',
] as const;

export type SnakeAction = (typeof SNAKE_ACTIONS)[number];
export type TetrisAction = (typeof TETRIS_ACTIONS)[number];

const SNAKE_ACTION_TO_CODE: Record<string, number> = {};
const TETRIS_ACTION_TO_CODE: Record<string, number> = {};
SNAKE_ACTIONS.forEach((a, i) => (SNAKE_ACTION_TO_CODE[a] = i));
TETRIS_ACTIONS.forEach((a, i) => (TETRIS_ACTION_TO_CODE[a] = i));

const GAME_ID: Record<ReplayGame, number> = { snake: 0, tetris: 1 };
const ID_TO_GAME: Record<number, ReplayGame> = { 0: 'snake', 1: 'tetris' };

const SNAKE_CONFIG_KEYS = ['cols', 'rows', 'mode'] as const;
const TETRIS_CONFIG_KEYS = ['cellPx', 'startLevel'] as const;

const VERSION: 1 = 1;

// -------- varint (LEB128 unsigned) --------

function writeVarint(out: number[], v: number): void {
  if (v < 0 || !Number.isFinite(v)) throw new Error(`varint out of range: ${v}`);
  let n = v >>> 0;
  // JS numbers up to 2^32-1 are safe here; game scores/ticks fit comfortably.
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n & 0x7f);
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let i = offset;
  while (i < bytes.length) {
    const b = bytes[i++];
    result += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) return { value: result, next: i };
    shift += 7;
    if (shift > 35) throw new Error('varint too long');
  }
  throw new Error('varint truncated');
}

// -------- base64url --------

const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64URL_LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < BASE64URL_CHARS.length; i++) {
  BASE64URL_LOOKUP[BASE64URL_CHARS.charCodeAt(i)] = i;
}

/** Encode bytes as unpadded URL-safe base64 (RFC 4648 §5). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += BASE64URL_CHARS[a >> 2];
    out += BASE64URL_CHARS[((a & 0x03) << 4) | (b >> 4)];
    out += BASE64URL_CHARS[((b & 0x0f) << 2) | (c >> 6)];
    out += BASE64URL_CHARS[c & 0x3f];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const a = bytes[i];
    out += BASE64URL_CHARS[a >> 2];
    out += BASE64URL_CHARS[(a & 0x03) << 4];
  } else if (rem === 2) {
    const a = bytes[i], b = bytes[i + 1];
    out += BASE64URL_CHARS[a >> 2];
    out += BASE64URL_CHARS[((a & 0x03) << 4) | (b >> 4)];
    out += BASE64URL_CHARS[(b & 0x0f) << 2];
  }
  return out;
}

/** Decode unpadded URL-safe base64. Throws if the string contains non-alphabet characters. */
export function base64UrlToBytes(s: string): Uint8Array {
  const len = s.length;
  const full = Math.floor(len / 4);
  const rem = len - full * 4;
  const outLen = full * 3 + (rem === 0 ? 0 : rem === 2 ? 1 : rem === 3 ? 2 : -1);
  if (outLen < 0) throw new Error('base64url: invalid length');
  const out = new Uint8Array(outLen);
  let oi = 0;
  const dec = (c: number): number => {
    if (c >= 128) throw new Error('base64url: non-ascii');
    const v = BASE64URL_LOOKUP[c];
    if (v < 0) throw new Error(`base64url: bad char ${String.fromCharCode(c)}`);
    return v;
  };
  let i = 0;
  for (let k = 0; k < full; k++, i += 4) {
    const a = dec(s.charCodeAt(i));
    const b = dec(s.charCodeAt(i + 1));
    const c = dec(s.charCodeAt(i + 2));
    const d = dec(s.charCodeAt(i + 3));
    out[oi++] = (a << 2) | (b >> 4);
    out[oi++] = ((b & 0x0f) << 4) | (c >> 2);
    out[oi++] = ((c & 0x03) << 6) | d;
  }
  if (rem === 2) {
    const a = dec(s.charCodeAt(i));
    const b = dec(s.charCodeAt(i + 1));
    out[oi++] = (a << 2) | (b >> 4);
  } else if (rem === 3) {
    const a = dec(s.charCodeAt(i));
    const b = dec(s.charCodeAt(i + 1));
    const c = dec(s.charCodeAt(i + 2));
    out[oi++] = (a << 2) | (b >> 4);
    out[oi++] = ((b & 0x0f) << 4) | (c >> 2);
  }
  return out;
}

// -------- encode / decode --------

function configKeys(game: ReplayGame): readonly string[] {
  return game === 'snake' ? SNAKE_CONFIG_KEYS : TETRIS_CONFIG_KEYS;
}

function actionToCode(game: ReplayGame, action: string): number {
  const map = game === 'snake' ? SNAKE_ACTION_TO_CODE : TETRIS_ACTION_TO_CODE;
  const code = map[action];
  if (code === undefined) throw new Error(`unknown ${game} action: ${action}`);
  return code;
}

function codeToAction(game: ReplayGame, code: number): string {
  const list = game === 'snake' ? SNAKE_ACTIONS : TETRIS_ACTIONS;
  const a = list[code];
  if (a === undefined) throw new Error(`unknown ${game} action code: ${code}`);
  return a;
}

export function encodeReplay(replay: Replay): string {
  if (replay.version !== 1) throw new Error(`unsupported replay version ${replay.version}`);
  const bytes: number[] = [];
  bytes.push(GAME_ID[replay.game]);
  bytes.push(VERSION);
  // seed: uint32 LE
  const s = replay.seed >>> 0;
  bytes.push(s & 0xff, (s >>> 8) & 0xff, (s >>> 16) & 0xff, (s >>> 24) & 0xff);
  // config: fixed byte-per-field layout
  const keys = configKeys(replay.game);
  for (const k of keys) {
    const v = replay.config[k];
    if (typeof v !== 'number' || v < 0 || v > 255 || !Number.isInteger(v)) {
      throw new Error(`config field ${k} must be int 0..255, got ${v}`);
    }
    bytes.push(v);
  }
  writeVarint(bytes, replay.inputs.length);
  writeVarint(bytes, replay.endedAtTick);
  writeVarint(bytes, replay.finalScore);
  let prevTick = 0;
  for (const inp of replay.inputs) {
    const delta = inp.tick - prevTick;
    if (delta < 0) throw new Error('inputs must be sorted by tick ascending');
    writeVarint(bytes, delta);
    bytes.push(actionToCode(replay.game, inp.action));
    prevTick = inp.tick;
  }
  return bytesToBase64Url(Uint8Array.from(bytes));
}

export function decodeReplay(encoded: string): Replay {
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length < 6) throw new Error('replay: truncated header');
  const gameId = bytes[0];
  const game = ID_TO_GAME[gameId];
  if (!game) throw new Error(`replay: unknown game id ${gameId}`);
  const version = bytes[1];
  if (version !== VERSION) throw new Error(`replay: unsupported version ${version}`);
  const seed =
    (bytes[2] |
      (bytes[3] << 8) |
      (bytes[4] << 16) |
      (bytes[5] << 24)) >>>
    0;
  let offset = 6;
  const keys = configKeys(game);
  const config: Record<string, number> = {};
  for (const k of keys) {
    if (offset >= bytes.length) throw new Error('replay: truncated config');
    config[k] = bytes[offset++];
  }
  const rCount = readVarint(bytes, offset);
  offset = rCount.next;
  const rEnd = readVarint(bytes, offset);
  offset = rEnd.next;
  const rScore = readVarint(bytes, offset);
  offset = rScore.next;
  const inputs: ReplayInput[] = [];
  let prevTick = 0;
  for (let i = 0; i < rCount.value; i++) {
    const rDelta = readVarint(bytes, offset);
    offset = rDelta.next;
    if (offset >= bytes.length) throw new Error('replay: truncated input');
    const action = codeToAction(game, bytes[offset++]);
    prevTick = prevTick + rDelta.value;
    inputs.push({ tick: prevTick, action });
  }
  return {
    game,
    version: 1,
    seed,
    config,
    inputs,
    endedAtTick: rEnd.value,
    finalScore: rScore.value,
  };
}

/** Convenience: is this string a plausible encoded replay (character set only)? */
export function isReplayUrlSafe(s: string): boolean {
  return /^[A-Za-z0-9_-]*$/.test(s);
}
