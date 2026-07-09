/**
 * Global theme service for the arcade.
 *
 * A theme bundles two things:
 *   1. A map of CSS custom properties applied to `<html>` (so component CSS
 *      can react to the theme by consuming `var(--nyx-…)`).
 *   2. A per-game palette record whose values feed the canvas renderers,
 *      which run in JS and can't read CSS variables at draw time.
 *
 * The service is a tiny singleton — the arcade only has one active theme.
 * Components subscribe with `subscribeTheme(cb)` and re-render on change.
 * The palette shape is intentionally exhaustive per game: adding a new
 * theme requires filling in every key, which the type system enforces.
 */

// ----- Per-game palettes -------------------------------------------------

export interface SnakePalette {
  readonly bg: string;
  readonly grid: string;
  readonly gridMajor: string;
  readonly gridBorder: string;
  readonly food: string;
  readonly bonus: string;
  readonly body: string;
  readonly head: string;
  readonly hudFg: string;
  readonly hudDim: string;
  readonly hudValue: string;
  readonly hudBg: string;
  readonly overlayBg: string;
  /** Foreground of the shared PAUSED title + chevrons. */
  readonly pauseAccent: string;
  /** Fill of the "REPLAY" badge drawn by game.ts during replay playback. */
  readonly replayBadgeBg: string;
  readonly replayBadgeFg: string;
  readonly replayBadgeBorder: string;
}

export interface TetrisPalette {
  readonly bg: string;
  readonly gridLine: string;
  readonly overlayBg: string;
  readonly overlayFg: string;
  readonly overlaySubtitle: string;
  readonly lineClearFlash: string;
  readonly pauseAccent: string;
  readonly hudDim: string;
  readonly panelBg: string;
  readonly panelBorder: string;
  readonly pieces: {
    readonly I: string;
    readonly O: string;
    readonly T: string;
    readonly S: string;
    readonly Z: string;
    readonly J: string;
    readonly L: string;
  };
  readonly replayBadgeBg: string;
  readonly replayBadgeFg: string;
  readonly replayBadgeBorder: string;
}

export interface PacmanPalette {
  readonly bg: string;
  readonly wall: string;
  readonly wallFlash: string;
  readonly door: string;
  readonly pellet: string;
  readonly power: string;
  readonly pacman: string;
  readonly blinky: string;
  readonly pinky: string;
  readonly inky: string;
  readonly clyde: string;
  readonly frightened: string;
  readonly frightenedFlash: string;
  /** Eyes-only ghost that's been eaten and is heading home. */
  readonly eaten: string;
  readonly hud: string;
  readonly hudDim: string;
  readonly ready: string;
  readonly gameOver: string;
  readonly pauseAccent: string;
}

export interface BricksPalette {
  readonly bg: string;
  readonly panel: string;
  readonly panelBorder: string;
  readonly grid: string;
  readonly fg: string;
  readonly dim: string;
  readonly paddle: string;
  readonly paddleEdge: string;
  readonly ball: string;
  readonly shadow: string;
  /** One colour per brick row (index 0 = top row). Length must be >= brickRows. */
  readonly brickRows: readonly string[];
  readonly overlayBg: string;
  readonly overlayDanger: string;
  readonly pauseAccent: string;
}

export interface TermoPalette {
  readonly correct: string;
  readonly present: string;
  readonly absent: string;
  readonly tileEmpty: string;
  readonly tileBorder: string;
  readonly tileBorderFilled: string;
  readonly keyDefault: string;
}

export interface Theme {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly css: Readonly<Record<string, string>>;
  readonly games: {
    readonly snake: SnakePalette;
    readonly tetris: TetrisPalette;
    readonly pacman: PacmanPalette;
    readonly termo: TermoPalette;
    readonly bricks: BricksPalette;
  };
}

// ----- Registry & service ------------------------------------------------

const REGISTRY = new Map<string, Theme>();

export function registerTheme(theme: Theme): void {
  REGISTRY.set(theme.id, theme);
}

export function getTheme(id: string): Theme | null {
  return REGISTRY.get(id) ?? null;
}

export function listThemes(): readonly Theme[] {
  return Array.from(REGISTRY.values());
}

export const THEME_STORAGE_KEY = 'arcade.theme.activeId';

type Listener = (theme: Theme) => void;
const listeners = new Set<Listener>();

let active: Theme | null = null;

/**
 * Read the persisted theme id (if any). Falls back to null when localStorage
 * is unavailable (e.g. during SSR or a first visit). Exposed for tests.
 */
export function readPersistedThemeId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePersistedThemeId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* private-mode / quota — silent fallback */
  }
}

/**
 * Apply a theme's CSS custom properties to the root element. Safe to call
 * outside a browser (no-ops when `document` is undefined).
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.css)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute('data-theme', theme.id);
}

/**
 * Initialize the theme system. Reads any persisted id, falls back to
 * `defaultId`, applies CSS variables, and returns the resolved theme.
 * Idempotent — subsequent calls simply re-apply.
 */
export function initTheme(defaultId: string): Theme {
  const persistedId = readPersistedThemeId();
  const resolved =
    (persistedId && getTheme(persistedId)) ??
    getTheme(defaultId) ??
    listThemes()[0];
  if (!resolved) {
    throw new Error('No themes registered — cannot initialize theme service.');
  }
  active = resolved;
  applyTheme(resolved);
  return resolved;
}

export function getCurrentTheme(): Theme {
  if (active) return active;
  // Auto-init using the first registered theme (registered by the module
  // that owns the theme registry). This keeps early callers safe.
  const first = listThemes()[0];
  if (!first) {
    throw new Error('getCurrentTheme() called before any theme was registered.');
  }
  active = first;
  return first;
}

export function setActiveTheme(id: string): boolean {
  const t = getTheme(id);
  if (!t) return false;
  if (active && active.id === t.id) return true;
  active = t;
  applyTheme(t);
  writePersistedThemeId(t.id);
  for (const cb of listeners) cb(t);
  return true;
}

/**
 * Subscribe to theme changes. The callback fires each time `setActiveTheme`
 * successfully swaps to a different theme. Returns an unsubscribe fn.
 */
export function subscribeTheme(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Test-only helper: reset the singleton. Not part of the public runtime API. */
export function __resetThemeStateForTests(): void {
  active = null;
  listeners.clear();
}
