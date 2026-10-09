export type SignatureContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SignaturePixels = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/**
 * Pixels more transparent than this are empty canvas.
 */
const MIN_INK_ALPHA = 16;

/**
 * Pixels lighter than this on every channel are paper, such as the white
 * background of an uploaded signature photo.
 */
const MAX_INK_CHANNEL = 240;

/**
 * Find the box around the signature strokes in an RGBA image, so the empty
 * canvas around them can be cropped away.
 *
 * Returns `null` when the image has no strokes.
 */
export const getSignatureContentBounds = (
  { data, width, height }: SignaturePixels,
  padding = 0,
): SignatureContentBounds | null => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;

      if (data[index + 3] < MIN_INK_ALPHA) {
        continue;
      }

      if (data[index] >= MAX_INK_CHANNEL && data[index + 1] >= MAX_INK_CHANNEL && data[index + 2] >= MAX_INK_CHANNEL) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) {
    return null;
  }

  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + 1 + padding);
  const bottom = Math.min(height, maxY + 1 + padding);

  return { x: left, y: top, width: right - left, height: bottom - top };
};
