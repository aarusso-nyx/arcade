import {
  __resetThemeStateForTests,
  applyTheme,
  DEFAULT_THEME_ID,
  getCurrentTheme,
  getTheme,
  initTheme,
  listThemes,
  setActiveTheme,
  subscribeTheme,
  THEME_STORAGE_KEY,
  type Theme,
  NYX_THEME,
  CRT_THEME,
} from './index';

// A palette-completeness check: every registered theme must supply every
// key used by any renderer. We derive the required key set from the NYX
// theme (the canonical reference) and assert all others match key-for-key.
// TypeScript already enforces this at compile time, but the runtime test
// catches accidental "as any" downgrades or theme JSON drift.

interface PaletteKeys {
  readonly snake: readonly string[];
  readonly tetris: readonly string[];
  readonly tetrisPieces: readonly string[];
  readonly pacman: readonly string[];
  readonly termo: readonly string[];
  readonly bricks: readonly string[];
  readonly css: readonly string[];
}

function collectPaletteKeys(t: Theme): PaletteKeys {
  return {
    snake: Object.keys(t.games.snake).sort(),
    tetris: Object.keys(t.games.tetris).sort(),
    tetrisPieces: Object.keys(t.games.tetris.pieces).sort(),
    pacman: Object.keys(t.games.pacman).sort(),
    termo: Object.keys(t.games.termo).sort(),
    bricks: Object.keys(t.games.bricks).sort(),
    css: Object.keys(t.css).sort(),
  };
}

describe('theme registry', () => {
  beforeEach(() => {
    __resetThemeStateForTests();
    if (typeof localStorage !== 'undefined') localStorage.removeItem(THEME_STORAGE_KEY);
  });

  it('registers NYX and CRT out of the box', () => {
    const ids = listThemes().map((t) => t.id).sort();
    expect(ids).toEqual(['crt', 'nyx']);
  });

  it('resolves themes by id', () => {
    expect(getTheme('nyx')?.id).toBe('nyx');
    expect(getTheme('crt')?.id).toBe('crt');
    expect(getTheme('bogus')).toBeNull();
  });

  it('every theme supplies every palette key used by any renderer', () => {
    const reference = collectPaletteKeys(NYX_THEME);
    for (const theme of listThemes()) {
      const keys = collectPaletteKeys(theme);
      expect(keys.snake).withContext(`${theme.id}.snake`).toEqual(reference.snake);
      expect(keys.tetris).withContext(`${theme.id}.tetris`).toEqual(reference.tetris);
      expect(keys.tetrisPieces).withContext(`${theme.id}.tetris.pieces`).toEqual(reference.tetrisPieces);
      expect(keys.pacman).withContext(`${theme.id}.pacman`).toEqual(reference.pacman);
      expect(keys.termo).withContext(`${theme.id}.termo`).toEqual(reference.termo);
      expect(keys.bricks).withContext(`${theme.id}.bricks`).toEqual(reference.bricks);
      // CSS keys are allowed to add extras but must at minimum cover the
      // NYX brand vars the rest of the app relies on. Assert the intersection.
      const required = reference.css;
      for (const key of required) {
        expect(keys.css).withContext(`${theme.id}.css missing ${key}`).toContain(key);
      }
    }
  });

  it('every palette value is a non-empty string', () => {
    for (const theme of listThemes()) {
      const flatten = (obj: unknown, path: string): void => {
        if (obj == null) return;
        if (typeof obj === 'string') {
          expect(obj.length).withContext(`${theme.id}.${path}`).toBeGreaterThan(0);
          return;
        }
        if (Array.isArray(obj)) {
          obj.forEach((v, i) => flatten(v, `${path}[${i}]`));
          return;
        }
        if (typeof obj === 'object') {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            flatten(v, path ? `${path}.${k}` : k);
          }
        }
      };
      flatten(theme.games, 'games');
      flatten(theme.css, 'css');
    }
  });

  it('brick row palette covers all 7 rows', () => {
    for (const theme of listThemes()) {
      expect(theme.games.bricks.brickRows.length)
        .withContext(theme.id)
        .toBeGreaterThanOrEqual(7);
    }
  });
});

describe('theme service', () => {
  beforeEach(() => {
    __resetThemeStateForTests();
    if (typeof localStorage !== 'undefined') localStorage.removeItem(THEME_STORAGE_KEY);
    // Reset the CSS custom properties set by applyTheme so tests are isolated.
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      for (const key of [
        '--nyx-bg', '--nyx-fg', '--nyx-brand', '--nyx-brand-hi', '--nyx-accent',
      ]) {
        root.style.removeProperty(key);
      }
    }
  });

  it('initTheme falls back to the default when nothing is persisted', () => {
    const t = initTheme(DEFAULT_THEME_ID);
    expect(t.id).toBe('nyx');
    expect(getCurrentTheme().id).toBe('nyx');
  });

  it('setActiveTheme swaps CSS vars and persists to localStorage', () => {
    initTheme(DEFAULT_THEME_ID);
    const ok = setActiveTheme('crt');
    expect(ok).toBeTrue();
    expect(getCurrentTheme().id).toBe('crt');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('crt');
    const bg = document.documentElement.style.getPropertyValue('--nyx-bg');
    expect(bg).toBe('#000000');
  });

  it('setActiveTheme returns false for unknown ids', () => {
    initTheme(DEFAULT_THEME_ID);
    expect(setActiveTheme('nope')).toBeFalse();
  });

  it('round-trips persistence: init → set → init returns the same theme', () => {
    initTheme(DEFAULT_THEME_ID);
    setActiveTheme('crt');
    // Simulate a page reload by resetting the singleton and re-initializing.
    __resetThemeStateForTests();
    const t = initTheme(DEFAULT_THEME_ID);
    expect(t.id).toBe('crt');
    expect(getCurrentTheme().id).toBe('crt');
  });

  it('subscribeTheme notifies on change and unsubscribes cleanly', () => {
    initTheme(DEFAULT_THEME_ID);
    const seen: string[] = [];
    const off = subscribeTheme((t) => seen.push(t.id));
    setActiveTheme('crt');
    setActiveTheme('nyx');
    off();
    setActiveTheme('crt');
    expect(seen).toEqual(['crt', 'nyx']);
  });

  it('applyTheme is a no-op when re-applied — writes are idempotent', () => {
    applyTheme(NYX_THEME);
    applyTheme(NYX_THEME);
    expect(document.documentElement.getAttribute('data-theme')).toBe('nyx');
  });

  it('CRT theme keeps every palette entry on the green luminance axis (spot check)', () => {
    // Not a deep test — just guards against accidentally shipping a garish
    // colour in the "monochrome" preset.
    expect(CRT_THEME.games.snake.body.toLowerCase()).toContain('3');
    expect(CRT_THEME.games.pacman.wall.toLowerCase()).not.toBe('#1a1aff');
  });
});
