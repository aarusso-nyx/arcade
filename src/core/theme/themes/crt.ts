import type { Theme } from '../theme';

/**
 * CRT — green-on-black phosphor monitor. Deliberately monochrome-ish:
 * everything reads on a green-luminance axis with a few brighter accents
 * for HUD "hot" values. Distinguishing sprites (ghosts, tetrominos) rely
 * on shade rather than hue, which is authentic to a monochrome monitor.
 */
const P_DEEP = '#0a2a12';       // background wash
const P_DIM = '#1a9920';        // dim phosphor
const P_MID = '#33ff33';        // primary phosphor
const P_HI = '#88ff88';         // hot phosphor (near-white glow)
const P_BORDER = '#205020';     // outline / border tint
const P_BG = '#000000';

export const CRT_THEME: Theme = {
  id: 'crt',
  name: 'CRT',
  description: 'Green-on-black phosphor monitor. Everything on a single luminance axis.',
  css: {
    '--nyx-bg': P_BG,
    '--nyx-bg-elev': '#050f05',
    '--nyx-border': P_BORDER,
    '--nyx-fg': P_MID,
    '--nyx-fg-dim': P_DIM,
    '--nyx-brand-deep': P_DEEP,
    '--nyx-brand': P_MID,
    '--nyx-brand-hi': P_HI,
    '--nyx-accent': P_HI,
    // Termo tile / key palette — every state on the green axis.
    '--termo-correct': P_MID,
    '--termo-present': '#c8c400',
    '--termo-absent': P_DEEP,
    '--termo-tile-empty': P_BG,
    '--termo-tile-border': P_BORDER,
    '--termo-tile-border-filled': P_DIM,
    '--termo-key-default': P_DIM,
  },
  games: {
    snake: {
      bg: P_BG,
      grid: P_DEEP,
      gridMajor: P_BORDER,
      gridBorder: P_DIM,
      food: P_HI,
      bonus: '#c8c400',
      body: P_MID,
      head: P_HI,
      hudFg: P_MID,
      hudDim: P_DIM,
      hudValue: P_HI,
      hudBg: 'rgba(0, 20, 0, 0.55)',
      overlayBg: 'rgba(0, 20, 0, 0.82)',
      pauseAccent: P_MID,
      replayBadgeBg: 'rgba(51, 255, 51, 0.20)',
      replayBadgeFg: P_HI,
      replayBadgeBorder: P_MID,
    },
    tetris: {
      bg: P_BG,
      gridLine: 'rgba(51, 255, 51, 0.06)',
      overlayBg: 'rgba(0, 20, 0, 0.75)',
      overlayFg: P_HI,
      overlaySubtitle: P_DIM,
      lineClearFlash: P_HI,
      pauseAccent: P_MID,
      hudDim: P_DIM,
      panelBg: '#050f05',
      panelBorder: P_BORDER,
      pieces: {
        // Distinguished by luminance/hue-nudge on the green axis. All read
        // as "phosphor" but remain visually distinguishable.
        I: '#88ffff',
        O: '#e0ff88',
        T: '#88ff88',
        S: '#33ff33',
        Z: '#66cc66',
        J: '#22aa22',
        L: '#aaff33',
      },
      replayBadgeBg: 'rgba(51, 255, 51, 0.22)',
      replayBadgeFg: P_HI,
      replayBadgeBorder: P_MID,
    },
    pacman: {
      bg: P_BG,
      wall: P_BORDER,
      wallFlash: P_HI,
      door: P_MID,
      pellet: P_HI,
      power: P_HI,
      pacman: P_HI,
      blinky: P_MID,
      pinky: '#aaff88',
      inky: '#66ffcc',
      clyde: '#c8c400',
      frightened: P_DIM,
      frightenedFlash: P_HI,
      eaten: P_HI,
      hud: P_MID,
      hudDim: P_DIM,
      ready: P_HI,
      gameOver: P_MID,
      pauseAccent: P_MID,
    },
    termo: {
      correct: P_MID,
      present: '#c8c400',
      absent: P_DEEP,
      tileEmpty: P_BG,
      tileBorder: P_BORDER,
      tileBorderFilled: P_DIM,
      keyDefault: P_DIM,
    },
    bricks: {
      bg: P_BG,
      panel: '#050f05',
      panelBorder: P_BORDER,
      grid: 'rgba(51, 255, 51, 0.10)',
      fg: P_HI,
      dim: P_DIM,
      paddle: P_MID,
      paddleEdge: P_HI,
      ball: P_HI,
      shadow: 'rgba(0, 0, 0, 0.5)',
      brickRows: [
        P_HI,
        P_HI,
        '#c8c400',
        '#c8c400',
        P_MID,
        P_MID,
        P_DIM,
      ],
      overlayBg: 'rgba(0, 20, 0, 0.75)',
      overlayDanger: P_HI,
      pauseAccent: P_MID,
    },
  },
};
