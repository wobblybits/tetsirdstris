/**
 * Single Image Random Dot Stereogram (SIRDS).
 * Parameters from techmind.org/stech.html (references Thimbleby et al. Computer 1994):
 * - obsDist = xdpi * 12 (12" viewing distance at 75 dpi)
 * - eyeSep = xdpi * 2.5 (2.5" between eyes)
 * Scaled for 336px width (vs reference 640px): factor 336/640 ≈ 0.525
 */
const DEFAULT_EYESEP = 82;
const DEFAULT_OBSDIST = 520;
const BKDEPTH = 0;

/** Compute separation in pixels. sep = (eyesep * featureZ) / (featureZ + obsdist) */
function separation(ht: number, eyeSep: number, obsDist: number): number {
  const d = ht - BKDEPTH;
  if (d <= 0) return 0;
  return (d * eyeSep) / (d + obsDist);
}

/** Seeded PRNG (mulberry32). Returns 0–1. Call with seed, then use next() for sequence. */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0; // 32-bit mul
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Find root of link chain (union-find style). */
function findRoot(link: Int32Array, i: number): number {
  while (link[i] !== i) i = link[i];
  return i;
}

/**
 * Generate SIRDS image from depth map.
 * depth: row-major, width*height, values 0 (far) or 255 (near).
 * out: RGBA ImageData (same width/height). Random dots for background, linked for foreground.
 * seed: each tick uses a new seed for fresh random pattern.
 * eyeSep, obsDist: optional overrides for 2P tuning.
 */
export function depthToSirds(
  depth: Uint8Array,
  width: number,
  height: number,
  out: ImageData,
  seed: number,
  eyeSep = DEFAULT_EYESEP,
  obsDist = DEFAULT_OBSDIST
): void {
  const data = out.data;
  const link = new Int32Array(width);
  const random = createSeededRandom(seed);

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;

    // Reset link buffer: each pixel links to itself
    for (let x = 0; x < width; x++) link[x] = x;

    // Build links: for each x, depth gives separation; link right to left
    for (let x = 0; x < width; x++) {
      const ht = depth[rowOff + x];
      const sep = separation(ht, eyeSep, obsDist);
      if (sep < 2) continue;
      const half = sep * 0.5;
      const leftX = Math.floor(x - half);
      const rightX = Math.floor(x + half);
      if (leftX >= 0 && rightX < width && leftX !== rightX) {
        const rootLeft = findRoot(link, leftX);
        link[rightX] = rootLeft;
      }
    }

    // Assign colors left to right (seeded random for roots = black/white noise)
    for (let x = 0; x < width; x++) {
      const i = (rowOff + x) << 2;
      if (link[x] === x) {
        const v = Math.floor(random() * 256);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      } else {
        const src = (rowOff + link[x]) << 2;
        data[i] = data[src];
        data[i + 1] = data[src + 1];
        data[i + 2] = data[src + 2];
        data[i + 3] = 255;
      }
    }
  }
}
