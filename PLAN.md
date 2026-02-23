# Plan: Minimalist Tetris with Autostereogram (SIRDS) Visualization

## Reference: Cornell SIRDS Method

From [Cornell ECE5760 SIRDS](https://people.ece.cornell.edu/land/courses/ece5760/FinalProjects/f2007/awh24_mdj23/awh24_mdj23/index.html):

- **Single Image Random Dot Stereogram (SIRDS)** encodes a depth map as a 2D image that, when viewed with “divergent” or “parallel” eyes, appears 3D.
- **Depth map**: Grayscale where **black = far** (background), **white = near** (foreground). Our depth map = Tetris game + UI.
- **Core idea**: For a given depth at pixel (x,y), the two eyes would see the same “virtual” point at different screen x-positions. The algorithm **links** two screen pixels (left and right of the virtual point) so they get the **same color**; the brain then fuses them and sees that depth.
- **Separation formula** (screen pixels between the two linked points):
  ```text
  separation = (ht - bkdepth) * eyesep / (ht - bkdepth + obsdist)
  ```
  - `ht` = depth value at current pixel (0 = far, 255 = near)
  - `bkdepth` = depth value that corresponds to “screen surface” (we can use 0)
  - `eyesep` = eye separation in pixels (~60–70 typical)
  - `obsdist` = observer distance in pixels (~200–400)
- **Per-row algorithm**:
  1. **Link buffer**: `link[i] = i` for each column `i`.
  2. For each (x, y), get depth `ht`, compute `separation`.  
     Left pixel: `left_x = x - separation/2`, right pixel: `right_x = x + separation/2` (clamp to row bounds).  
     Set `link[right_x]` to the **root** of `link[left_x]` (union-find or follow chain).
  3. **Color assignment** (left to right):  
     If `link[x] === x` → assign **random** color.  
     Else → assign same color as the pixel at `link[x]` (already computed).

We implement this in software (no FPGA): one pass per row, using the depth map we build from the Tetris game.

---

## Game Spec: Minimalist Tetris

- **Play area**: Standard **10 columns × 20 visible rows** (common choice; optionally 10×18 for aspect). One cell = one “block” unit.
- **Blocks**: The usual **7 tetrominoes** (I, O, T, S, Z, J, L), same shapes and rotations as standard Tetris.
- **Side panel** (one side of the play area):
  - **Level** (number).
  - **Next** (preview of next tetromino).
  - **Score** (number).
- **Mechanics**: Move left/right, rotate, soft drop, hard drop (and optionally instant lock). Line clear, level-up, scoring (e.g. simple: lines × level). No need for hold, ghost piece, or fancy effects in the minimal version.
- **Display**: Everything (board, current piece, next piece, level, score) is drawn into a **depth map**, then the **autostereogram** is generated from that depth map and shown on screen.

---

## Depth Map Design

- **Fully distant (far)**: Empty background (play area background, panel background, any unused area).  
  → Depth = **0** (black).
- **Fully near**:  
  - Locked blocks in the matrix.  
  - Current falling piece.  
  - Next block preview.  
  - Level number and score (text).  
  → Depth = **255** (or a single “near” value, e.g. 255).
- **Optional later**: Slight depth differences (e.g. current piece 255, locked 240, panel 230) for extra 3D effect. For a minimal version, **binary depth (0 and 255)** is enough.

So: we build a 2D array `depth[y][x]` (or image) the same size as our **stereogram output** (e.g. 336×262 for RCade). Every pixel that is “game or UI” = 255, everything else = 0.

---

## Layout on RCade (336×262)

- **Play area**: 10×20 cells. If we use e.g. 12×12 px per cell → 120×240; or scale to fit. Leave a margin so total game + panel fits in 336×262.
- **Panel**: To the right (or left) of the board: level, next block, score. All drawn as “near” in the depth map.
- **Mapping**: We can either:
  - Draw the game at a **logical resolution** (e.g. 120×240 play area + panel), then **scale** that to a **depth map** at canvas size (336×262), then run SIRDS at 336×262; or
  - Build the depth map at a **lower resolution** (e.g. 168×131) and **scale up** the final stereogram to 336×262 for performance (fewer pixels to link and color).

---

## Rendering Pipeline

1. **Game state**  
   Board (10×20), current piece (type, rotation, x, y), next piece, level, score.

2. **Depth map**  
   - Allocate a buffer (e.g. `Uint8Array` or 2D array) of size `width × height` (stereogram size, or half for perf).  
   - Clear to 0 (far).  
   - For each cell of the board that contains a block, draw a rectangle in the depth buffer at 255.  
   - Draw current piece at 255.  
   - Draw “next” block preview at 255.  
   - Draw level and score text at 255 (rasterize into the depth buffer, or draw to a small canvas and sample).

3. **SIRDS from depth map**  
   - For each row `y`:  
     - Build link buffer from depth row (separation formula + union-find or chain-follow).  
     - Fill output row left-to-right: random color if root self, else copy from linked pixel.  
   - Output is a **random-dot image** (e.g. RGB or grayscale). We can use grayscale (R=G=B) for a classic look.

4. **Display**  
   - Draw the SIRDS image to the p5 canvas (or directly to canvas).  
   - Option: only regenerate the stereogram when **game state changes** (piece moved, line clear, etc.) to save CPU; or throttle to 15–30 fps for SIRDS while game logic runs at 60 fps.

---

## Implementation Order

1. **Tetris core (no stereogram)**  
   - Grid, 7 tetrominoes, rotation, collision, line clear, level, score, next piece.  
   - Draw normally (e.g. simple rectangles) to verify layout and panel (level, next, score).

2. **Depth map from game state**  
   - Same layout; instead of colors, write 0 or 255 into a `width×height` buffer.  
   - Include board, current piece, next piece, level number, score.  
   - Optionally render to a small offscreen canvas (grayscale) and read back, or draw directly into an array.

3. **SIRDS generator**  
   - Input: depth map (per-row or full 2D).  
   - Parameters: `eyesep`, `obsdist`, `bkdepth` (e.g. 0).  
   - Output: image (e.g. `ImageData` or p5 image).  
   - Test with a simple depth map (e.g. a rectangle or the word “TETRIS”) to confirm 3D pop-out.

4. **Integration**  
   - Each frame (or every N frames): game state → depth map → SIRDS → canvas.  
   - Tune `eyesep` and `obsdist` so the effect is comfortable on the cabinet screen.  
   - If needed, run SIRDS at half resolution and scale up.

5. **Polish**  
   - Input (arcade controls: D-pad, buttons) for move, rotate, drop.  
   - Start screen (e.g. “Press 1P START”) and game over.  
   - Optional: subtle depth gradation (e.g. panel slightly behind blocks).

---

## Technical Notes

- **p5.js**: Use `p5.Image` or `p5.Graphics` for offscreen depth map if convenient; then read pixels and run SIRDS in a typed array, write result to `p.image()` or `p.set()/p.updatePixels()`.
- **Random dots**: Use a seeded or simple PRNG per row so the pattern is reproducible for the same depth row (optional); or `Math.random()` for each “new” pixel.
- **Performance**: At 336×262, one SIRDS frame is ~88k pixels; doable in JS. If slow, reduce to 168×131 and scale, or update stereogram every 2nd frame.
- **RCade**: 336×262, input via `@rcade/plugin-input-classic`. No network, no persistence; all assets bundled.

---

## Summary

| Item              | Choice                                                |
|-------------------|--------------------------------------------------------|
| Game              | Minimalist Tetris: 10×20, 7 tetrominoes, level, next, score |
| Depth             | Background = 0 (far), blocks + text = 255 (near)       |
| Stereogram        | SIRDS per row: link buffer + left-to-right color copy  |
| Layout            | Play area + side panel (level, next, score)            |
| Display           | Depth map → SIRDS → canvas (336×262)                   |

This gives a minimal Tetris that is **viewable as a 3D autostereogram**: background recedes, blocks and UI float in front, using the same physical principle as the [Cornell SIRDS project](https://people.ece.cornell.edu/land/courses/ece5760/FinalProjects/f2007/awh24_mdj23/awh24_mdj23/index.html).
