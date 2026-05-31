import { collides, createEmptyGrid } from './board';
import { pieceCells } from './pieces';
import { getKickTable, KICK_I, KICK_JLSTZ, nextRotation, tryRotate } from './srs';
import { makeActive } from './state';
import type { ActivePiece, Rotation } from './types';

describe('tetris/srs', () => {
  describe('kick table integrity', () => {
    it('J/L/S/T/Z 0→R kicks match spec', () => {
      expect(KICK_JLSTZ['0->1']).toEqual([
        [0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2],
      ]);
    });

    it('J/L/S/T/Z R→0 kicks match spec', () => {
      expect(KICK_JLSTZ['1->0']).toEqual([
        [0, 0], [1, 0], [1, -1], [0, 2], [1, 2],
      ]);
    });

    it('J/L/S/T/Z L→0 kicks match spec', () => {
      expect(KICK_JLSTZ['3->0']).toEqual([
        [0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2],
      ]);
    });

    it('I 0→R kicks differ from JLSTZ 0→R', () => {
      expect(KICK_I['0->1']).toEqual([
        [0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2],
      ]);
      expect(KICK_I['0->1']).not.toEqual(KICK_JLSTZ['0->1']);
    });

    it('I R→2 kicks match spec', () => {
      expect(KICK_I['1->2']).toEqual([
        [0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1],
      ]);
    });
  });

  describe('nextRotation', () => {
    it('CW cycles 0→R→2→L→0', () => {
      expect(nextRotation(0, 'CW')).toBe(1);
      expect(nextRotation(1, 'CW')).toBe(2);
      expect(nextRotation(2, 'CW')).toBe(3);
      expect(nextRotation(3, 'CW')).toBe(0);
    });
    it('CCW cycles 0→L→2→R→0', () => {
      expect(nextRotation(0, 'CCW')).toBe(3);
      expect(nextRotation(3, 'CCW')).toBe(2);
      expect(nextRotation(2, 'CCW')).toBe(1);
      expect(nextRotation(1, 'CCW')).toBe(0);
    });
    it('180 is two CW rotations', () => {
      expect(nextRotation(0, '180')).toBe(2);
      expect(nextRotation(1, '180')).toBe(3);
    });
  });

  describe('getKickTable', () => {
    it('O piece returns identity-only kicks', () => {
      const k = getKickTable('O', 0, 1);
      expect(k).toEqual([[0, 0]]);
    });

    it('180 rotations return identity-only kicks', () => {
      const k = getKickTable('T', 0, 2);
      expect(k).toEqual([[0, 0]]);
    });

    it('I uses I-piece table', () => {
      const k = getKickTable('I', 0, 1);
      expect(k).toEqual(KICK_I['0->1']);
    });

    it('J uses JLSTZ table', () => {
      const k = getKickTable('J', 0, 1);
      expect(k).toEqual(KICK_JLSTZ['0->1']);
    });
  });

  describe('tryRotate', () => {
    it('rotates on empty board without kicks (identity)', () => {
      const grid = createEmptyGrid();
      const j = makeActive('J');
      const r = tryRotate(j, grid, 'CW');
      expect(r).not.toBeNull();
      expect(r!.piece.rotation).toBe(1);
      expect(r!.piece.x).toBe(j.x);
      expect(r!.piece.y).toBe(j.y);
      expect(r!.kickIndex).toBe(0);
    });

    it('CW then CCW returns to original on empty board', () => {
      const grid = createEmptyGrid();
      const j = makeActive('J');
      const a = tryRotate(j, grid, 'CW')!;
      const b = tryRotate(a.piece, grid, 'CCW')!;
      expect(b.piece.rotation).toBe(0);
      expect(b.piece.x).toBe(j.x);
      expect(b.piece.y).toBe(j.y);
    });

    it('full 0→R→2→L→0 cycle returns to original on empty board', () => {
      const grid = createEmptyGrid();
      const t = makeActive('T');
      let p: ActivePiece = t;
      for (let i = 0; i < 4; i++) p = tryRotate(p, grid, 'CW')!.piece;
      expect(p.rotation).toBe(0);
      expect(p.x).toBe(t.x);
      expect(p.y).toBe(t.y);
    });

    it('J piece against left wall in state R rotates to state 2 via kick', () => {
      // J state R cells include (1,0)(2,0)(1,1)(1,2). Place x=-1 so the leftmost
      // cells sit on the wall. Identity rotation to state 2 must fail; a
      // positive-x kick should succeed.
      const grid = createEmptyGrid();
      const j: ActivePiece = {
        ...makeActive('J'),
        x: -1,
        y: 19,
        rotation: 1, // R
      };
      // Sanity: this position is in-bounds.
      expect(collides(j, grid)).toBe(false);
      const result = tryRotate(j, grid, 'CW'); // R → 2
      expect(result).not.toBeNull();
      // Must have moved right via a kick (kickIndex > 0).
      expect(result!.kickIndex).toBeGreaterThan(0);
      expect(result!.piece.rotation).toBe(2);
    });

    it('I piece in state R rotates to state 2 via an I-table kick when identity fails', () => {
      const grid = createEmptyGrid();
      // I state R cells (2,0)(2,1)(2,2)(2,3). At x=7 → column 9, rows 18..21. In-bounds.
      const i: ActivePiece = {
        ...makeActive('I'),
        x: 7,
        y: 18,
        rotation: 1,
        lastMoveWasRotation: false,
        lastKickIndex: -1,
      };
      expect(collides(i, grid)).toBe(false);
      // Rotate CW to state 2: cells (0,2)(1,2)(2,2)(3,2) → at x=7 cols 7..10 → OOB.
      const result = tryRotate(i, grid, 'CW');
      expect(result).not.toBeNull();
      // Identity test must fail; some kick must apply.
      expect(result!.kickIndex).toBeGreaterThan(0);
      expect(result!.piece.rotation).toBe(2);
      const cells = pieceCells(result!.piece.type, result!.piece.rotation, result!.piece.x, result!.piece.y);
      for (const [cx] of cells) {
        expect(cx).toBeGreaterThanOrEqual(0);
        expect(cx).toBeLessThanOrEqual(9);
      }
    });

    it('T against the left wall in state R rotates to state 0 via a kick', () => {
      // T state R cells: (1,0),(1,1),(2,1),(1,2).
      // Place at x=-1, y=20 → absolute cells (0,20),(0,21),(1,21),(0,22). In-bounds.
      // Rotate CCW to state 0: cells (1,0),(0,1),(1,1),(2,1).
      // Identity at (-1,20): (0,20),(-1,21),(0,21),(1,21) → x=-1 OOB.
      // Kick 1 for R→0 is (+1,-1) → dx=+1, dy=+1; new origin (0,21). Cells (1,21),(0,22),(1,22),(2,22).
      const grid = createEmptyGrid();
      const t: ActivePiece = {
        ...makeActive('T'),
        x: -1,
        y: 20,
        rotation: 1,
        lastMoveWasRotation: false,
        lastKickIndex: -1,
      };
      expect(collides(t, grid)).toBe(false);
      const r = tryRotate(t, grid, 'CCW');
      expect(r).not.toBeNull();
      // Some kick (non-identity) must have applied.
      expect(r!.kickIndex).toBeGreaterThan(0);
      expect(r!.piece.rotation).toBe(0);
      // lastMoveWasRotation is now true — required for T-spin detection.
      expect(r!.piece.lastMoveWasRotation).toBe(true);
    });
  });

  describe('Rotation type alignment', () => {
    it('all four rotations of T can be reached from 0 via CW', () => {
      const grid = createEmptyGrid();
      let p: ActivePiece = { ...makeActive('T'), y: 18 };
      const seen = new Set<Rotation>([p.rotation]);
      for (let i = 0; i < 3; i++) {
        const r = tryRotate(p, grid, 'CW');
        expect(r).not.toBeNull();
        p = r!.piece;
        seen.add(p.rotation);
      }
      expect(seen.size).toBe(4);
    });
  });
});
