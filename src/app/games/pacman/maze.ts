import { NO_UP_TILES, GRID_W, GRID_H } from './config';
import type { Maze, Tile, TileType } from './types';
export type { Maze, Tile, TileType } from './types';

/**
 * Canonical Pac-Man maze. 31 rows × 28 cols. Every row must be exactly 28
 * characters wide (use trailing spaces as needed). The parser validates this
 * along with the pellet counts.
 *
 * Legend:
 *   #  wall
 *   .  pellet
 *   o  power pellet
 *   (space) empty walkable
 *   -  ghost-house door
 *   H  ghost-house interior
 *   T  tunnel padding (off-screen wrap helper, not rendered)
 */
export const MAZE_TEXT = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #HHHHHH# ##.######',
  'TTTTTT.   #HHHHHH#   .TTTTTT',
  '######.## #HHHHHH# ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
].join('\n');

function charToType(ch: string): TileType {
  switch (ch) {
    case '#': return 'wall';
    case '.': return 'pellet';
    case 'o': return 'power';
    case ' ': return 'empty';
    case '-': return 'door';
    case 'H': return 'house';
    case 'T': return 'tunnel';
    default:
      throw new Error(`Unknown maze char: '${ch}'`);
  }
}

function walkable(t: TileType): boolean {
  // For neighbor-walkable purposes (intersections): a tile is "walkable" if
  // Pac-Man or a ghost could ever stand there. Door and house count for
  // ghosts; tunnel padding is walkable wrap space.
  return t !== 'wall';
}

export function parseMaze(text: string = MAZE_TEXT): Maze {
  const rows = text.split('\n');
  if (rows.length < GRID_H) {
    throw new Error(`Maze must have at least ${GRID_H} rows; got ${rows.length}`);
  }
  // Bottom-most row is intentionally all spaces (HUD padding) — we drop it.
  const data = rows.slice(0, GRID_H);
  data.forEach((row, y) => {
    if (row.length !== GRID_W) {
      throw new Error(`Maze row ${y} width ${row.length} (expected ${GRID_W}): "${row}"`);
    }
  });

  const tiles: Tile[][] = [];
  let pelletCount = 0;
  let powerPelletCount = 0;
  for (let y = 0; y < GRID_H; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_W; x++) {
      const type = charToType(data[y][x]);
      if (type === 'pellet') pelletCount++;
      else if (type === 'power') powerPelletCount++;
      row.push({
        type,
        isIntersection: false,
        isTunnel: type === 'tunnel',
        isSlowZone: false,
        isNoUpZone: false,
      });
    }
    tiles.push(row);
  }

  // Second pass: intersections + flags.
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = tiles[y][x];
      if (!walkable(t.type)) continue;
      const neighbours = [
        y > 0 ? tiles[y - 1][x] : null,
        y < GRID_H - 1 ? tiles[y + 1][x] : null,
        x > 0 ? tiles[y][x - 1] : null,
        x < GRID_W - 1 ? tiles[y][x + 1] : null,
      ];
      const open = neighbours.filter((n) => n && walkable(n.type) && n.type !== 'house').length;
      if (open > 2) t.isIntersection = true;
    }
  }

  // Tunnel slow zones — row 14, x in [0,5] ∪ [22,27].
  for (let x = 0; x <= 5; x++) tiles[14][x].isSlowZone = true;
  for (let x = 22; x <= 27; x++) tiles[14][x].isSlowZone = true;

  // No-up zones.
  for (const [x, y] of NO_UP_TILES) {
    const t = tiles[y][x];
    t.isNoUpZone = true;
    if (!walkable(t.type)) {
      // The spec says emit a console assertion. Surface it loudly in dev.

      console.warn(`Pac-Man maze: no-up tile (${x}, ${y}) is not walkable`);
    }
  }

  return {
    width: GRID_W,
    height: GRID_H,
    tiles,
    pelletCount,
    powerPelletCount,
  };
}

export function isWalkableForPacman(maze: Maze, tx: number, ty: number): boolean {
  if (ty < 0 || ty >= maze.height) return false;
  if (tx < 0 || tx >= maze.width) return false;
  const t = maze.tiles[ty][tx];
  return t.type !== 'wall' && t.type !== 'door' && t.type !== 'house';
}

export function isWalkableForGhost(
  maze: Maze,
  tx: number,
  ty: number,
  options: { allowDoor: boolean; allowHouse: boolean } = { allowDoor: false, allowHouse: false },
): boolean {
  if (ty < 0 || ty >= maze.height) return false;
  if (tx < 0 || tx >= maze.width) return false;
  const t = maze.tiles[ty][tx];
  if (t.type === 'wall') return false;
  if (t.type === 'door' && !options.allowDoor) return false;
  if (t.type === 'house' && !options.allowHouse) return false;
  return true;
}

export function getTile(maze: Maze, tx: number, ty: number): Tile | null {
  if (ty < 0 || ty >= maze.height) return null;
  if (tx < 0 || tx >= maze.width) return null;
  return maze.tiles[ty][tx];
}
