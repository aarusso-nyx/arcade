import { parseMaze, MAZE_TEXT, isWalkableForPacman, isWalkableForGhost } from './maze';
import { NO_UP_TILES, TOTAL_PELLETS, TOTAL_POWER_PELLETS } from './config';

describe('pacman maze', () => {
  const maze = parseMaze();

  it('has 28 cols × 31 rows', () => {
    expect(maze.width).toBe(28);
    expect(maze.height).toBe(31);
  });

  it('produces exactly 240 pellets and 4 power pellets', () => {
    expect(maze.pelletCount).toBe(TOTAL_PELLETS);
    expect(maze.powerPelletCount).toBe(TOTAL_POWER_PELLETS);
  });

  it('marks the four no-up zone tiles as walkable', () => {
    for (const [x, y] of NO_UP_TILES) {
      const t = maze.tiles[y][x];
      expect(t.type === 'wall').toBe(false);
      expect(t.isNoUpZone).toBeTrue();
    }
  });

  it('marks tunnel slow-zone tiles on row 14', () => {
    for (let x = 0; x <= 5; x++) expect(maze.tiles[14][x].isSlowZone).toBeTrue();
    for (let x = 22; x <= 27; x++) expect(maze.tiles[14][x].isSlowZone).toBeTrue();
    // Non-slow tiles should not be flagged.
    expect(maze.tiles[14][10].isSlowZone).toBeFalse();
  });

  it('classifies the four power-pellet positions as power', () => {
    expect(maze.tiles[3][1].type).toBe('power');
    expect(maze.tiles[3][26].type).toBe('power');
    expect(maze.tiles[23][1].type).toBe('power');
    expect(maze.tiles[23][26].type).toBe('power');
  });

  it('blocks Pac-Man from entering the ghost house door and interior', () => {
    expect(isWalkableForPacman(maze, 13, 12)).toBeFalse(); // door
    expect(isWalkableForPacman(maze, 13, 14)).toBeFalse(); // interior
  });

  it('lets Pac-Man walk the long horizontal row 5', () => {
    for (let x = 1; x <= 26; x++) expect(isWalkableForPacman(maze, x, 5)).toBeTrue();
  });

  it('allows ghosts through the door when permitted', () => {
    expect(isWalkableForGhost(maze, 13, 12, { allowDoor: true, allowHouse: true })).toBeTrue();
    expect(isWalkableForGhost(maze, 13, 12, { allowDoor: false, allowHouse: false })).toBeFalse();
  });

  it('flags some intersection tiles', () => {
    // Pick a few well-known intersections in the canonical maze.
    // Long horizontal at row 5, col 1: corner with up + down + right open.
    expect(maze.tiles[5][1].isIntersection).toBeTrue();
    // Middle of long row 5: T-intersection where the vertical bar at col 6 meets row 5.
    expect(maze.tiles[5][6].isIntersection).toBeTrue();
  });

  it('maze text has no trailing rows beyond the grid', () => {
    expect(MAZE_TEXT.split('\n').length).toBe(31);
  });
});
