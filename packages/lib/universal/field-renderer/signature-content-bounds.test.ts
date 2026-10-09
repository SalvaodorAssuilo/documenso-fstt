import { describe, expect, it } from 'vitest';

import { getSignatureContentBounds } from './signature-content-bounds';

type Pixel = [number, number, number, number];

const TRANSPARENT: Pixel = [0, 0, 0, 0];
const WHITE: Pixel = [255, 255, 255, 255];
const INK: Pixel = [0, 0, 0, 255];

const createImage = (width: number, height: number, background: Pixel, ink: Array<[number, number]>) => {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    data.set(background, i * 4);
  }

  for (const [x, y] of ink) {
    data.set(INK, (y * width + x) * 4);
  }

  return { data, width, height };
};

describe('getSignatureContentBounds', () => {
  it('finds the strokes on a transparent canvas', () => {
    const image = createImage(10, 10, TRANSPARENT, [
      [3, 4],
      [6, 5],
    ]);

    expect(getSignatureContentBounds(image)).toEqual({ x: 3, y: 4, width: 4, height: 2 });
  });

  it('treats a white background as empty', () => {
    const image = createImage(10, 10, WHITE, [
      [2, 2],
      [4, 7],
    ]);

    expect(getSignatureContentBounds(image)).toEqual({ x: 2, y: 2, width: 3, height: 6 });
  });

  it('ignores nearly transparent pixels', () => {
    const image = createImage(10, 10, [0, 0, 0, 10], [[5, 5]]);

    expect(getSignatureContentBounds(image)).toEqual({ x: 5, y: 5, width: 1, height: 1 });
  });

  it('adds padding without leaving the image', () => {
    const image = createImage(10, 10, TRANSPARENT, [
      [1, 1],
      [8, 5],
    ]);

    expect(getSignatureContentBounds(image, 3)).toEqual({ x: 0, y: 0, width: 10, height: 9 });
  });

  it('returns null when there are no strokes', () => {
    expect(getSignatureContentBounds(createImage(10, 10, TRANSPARENT, []))).toBeNull();
    expect(getSignatureContentBounds(createImage(10, 10, WHITE, []))).toBeNull();
  });
});
