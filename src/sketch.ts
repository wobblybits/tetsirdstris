/** @format */

import p5 from "p5";
import { PLAYER_1, PLAYER_2, SYSTEM } from "@rcade/plugin-input-classic";
import {
  COLS,
  ROWS,
  type Piece,
  createPiece,
  clonePiece,
  rotatePiece,
  pieceCells,
  collides,
  mergePiece,
  clearLines,
  emptyGrid,
} from "./tetris";
import { depthToSirds } from "./sirds";

/** Set to false to draw the game normally (no SIRDS) for debugging layout/scale. */
const USE_SIRDS = true;

const WIDTH = 336;
const HEIGHT = 262;

// Focus dots: spacing = max separation (techmind: half eye-sep for safe viewing)
const FOCUS_DOT_SPACING = 42;
const FOCUS_DOT_Y = 24;

// Classic Tetris piece colors (I,O,T,S,Z,J,L) - grid stores 1-7
const PIECE_COLORS: [number, number, number][] = [
  [0, 255, 255], // I: cyan
  [255, 255, 0], // O: yellow
  [180, 0, 255], // T: purple
  [0, 255, 0], // S: green
  [255, 0, 0], // Z: red
  [0, 0, 255], // J: blue
  [255, 165, 0], // L: orange
];
const FOCUS_DOT_R = 4;

// Layout: 10×14 cells, board centered; floor row at bottom
const CELL_W = 21;
const CELL_H = 21;
const BOARD_PIX_W = COLS * CELL_W;
const BOARD_PIX_H = ROWS * CELL_H;
const BOARD_X = Math.floor((WIDTH - BOARD_PIX_W) / 2);
const FLOOR_Y = HEIGHT - CELL_H;
const BOARD_Y = FLOOR_Y - BOARD_PIX_H;
const LEFT_PANEL_W = BOARD_X;
const RIGHT_PANEL_W = WIDTH - BOARD_X - BOARD_PIX_W;

// Side panel colors (NES-style navy with decorative tiles)
const PANEL_COLOR_A: [number, number, number] = [25, 25, 55];
const PANEL_COLOR_B: [number, number, number] = [50, 50, 95];

// Game tick: run logic at fixed rate (slower = more stable SIRDS, NES-like feel)
const GAME_TICK_MS = 1000 / 15; // 15 logic updates per second

// NES-style input (TetrisWiki: DAS ~16 frames, ARR ~6 frames at 60fps)
const DAS_MS = 267; // delayed auto shift: wait before first repeat
const ARR_MS = 100; // auto repeat rate: interval while holding
const SOFT_DROP_ARR_MS = 50; // soft drop repeats faster

// Scoring and level
const LINES_PER_LEVEL = 10;
const DROP_INTERVAL_MS = 800;
const LEVEL_SPEED_FACTOR = 0.9;

