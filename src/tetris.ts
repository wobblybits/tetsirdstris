/**
 * Minimalist Tetris: 10×20 grid, 7 tetrominoes, level, score, next piece.
 * NRS (Nintendo Rotation System) with correct pivots per piece type.
 *
 * @format
 */

export const COLS = 10;
export const ROWS = 14;

// NRS tile offsets from meta_nestris. Each (col, row) is relative to the pivot.
// Order: T(0-3), J(4-7), Z(8-9), O(10), S(11-12), L(13-16), I(17-18)
const NRS_OFFSETS: [number, number][][] = [
  [ [-1, 0], [0, 0], [1, 0], [0, -1] ],   // TUp
  [ [0, -1], [0, 0], [1, 0], [0, 1] ],    // TRight
  [ [-1, 0], [0, 0], [1, 0], [0, 1] ],    // TDown
  [ [0, -1], [-1, 0], [0, 0], [0, 1] ],   // TLeft
  [ [0, -1], [0, 0], [-1, 1], [0, 1] ],   // JUp
  [ [-1, -1], [-1, 0], [0, 0], [1, 0] ],  // JRight
  [ [0, -1], [1, -1], [0, 0], [0, 1] ],   // JDown
  [ [-1, 0], [0, 0], [1, 0], [1, 1] ],    // JLeft
  [ [-1, 0], [0, 0], [0, 1], [1, 1] ],    // ZHorizontal
  [ [1, -1], [0, 0], [1, 0], [0, 1] ],    // ZVertical
  [ [-1, 0], [0, 0], [-1, 1], [0, 1] ],   // O
  [ [0, 0], [1, 0], [-1, 1], [0, 1] ],    // SHorizontal
  [ [0, -1], [0, 0], [1, 0], [1, 1] ],    // SVertical
  [ [0, -1], [0, 0], [0, 1], [1, 1] ],    // LUp
  [ [-1, -1], [0, -1], [0, 0], [0, 1] ],  // LRight
  [ [0, -1], [-1, 0], [0, 0], [1, 0] ],   // LDown
  [ [-1, 0], [0, 0], [1, 0], [-1, 1] ],   // LLeft
  [ [0, -2], [0, -1], [0, 0], [0, 1] ],   // IVertical
  [ [-2, 0], [-1, 0], [0, 0], [1, 0] ],   // IHorizontal
];

// type 0=I, 1=O, 2=T, 3=S, 4=Z, 5=J, 6=L -> NRS index for (type, rotation)
function nrsIndex(type: number, rotation: number): number {
  switch (type) {
    case 0: return rotation === 0 ? 17 : 18;  // I: IVertical, IHorizontal
    case 1: return 10;                       // O
    case 2: return rotation;                 // T: 0..3
    case 3: return rotation === 0 ? 11 : 12; // S
    case 4: return rotation === 0 ? 8 : 9;   // Z
    case 5: return 4 + rotation;             // J: 4..7
    case 6: return 13 + rotation;            // L: 13..16
    default: return 0;
  }
}

// Spawn pivot (x, y) per piece type so top cell is at row 0
const SPAWN_PIVOT: [number, number][] = [
  [4, 2],  // I vertical
  [4, 0],  // O
  [4, 1],  // T
  [4, 0],  // S
  [4, 0],  // Z
  [4, 1],  // J
  [4, 1],  // L
];

export type Piece = {
  type: number; // 0..6
  rotation: number;
  x: number;  // pivot col
  y: number;  // pivot row
};

export function getShapeCells(
  type: number,
  rotation: number,
): [number, number][] {
  const offsets = NRS_OFFSETS[nrsIndex(type, rotation)];
  return offsets.map(([dc, dr]) => [dr, dc]); // (col, row) -> (row, col)
}

export function createPiece(type: number): Piece {
  const [x, y] = SPAWN_PIVOT[type];
  return { type, rotation: 0, x, y };
}

export function clonePiece(p: Piece): Piece {
  return { type: p.type, rotation: p.rotation, x: p.x, y: p.y };
}

/** NRS (Nintendo Rotation System): O has no rotation, I has 2, others have 4. */
export function rotatePiece(p: Piece): Piece {
  if (p.type === 1) return { ...p }; // O: no rotation
  if (p.type === 0) return { ...p, rotation: (p.rotation + 1) % 2 }; // I: 2 states
  return { ...p, rotation: (p.rotation + 1) % 4 }; // J, L, T, S, Z: 4 states
}

export function pieceCells(p: Piece): [number, number][] {
  const cells = getShapeCells(p.type, p.rotation);
  return cells.map(([r, c]) => [p.y + r, p.x + c]);
}

export function collides(grid: number[][], p: Piece): boolean {
  for (const [row, col] of pieceCells(p)) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
    if (grid[row][col]) return true;
  }
  return false;
}

export function mergePiece(grid: number[][], p: Piece, value: number): void {
  for (const [row, col] of pieceCells(p)) {
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      grid[row][col] = value;
    }
  }
}

export function clearLines(grid: number[][]): number {
  let cleared = 0;
  for (let row = ROWS - 1; row >= 0; row--) {
    if (grid[row].every((c) => c !== 0)) {
      grid.splice(row, 1);
      grid.unshift(Array(COLS).fill(0));
      cleared++;
      row++;
    }
  }
  return cleared;
}

export function emptyGrid(): number[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}
