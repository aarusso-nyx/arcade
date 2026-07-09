import { registerTheme } from './theme';
import { NYX_THEME } from './themes/nyx';
import { CRT_THEME } from './themes/crt';

// Register bundled themes at module-load time. Importing from this barrel
// guarantees the registry is populated before anyone reads it.
registerTheme(NYX_THEME);
registerTheme(CRT_THEME);

export * from './theme';
export { NYX_THEME } from './themes/nyx';
export { CRT_THEME } from './themes/crt';

/** Default theme id used by `initTheme` when nothing is persisted. */
export const DEFAULT_THEME_ID = 'nyx';
