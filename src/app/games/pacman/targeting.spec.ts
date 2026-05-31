import {
  blinkyTarget,
  pinkyTarget,
  inkyTarget,
  clydeTarget,
  scatterTarget,
  tileAhead,
  tileAheadWithUpBug,
  type TargetContext,
} from './targeting';
import { HOME_CORNERS } from './config';

function ctx(overrides: Partial<TargetContext>): TargetContext {
  return {
    pacTile: { tx: 10, ty: 20 },
    pacDir: 'right',
    blinkyTile: { tx: 5, ty: 5 },
    ghostTile: { tx: 15, ty: 20 },
    ...overrides,
  };
}

describe('pacman targeting', () => {
  describe('tileAhead / tileAheadWithUpBug', () => {
    it('moves n tiles in the given direction', () => {
      expect(tileAhead({ tx: 10, ty: 10 }, 'left', 4)).toEqual({ tx: 6, ty: 10 });
      expect(tileAhead({ tx: 10, ty: 10 }, 'down', 4)).toEqual({ tx: 10, ty: 14 });
      expect(tileAhead({ tx: 10, ty: 10 }, 'up', 4)).toEqual({ tx: 10, ty: 6 });
    });
    it('applies the canonical up-overflow bug', () => {
      // 4 ahead with up bug: (-4, -4) from origin.
      expect(tileAheadWithUpBug({ tx: 10, ty: 10 }, 'up', 4)).toEqual({ tx: 6, ty: 6 });
      // Other directions are unaffected.
      expect(tileAheadWithUpBug({ tx: 10, ty: 10 }, 'right', 4)).toEqual({ tx: 14, ty: 10 });
    });
  });

  describe('blinky', () => {
    it("targets Pac-Man's tile directly", () => {
      expect(blinkyTarget(ctx({ pacTile: { tx: 7, ty: 3 } }))).toEqual({ tx: 7, ty: 3 });
    });
  });

  describe('pinky', () => {
    it('targets 4 tiles ahead when not facing up', () => {
      expect(pinkyTarget(ctx({ pacTile: { tx: 10, ty: 10 }, pacDir: 'right' })))
        .toEqual({ tx: 14, ty: 10 });
      expect(pinkyTarget(ctx({ pacTile: { tx: 10, ty: 10 }, pacDir: 'down' })))
        .toEqual({ tx: 10, ty: 14 });
    });
    it('applies the up-bug when facing up (also shifts left 4)', () => {
      expect(pinkyTarget(ctx({ pacTile: { tx: 10, ty: 10 }, pacDir: 'up' })))
        .toEqual({ tx: 6, ty: 6 });
    });
  });

  describe('inky', () => {
    it('uses the vector from Blinky through the pivot 2 ahead of Pac-Man', () => {
      // Pac at (10,10) facing right -> pivot (12,10). Blinky at (5,5).
      // target = 2*pivot - blinky = (24-5, 20-5) = (19, 15).
      const t = inkyTarget(ctx({
        pacTile: { tx: 10, ty: 10 },
        pacDir: 'right',
        blinkyTile: { tx: 5, ty: 5 },
      }));
      expect(t).toEqual({ tx: 19, ty: 15 });
    });
    it('is symmetric about the pivot regardless of Blinky position', () => {
      const pivot = { tx: 12, ty: 10 };
      const blinkyA = { tx: 5, ty: 5 };
      const blinkyB = { tx: 19, ty: 15 };
      // If Blinky is at "the target for A", target for B should be at "the position of Blinky A".
      const tA = inkyTarget(ctx({ pacTile: { tx: 10, ty: 10 }, pacDir: 'right', blinkyTile: blinkyA }));
      const tB = inkyTarget(ctx({ pacTile: { tx: 10, ty: 10 }, pacDir: 'right', blinkyTile: tA }));
      expect(tB).toEqual({ tx: 2 * pivot.tx - tA.tx, ty: 2 * pivot.ty - tA.ty });
    });
    it('applies the up-bug to the pivot when Pac-Man faces up', () => {
      // Pac (10,10) up -> pivot (8,8). Blinky (5,5). target = (16-5, 16-5) = (11, 11).
      const t = inkyTarget(ctx({
        pacTile: { tx: 10, ty: 10 },
        pacDir: 'up',
        blinkyTile: { tx: 5, ty: 5 },
      }));
      expect(t).toEqual({ tx: 11, ty: 11 });
    });
  });

  describe('clyde', () => {
    const [hx, hy] = HOME_CORNERS.clyde;
    it('chases Pac-Man when farther than 8 tiles (squared > 64)', () => {
      // Distance > 8 tiles: e.g. dx=10, dy=0 → 100 > 64.
      const t = clydeTarget(ctx({
        pacTile: { tx: 10, ty: 10 },
        ghostTile: { tx: 0, ty: 10 },
      }));
      expect(t).toEqual({ tx: 10, ty: 10 });
    });
    it('flees to home corner when within 8 tiles', () => {
      // distance 5 — well within 8.
      const t = clydeTarget(ctx({
        pacTile: { tx: 10, ty: 10 },
        ghostTile: { tx: 13, ty: 14 },
      }));
      expect(t).toEqual({ tx: hx, ty: hy });
    });
    it('uses strict greater-than: distance == 8 falls to home corner', () => {
      // dx=8, dy=0 → 64; condition is > 64 → false → home corner.
      const t = clydeTarget(ctx({
        pacTile: { tx: 10, ty: 10 },
        ghostTile: { tx: 2, ty: 10 },
      }));
      expect(t).toEqual({ tx: hx, ty: hy });
    });
  });

  describe('scatterTarget', () => {
    it('returns the home corner per ghost', () => {
      expect(scatterTarget('blinky')).toEqual({ tx: HOME_CORNERS.blinky[0], ty: HOME_CORNERS.blinky[1] });
      expect(scatterTarget('pinky')).toEqual({ tx: HOME_CORNERS.pinky[0], ty: HOME_CORNERS.pinky[1] });
      expect(scatterTarget('inky')).toEqual({ tx: HOME_CORNERS.inky[0], ty: HOME_CORNERS.inky[1] });
      expect(scatterTarget('clyde')).toEqual({ tx: HOME_CORNERS.clyde[0], ty: HOME_CORNERS.clyde[1] });
    });
  });
});
