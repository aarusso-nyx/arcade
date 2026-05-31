import { createEmptyGrid } from './board';
import { detectTSpin, scoreLock } from './scoring';
import { makeActive } from './state';
import type { ActivePiece } from './types';

describe('tetris/scoring', () => {
  describe('base scoring', () => {
    it('single at level 1 = 100', () => {
      const r = scoreLock({ level: 1, linesCleared: 1, tspin: 'none', b2bActive: false, combo: -1 });
      expect(r.pointsDelta).toBe(100);
    });

    it('double at level 1 = 300', () => {
      const r = scoreLock({ level: 1, linesCleared: 2, tspin: 'none', b2bActive: false, combo: -1 });
      expect(r.pointsDelta).toBe(300);
    });

    it('triple at level 1 = 500', () => {
      const r = scoreLock({ level: 1, linesCleared: 3, tspin: 'none', b2bActive: false, combo: -1 });
      expect(r.pointsDelta).toBe(500);
    });

    it('tetris at level 5 = 4000', () => {
      const r = scoreLock({ level: 5, linesCleared: 4, tspin: 'none', b2bActive: false, combo: -1 });
      expect(r.pointsDelta).toBe(4000);
    });

    it('back-to-back tetris at level 5 = 6000', () => {
      const r = scoreLock({ level: 5, linesCleared: 4, tspin: 'none', b2bActive: true, combo: -1 });
      expect(r.pointsDelta).toBe(6000);
      expect(r.newB2b).toBe(true);
    });

    it('t-spin double at level 3 base = 3600', () => {
      const r = scoreLock({ level: 3, linesCleared: 2, tspin: 'full', b2bActive: false, combo: -1 });
      expect(r.pointsDelta).toBe(3600);
      expect(r.newB2b).toBe(true);
    });

    it('b2b t-spin double at level 3 = 5400', () => {
      const r = scoreLock({ level: 3, linesCleared: 2, tspin: 'full', b2bActive: true, combo: -1 });
      expect(r.pointsDelta).toBe(5400);
    });

    it('mini t-spin no-line at level 1 = 100, b2b unchanged', () => {
      const r = scoreLock({ level: 1, linesCleared: 0, tspin: 'mini', b2bActive: true, combo: -1 });
      expect(r.pointsDelta).toBe(100);
      expect(r.newB2b).toBe(true); // preserved
    });

    it('t-spin no-line preserves b2b chain', () => {
      const r = scoreLock({ level: 2, linesCleared: 0, tspin: 'full', b2bActive: true, combo: 3 });
      expect(r.newB2b).toBe(true);
      expect(r.newCombo).toBe(-1); // combo resets because no lines cleared
    });
  });

  describe('combo', () => {
    it('first line clear starts combo at 0; no bonus', () => {
      const r = scoreLock({ level: 1, linesCleared: 1, tspin: 'none', b2bActive: false, combo: -1 });
      expect(r.newCombo).toBe(0);
      // pointsDelta = 100 base, no combo bonus when combo < 1
      expect(r.pointsDelta).toBe(100);
    });

    it('second consecutive clear adds 50 * 1 * level bonus', () => {
      const r = scoreLock({ level: 3, linesCleared: 1, tspin: 'none', b2bActive: false, combo: 0 });
      // single * level + 50 * 1 * 3 = 300 + 150 = 450
      expect(r.pointsDelta).toBe(450);
      expect(r.newCombo).toBe(1);
    });

    it('third consecutive clear adds 50 * 2 * level bonus', () => {
      const r = scoreLock({ level: 2, linesCleared: 1, tspin: 'none', b2bActive: false, combo: 1 });
      // 100 * 2 + 50 * 2 * 2 = 200 + 200 = 400
      expect(r.pointsDelta).toBe(400);
      expect(r.newCombo).toBe(2);
    });

    it('no-line lock resets combo to -1', () => {
      const r = scoreLock({ level: 1, linesCleared: 0, tspin: 'none', b2bActive: false, combo: 5 });
      expect(r.newCombo).toBe(-1);
    });
  });

  describe('b2b chain', () => {
    it('non-difficult clear breaks b2b chain', () => {
      const r = scoreLock({ level: 1, linesCleared: 1, tspin: 'none', b2bActive: true, combo: -1 });
      expect(r.newB2b).toBe(false);
    });

    it('first tetris does not get 1.5x (b2b not yet active)', () => {
      const r = scoreLock({ level: 1, linesCleared: 4, tspin: 'none', b2bActive: false, combo: -1 });
      expect(r.pointsDelta).toBe(800);
      expect(r.newB2b).toBe(true);
    });
  });

  describe('detectTSpin', () => {
    it('returns none for non-T pieces', () => {
      const grid = createEmptyGrid();
      const j: ActivePiece = { ...makeActive('J'), lastMoveWasRotation: true };
      expect(detectTSpin(j, grid)).toBe('none');
    });

    it('returns none if last move was not a rotation', () => {
      const grid = createEmptyGrid();
      const t: ActivePiece = { ...makeActive('T'), lastMoveWasRotation: false };
      // Even with 3 corners filled, no rotation → none.
      grid[19][3] = 'I';
      grid[19][5] = 'I';
      grid[21][3] = 'I';
      expect(detectTSpin(t, grid)).toBe('none');
    });

    it('returns none if fewer than 3 corners are filled', () => {
      const grid = createEmptyGrid();
      const t: ActivePiece = {
        ...makeActive('T'),
        x: 4,
        y: 20,
        rotation: 0,
        lastMoveWasRotation: true,
        lastKickIndex: 0,
      };
      grid[20][4] = 'I'; // a single corner
      expect(detectTSpin(t, grid)).toBe('none');
    });

    it('returns full when 3+ corners filled including both front corners (T pointing up)', () => {
      const grid = createEmptyGrid();
      const t: ActivePiece = {
        ...makeActive('T'),
        x: 4,
        y: 20,
        rotation: 0, // T points up; front corners are top-left, top-right
        lastMoveWasRotation: true,
        lastKickIndex: 0,
      };
      // corners are (4,20), (6,20), (4,22), (6,22). Fill 3 including top two.
      grid[20][4] = 'I';
      grid[20][6] = 'I';
      grid[22][4] = 'I';
      // But T's own cells overlap (4,20) and (6,20)? T state 0 cells (1,0)(0,1)(1,1)(2,1) at (4,20) → (5,20)(4,21)(5,21)(6,21). No overlap with corners.
      expect(detectTSpin(t, grid)).toBe('full');
    });

    it('returns mini when 3+ corners filled but only one front corner', () => {
      const grid = createEmptyGrid();
      const t: ActivePiece = {
        ...makeActive('T'),
        x: 4,
        y: 20,
        rotation: 0, // up; front = corners 0,1 (top)
        lastMoveWasRotation: true,
        lastKickIndex: 0,
      };
      // Fill 3 corners: one front + both back.
      grid[20][4] = 'I';      // top-left (front)
      grid[22][4] = 'I';      // bot-left (back)
      grid[22][6] = 'I';      // bot-right (back)
      expect(detectTSpin(t, grid)).toBe('mini');
    });

    it('returns full when kick index is 4 even if only one front corner is filled', () => {
      const grid = createEmptyGrid();
      const t: ActivePiece = {
        ...makeActive('T'),
        x: 4,
        y: 20,
        rotation: 0,
        lastMoveWasRotation: true,
        lastKickIndex: 4,
      };
      grid[20][4] = 'I';
      grid[22][4] = 'I';
      grid[22][6] = 'I';
      expect(detectTSpin(t, grid)).toBe('full');
    });
  });
});
