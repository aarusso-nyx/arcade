import { Router } from '@angular/router';

/**
 * Cross-game keyboard shortcuts.
 *
 * - `Digit0`  → home
 * - `Digit1`  → /pacman
 * - `Digit2`  → /tetris
 * - `Digit3`  → /snake
 * - `Digit4`  → /termo
 * - `Digit5`  → /bricks
 * - `Backslash` → toggle arcade-mode (fullscreen board)
 * - `KeyH` / `?` → help dialog (handled in components)
 * - `KeyC`  → credits dialog (handled in components)
 * - `KeyM`  → toggle audio mute. Persisted globally under
 *   `arcade.audio.muted`; the binding lives in each game's component.
 *   Termo binds it to uppercase `M` (Shift+M) so the lowercase letter can
 *   still be typed as part of a guess.
 *
 * Components call `tryNavigate()` from their @HostListener. The optional
 * `exclude` set lets a game opt out of specific digits — Snake uses 1/2/3
 * for its queue-depth toggle and reserves them.
 */

export interface ArcadeRoute {
  readonly code: string;
  readonly path: string;
  readonly label: string;
  readonly digit: string;
}

export const ARCADE_ROUTES: readonly ArcadeRoute[] = [
  { code: 'Digit0', path: '/',       label: 'Arcade',  digit: '0' },
  { code: 'Digit1', path: '/pacman', label: 'Pac-Man', digit: '1' },
  { code: 'Digit2', path: '/tetris', label: 'Tetris',  digit: '2' },
  { code: 'Digit3', path: '/snake',  label: 'Snake',   digit: '3' },
  { code: 'Digit4', path: '/termo',  label: 'Termo',   digit: '4' },
  { code: 'Digit5', path: '/bricks', label: 'Bricks',  digit: '5' },
] as const;

export function tryNavigate(
  router: Router,
  code: string,
  exclude: readonly string[] = [],
): boolean {
  if (exclude.includes(code)) return false;
  const route = ARCADE_ROUTES.find((r) => r.code === code);
  if (!route) return false;
  router.navigate([route.path]);
  return true;
}
