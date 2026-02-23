/**
 * Minimalist Tetris: 10×20 grid, 7 tetrominoes, level, score, next piece.
 *
 * @format
 */

export const COLS = 10;
export const ROWS = 14;

// Tetromino shapes in 4×4 local grid (row, col). Rotation 0 = spawn orientation.
// I, O, T, S, Z, J, L
export const SHAPES: [number, number][][] = [
  [
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
  ], // I
  [
    [0, 1],
    [0, 2],
    [1, 1],
    [1, 2],
  ], // O
  [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, 2],
  ], // T
  [
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
  ], // S
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ], // Z
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [1, 2],
  ], // J
  [
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
  ], // L
];

export type Piece = {
  type: number; // 0..6
  rotation: number;
  x: number;
  y: number;
};

export function getShapeCells(
  type: number,
  rotation: number,
): [number, number][] {
  const shape = SHAPES[type];
  const out: [number, number][] = [];
  for (const [r, c] of shape) {
    // 90° CW: (r,c) -> (c, 3-r)
    let rr = r,
      cc = c;
    for (let i = 0; i < rotation; i++) {
      [rr, cc] = [cc, 3 - rr];
    }
    out.push([rr, cc]);
  }
  return out;
}

export function createPiece(type: number): Piece {
  return { type, rotation: 0, x: 3, y: 0 };
}

export function clonePiece(p: Piece): Piece {
  return { type: p.type, rotation: p.rotation, x: p.x, y: p.y };
}

export function rotatePiece(p: Piece): Piece {
  return { ...p, rotation: (p.rotation + 1) % 4 };
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