const sketch = (p: p5) => {
  let grid: number[][];
  let currentPiece: Piece | null;
  let nextPieceType: number;
  let level: number;
  let score: number;
  let lines: number;
  let lastDropTime: number;
  let lastTickTime: number;
  let tickCount: number;
  let gameOver: boolean;
  let gameStarted: boolean;
  let depthBuffer: Uint8Array;
  let sirdsOutput: ImageData;
  let canvasCtx: CanvasRenderingContext2D | null = null;
  let depthGraphics: p5.Graphics;
  // SIRDS params (2P controls)
  let sirdsInverted = false;
  let eyeSep = 82;
  let obsDist = 520;
  let prev2A = false;
  let prev2B = false;
  // NES-style DAS/ARR state
  let leftHeld = false;
  let rightHeld = false;
  let downHeld = false;
  let leftPressTime = 0;
  let rightPressTime = 0;
  let downPressTime = 0;
  let lastLeftMove = 0;
  let lastRightMove = 0;
  let lastDownMove = 0;
  let prevUp = false;
  let prevA = false;

  function spawnPiece(): boolean {
    const type = nextPieceType;
    nextPieceType = Math.floor(Math.random() * 7);
    const piece = createPiece(type);
    piece.x = 3;
    piece.y = 0;
    if (collides(grid, piece)) {
      gameOver = true;
      return false;
    }
    currentPiece = piece;
    return true;
  }

  function lockPiece(): void {
    if (!currentPiece) return;
    mergePiece(grid, currentPiece, currentPiece.type + 1); // 1-7 for colors
    const cleared = clearLines(grid);
    if (cleared > 0) {
      score += cleared * 100 * level;
      lines += cleared;
      level = 1 + Math.floor(lines / LINES_PER_LEVEL);
    }
    currentPiece = null;
    spawnPiece();
  }

  function moveLeft(): void {
    if (!currentPiece || gameOver) return;
    const next = clonePiece(currentPiece);
    next.x--;
    if (!collides(grid, next)) currentPiece.x--;
  }

  function moveRight(): void {
    if (!currentPiece || gameOver) return;
    const next = clonePiece(currentPiece);
    next.x++;
    if (!collides(grid, next)) currentPiece.x++;
  }

  function rotate(): void {
    if (!currentPiece || gameOver) return;
    const next = rotatePiece(currentPiece);
    if (!collides(grid, next)) currentPiece.rotation = next.rotation;
  }

  function softDrop(): void {
    if (!currentPiece || gameOver) return;
    const next = clonePiece(currentPiece);
    next.y++;
    if (collides(grid, next)) {
      lockPiece();
    } else {
      currentPiece.y++;
      score += 1;
    }
  }

  function hardDrop(): void {
    if (!currentPiece || gameOver) return;
    while (true) {
      const next = clonePiece(currentPiece!);
      next.y++;
      if (collides(grid, next)) break;
      currentPiece!.y++;
      score += 2;
    }
    lockPiece();
  }

  function drawCell(
    g: p5.Graphics | p5,
    col: number,
    row: number,
    value: number | [number, number, number],
    outline = false,
  ): void {
    const x = BOARD_X + col * CELL_W;
    const y = BOARD_Y + row * CELL_H;
    if (typeof value === "number") g.fill(value);
    else g.fill(value[0], value[1], value[2]);
    g.noStroke();
    g.rect(x, y, CELL_W - 1, CELL_H - 1);
    if (outline && typeof value !== "number") {
      const [r, gr, b] = value;
      g.noFill();
      g.stroke(Math.max(0, r - 80), Math.max(0, gr - 80), Math.max(0, b - 80));
      g.strokeWeight(1);
      g.rect(x, y, CELL_W - 1, CELL_H - 1);
      g.noStroke();
    }
  }

  function drawPieceCells(
    g: p5.Graphics | p5,
    piece: Piece,
    value: number,
  ): void {
    const cells = pieceCells(piece);
    for (const [row, col] of cells) {
      if (row >= 0) drawCell(g, col, row, value);
    }
  }

  /** Draw NES-style decorative tile pattern. Tiles match cell size. tileRowOffset continues pattern (e.g. for floor). */
  function drawPanelDecor(
    g: p5.Graphics | p5,
    x: number,
    y: number,
    w: number,
    h: number,
    tileRowOffset = 0,
  ): void {
    for (let py = 0; py < h; py += CELL_H) {
      for (let px = 0; px < w; px += CELL_W) {
        const tileCol = Math.floor(px / CELL_W);
        const tileRow = tileRowOffset + Math.floor(py / CELL_H);
        const checker = (tileCol + tileRow) % 2;
        const [r, gr, b] = checker ? PANEL_COLOR_A : PANEL_COLOR_B;
        g.fill(r, gr, b);
        g.noStroke();
        g.rect(
          x + px,
          y + py,
          Math.min(CELL_W, w - px),
          Math.min(CELL_H, h - py),
        );
      }
    }
  }

  /** Build depth map (0 = far, 255 = near) into depthBuffer. */
  function buildDepthMap(): void {
    const g = depthGraphics;
    const DEPTH_BG = Math.round(0.25 * 255);   // background (board well)
    const DEPTH_PIECE = Math.round(0.5 * 255); // pieces
    const DEPTH_PANEL = Math.round(0.75 * 255); // sidebars
    g.background(DEPTH_PANEL); // sidebars

    // Board well: background depth
    g.fill(DEPTH_BG);
    g.noStroke();
    g.rect(BOARD_X, BOARD_Y, BOARD_PIX_W, BOARD_PIX_H);

    // Board filled cells and current piece
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (grid[row][col]) drawCell(g, col, row, DEPTH_PIECE);
      }
    }
    if (currentPiece) drawPieceCells(g, currentPiece, DEPTH_PIECE);

    g.loadPixels();
    const pix = g.pixels;
    for (let i = 0; i < WIDTH * HEIGHT; i++) {
      const v = pix[i * 4];
      depthBuffer[i] = sirdsInverted ? 255 - v : v;
    }
  }

  p.setup = () => {
    p.pixelDensity(1); // match canvas to our 336×262 ImageData
    p.createCanvas(WIDTH, HEIGHT);
    p.noSmooth();
    const canvas = document.getElementById("sketch")?.querySelector("canvas");
    canvasCtx = canvas?.getContext("2d") ?? null;
    if (canvasCtx) canvasCtx.imageSmoothingEnabled = false;
    depthBuffer = new Uint8Array(WIDTH * HEIGHT);
    sirdsOutput = new ImageData(WIDTH, HEIGHT);
    depthGraphics = p.createGraphics(WIDTH, HEIGHT);
    depthGraphics.noSmooth();
    resetGame();
  };

  function resetGame(): void {
    grid = emptyGrid();
    nextPieceType = Math.floor(Math.random() * 7);
    level = 1;
    score = 0;
    lines = 0;
    lastDropTime = 0;
    lastTickTime = 0;
    tickCount = 0;
    gameOver = false;
    gameStarted = false;
    currentPiece = null;
    leftHeld = false;
    rightHeld = false;
    downHeld = false;
    prevUp = false;
    prevA = false;
  }

  /** Run once per game tick: input (DAS/ARR), gravity, then update display buffer if SIRDS. */
  function gameTick(): void {
    const now = p.millis();

    // Left: DAS then ARR
    if (PLAYER_1.DPAD.left) {
      if (!leftHeld) {
        leftHeld = true;
        leftPressTime = now;
        moveLeft();
        lastLeftMove = now;
      } else if (
        now - leftPressTime >= DAS_MS &&
        now - lastLeftMove >= ARR_MS
      ) {
        moveLeft();
        lastLeftMove = now;
      }
    } else {
      leftHeld = false;
    }

    // Right: DAS then ARR
    if (PLAYER_1.DPAD.right) {
      if (!rightHeld) {
        rightHeld = true;
        rightPressTime = now;
        moveRight();
        lastRightMove = now;
      } else if (
        now - rightPressTime >= DAS_MS &&
        now - lastRightMove >= ARR_MS
      ) {
        moveRight();
        lastRightMove = now;
      }
    } else {
      rightHeld = false;
    }

    // Down (soft drop): DAS then faster ARR
    if (PLAYER_1.DPAD.down) {
      if (!downHeld) {
        downHeld = true;
        downPressTime = now;
        softDrop();
        lastDownMove = now;
      } else if (
        now - downPressTime >= DAS_MS &&
        now - lastDownMove >= SOFT_DROP_ARR_MS
      ) {
        softDrop();
        lastDownMove = now;
      }
    } else {
      downHeld = false;
    }

    // Rotate and hard drop: edge-triggered only (no repeat while held)
    if (PLAYER_1.DPAD.up && !prevUp) rotate();
    prevUp = !!PLAYER_1.DPAD.up;
    if (PLAYER_1.A && !prevA) hardDrop();
    prevA = !!PLAYER_1.A;

    // Gravity
    const interval = DROP_INTERVAL_MS * Math.pow(LEVEL_SPEED_FACTOR, level - 1);
    if (now - lastDropTime >= interval) {
      lastDropTime = now;
      softDrop();
    }

    // Update SIRDS buffer only on tick (new seed each tick = fresh random pattern)
    if (USE_SIRDS) {
      buildDepthMap();
      depthToSirds(depthBuffer, WIDTH, HEIGHT, sirdsOutput, tickCount, eyeSep, obsDist);
      tintLockedPieces(sirdsOutput);
      tintPanels(sirdsOutput);
      tickCount++;
    }
  }

  /** Apply piece colors and outlines to locked cells in SIRDS output (preserves pattern for 3D). */
  function tintLockedPieces(img: ImageData): void {
    const data = img.data;
    for (let py = 0; py < HEIGHT; py++) {
      const row = Math.floor((py - BOARD_Y) / CELL_H);
      if (row < 0 || row >= ROWS) continue;
      for (let px = 0; px < WIDTH; px++) {
        const col = Math.floor((px - BOARD_X) / CELL_W);
        if (col < 0 || col >= COLS) continue;
        const cell = grid[row][col];
        if (!cell) continue;
        const [r, g, b] = PIECE_COLORS[cell - 1];
        const cellLeft = BOARD_X + col * CELL_W;
        const cellTop = BOARD_Y + row * CELL_H;
        const isBorder =
          px === cellLeft ||
          px === cellLeft + CELL_W - 1 ||
          py === cellTop ||
          py === cellTop + CELL_H - 1;
        const mult = isBorder ? 0.45 : 1;
        const i = (py * WIDTH + px) << 2;
        const gray = data[i];
        data[i] = (r / 255) * gray * mult;
        data[i + 1] = (g / 255) * gray * mult;
        data[i + 2] = (b / 255) * gray * mult;
      }
    }
  }

  /** Apply panel and floor colors in SIRDS output. Preserves random pattern. */
  function tintPanels(img: ImageData): void {
    const data = img.data;
    for (let py = 0; py < HEIGHT; py++) {
      for (let px = 0; px < WIDTH; px++) {
        let [r, g, b] = [0, 0, 0];
        if (py >= FLOOR_Y) {
          const tileCol = Math.floor(px / CELL_W);
          const tileRow = Math.floor(FLOOR_Y / CELL_H);
          [r, g, b] = (tileCol + tileRow) % 2 ? PANEL_COLOR_A : PANEL_COLOR_B;
        } else if (px < LEFT_PANEL_W) {
          const tileCol = Math.floor(px / CELL_W);
          const tileRow = Math.floor(py / CELL_H);
          [r, g, b] = (tileCol + tileRow) % 2 ? PANEL_COLOR_A : PANEL_COLOR_B;
        } else if (px >= BOARD_X + BOARD_PIX_W) {
          const relX = px - (BOARD_X + BOARD_PIX_W);
          const tileCol = Math.floor(relX / CELL_W);
          const tileRow = Math.floor(py / CELL_H);
          [r, g, b] = (tileCol + tileRow) % 2 ? PANEL_COLOR_A : PANEL_COLOR_B;
        } else {
          continue;
        }
        const i = (py * WIDTH + px) << 2;
        const gray = data[i];
        data[i] = (r / 255) * gray;
        data[i + 1] = (g / 255) * gray;
        data[i + 2] = (b / 255) * gray;
      }
    }
  }

  p.draw = () => {
    // 2P: SIRDS tuning (buttons = inversion, stick H = eye sep, stick V = obs dist)
    if (PLAYER_2.A && !prev2A) sirdsInverted = !sirdsInverted;
    prev2A = !!PLAYER_2.A;
    if (PLAYER_2.B && !prev2B) sirdsInverted = !sirdsInverted;
    prev2B = !!PLAYER_2.B;
    if (PLAYER_2.DPAD.left) eyeSep = Math.max(30, eyeSep - 2);
    if (PLAYER_2.DPAD.right) eyeSep = Math.min(150, eyeSep + 2);
    if (PLAYER_2.DPAD.up) obsDist = Math.min(800, obsDist + 10);
    if (PLAYER_2.DPAD.down) obsDist = Math.max(200, obsDist - 10);

    if (!gameStarted) {
      p.background(0);
      p.fill(255);
      p.textSize(18);
      p.textAlign(p.CENTER, p.CENTER);
      p.text("Press 1P START", WIDTH / 2, HEIGHT / 2 - 20);
      p.textSize(12);
      p.text(
        "D-PAD: move | UP: rotate | A: hard drop",
        WIDTH / 2,
        HEIGHT / 2 + 10,
      );
      if (SYSTEM.ONE_PLAYER) {
        gameStarted = true;
        spawnPiece();
        lastDropTime = p.millis();
        lastTickTime = 0; // force first tick next frame to build SIRDS
      }
      return;
    }

    if (gameOver) {
      p.background(0);
      p.fill(255);
      p.textSize(20);
      p.textAlign(p.CENTER, p.CENTER);
      p.text("GAME OVER", WIDTH / 2, HEIGHT / 2 - 20);
      p.textSize(14);
      p.text("Score: " + score, WIDTH / 2, HEIGHT / 2 + 10);
      p.text("Press 1P START to play again", WIDTH / 2, HEIGHT / 2 + 35);
      if (SYSTEM.ONE_PLAYER) {
        resetGame();
        gameStarted = true;
        spawnPiece();
        lastDropTime = p.millis();
        lastTickTime = 0;
      }
      return;
    }

    // Fixed game tick (15 Hz): input, gravity, SIRDS update
    const now = p.millis();
    if (now - lastTickTime >= GAME_TICK_MS) {
      gameTick();
      lastTickTime = now;
    }

    // Draw every frame (same buffer until next tick)
    if (USE_SIRDS) {
      if (canvasCtx) {
        canvasCtx.putImageData(sirdsOutput, 0, 0);
        // Red focus dots for eye training
        const cx = WIDTH / 2;
        canvasCtx.fillStyle = "#e53935";
        canvasCtx.beginPath();
        canvasCtx.arc(
          cx - FOCUS_DOT_SPACING / 2,
          FOCUS_DOT_Y,
          FOCUS_DOT_R,
          0,
          Math.PI * 2,
        );
        canvasCtx.arc(
          cx + FOCUS_DOT_SPACING / 2,
          FOCUS_DOT_Y,
          FOCUS_DOT_R,
          0,
          Math.PI * 2,
        );
        canvasCtx.fill();
      }
    } else {
      drawGameNormal(p);
    }
  };

  /** Draw board, piece, panel directly to the main canvas (no SIRDS). */
  function drawGameNormal(p: p5): void {
    p.background(0);
    // Side panels: NES-style decorative tiles (above floor)
    drawPanelDecor(p, 0, 0, LEFT_PANEL_W, FLOOR_Y);
    drawPanelDecor(p, BOARD_X + BOARD_PIX_W, 0, RIGHT_PANEL_W, FLOOR_Y);
    // Floor: lowest panel row continues across full width
    drawPanelDecor(p, 0, FLOOR_Y, WIDTH, CELL_H, Math.floor(FLOOR_Y / CELL_H));
    // Board background
    p.fill(28, 28, 44);
    p.noStroke();
    p.rect(BOARD_X, BOARD_Y, BOARD_PIX_W, BOARD_PIX_H);
    // Locked cells (piece colors with outlines)
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = grid[row][col];
        if (cell) drawCell(p, col, row, PIECE_COLORS[cell - 1], true);
      }
    }
    // Current piece (white)
    if (currentPiece) drawPieceCells(p, currentPiece, 255);
  }
};

new p5(sketch, document.getElementById("sketch")!);
