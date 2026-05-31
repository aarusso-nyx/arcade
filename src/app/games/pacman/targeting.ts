import { DELTA, type Direction } from '../../../core';
import { HOME_CORNERS, GHOST_HOUSE_DOOR_TILE } from './config';
import type { GhostId, TileVec } from './types';

/** Tile a given number of steps from `origin` in `dir`. */
export function tileAhead(origin: TileVec, dir: Direction, n: number): TileVec {
  const { dx, dy } = DELTA[dir];
  return { tx: origin.tx + dx * n, ty: origin.ty + dy * n };
}

/**
 * Pinky/Inky's "look ahead" with the canonical up-overflow bug: when Pac-Man
 * faces UP, the ahead vector also shifts LEFT by the same magnitude.
 */
export function tileAheadWithUpBug(origin: TileVec, dir: Direction, n: number): TileVec {
  if (dir === 'up') {
    return { tx: origin.tx - n, ty: origin.ty - n };
  }
  return tileAhead(origin, dir, n);
}

export interface TargetContext {
  pacTile: TileVec;
  pacDir: Direction;
  blinkyTile: TileVec;
  ghostTile: TileVec;
}

export function blinkyTarget(ctx: TargetContext): TileVec {
  return { tx: ctx.pacTile.tx, ty: ctx.pacTile.ty };
}

export function pinkyTarget(ctx: TargetContext): TileVec {
  return tileAheadWithUpBug(ctx.pacTile, ctx.pacDir, 4);
}

export function inkyTarget(ctx: TargetContext): TileVec {
  const pivot = tileAheadWithUpBug(ctx.pacTile, ctx.pacDir, 2);
  return {
    tx: 2 * pivot.tx - ctx.blinkyTile.tx,
    ty: 2 * pivot.ty - ctx.blinkyTile.ty,
  };
}

export function clydeTarget(ctx: TargetContext): TileVec {
  const dx = ctx.pacTile.tx - ctx.ghostTile.tx;
  const dy = ctx.pacTile.ty - ctx.ghostTile.ty;
  const distSq = dx * dx + dy * dy;
  if (distSq > 64) {
    return { tx: ctx.pacTile.tx, ty: ctx.pacTile.ty };
  }
  const [hx, hy] = HOME_CORNERS.clyde;
  return { tx: hx, ty: hy };
}

export function chaseTarget(id: GhostId, ctx: TargetContext): TileVec {
  switch (id) {
    case 'blinky': return blinkyTarget(ctx);
    case 'pinky': return pinkyTarget(ctx);
    case 'inky': return inkyTarget(ctx);
    case 'clyde': return clydeTarget(ctx);
  }
}

export function scatterTarget(id: GhostId): TileVec {
  const [tx, ty] = HOME_CORNERS[id];
  return { tx, ty };
}

export function eatenTarget(): TileVec {
  const [tx, ty] = GHOST_HOUSE_DOOR_TILE;
  return { tx, ty };
}
