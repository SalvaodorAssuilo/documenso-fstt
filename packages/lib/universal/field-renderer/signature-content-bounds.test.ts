import { describe, expect, it } from 'vitest';

import { analyseSignatureImage, removeSignaturePaper } from './signature-content-bounds';

type Pixel = [number, number, number, number];

const TRANSPARENT: Pixel = [0, 0, 0, 0];
const WHITE: Pixel = [255, 255, 255, 255];
const INK: Pixel = [0, 0, 0, 255];

const PHOTO_PAPER: Pixel = [205, 198, 186, 255];
const BLUE_PEN: Pixel = [40, 45, 150, 255];

const createImage = (
  width: number,
  height: number,
  background: Pixel,
  ink: Array<[number, number]>,
  inkColor: Pixel = INK,
) => {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    data.set(background, i * 4);
  }

  for (const [x, y] of ink) {
    data.set(inkColor, (y * width + x) * 4);
  }

  return { data, width, height };
};

const createStroke = (x: number, y: number, width: number, height: number) => {
  const points: Array<[number, number]> = [];

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      points.push([x + dx, y + dy]);
    }
  }

  return points;
};

describe('analyseSignatureImage', () => {
  it('finds the strokes on a transparent canvas', () => {
    const image = createImage(10, 10, TRANSPARENT, [
      [3, 4],
      [6, 5],
    ]);

    expect(analyseSignatureImage(image)?.bounds).toEqual({ x: 3, y: 4, width: 4, height: 2 });
  });

  it('treats a white background as empty', () => {
    const image = createImage(10, 10, WHITE, [
      [2, 2],
      [4, 7],
    ]);

    expect(analyseSignatureImage(image)?.bounds).toEqual({ x: 2, y: 2, width: 3, height: 6 });
  });

  it('ignores nearly transparent pixels', () => {
    const image = createImage(10, 10, [0, 0, 0, 10], [[5, 5]]);

    expect(analyseSignatureImage(image)?.bounds).toEqual({ x: 5, y: 5, width: 1, height: 1 });
  });

  it('adds padding without leaving the image', () => {
    const image = createImage(10, 10, TRANSPARENT, [
      [1, 1],
      [8, 5],
    ]);

    expect(analyseSignatureImage(image, 3)?.bounds).toEqual({ x: 0, y: 0, width: 10, height: 9 });
  });

  it('treats the off-white paper of a photographed signature as empty', () => {
    const image = createImage(100, 60, PHOTO_PAPER, createStroke(40, 20, 30, 10), BLUE_PEN);

    expect(analyseSignatureImage(image)?.bounds).toEqual({ x: 40, y: 20, width: 30, height: 10 });
  });

  it('ignores specks of dust far from the signature', () => {
    const image = createImage(400, 200, PHOTO_PAPER, [...createStroke(100, 60, 200, 50), [2, 2], [397, 197]]);

    expect(analyseSignatureImage(image)?.bounds).toEqual({ x: 100, y: 60, width: 200, height: 50 });
  });

  it('returns null when there are no strokes', () => {
    expect(analyseSignatureImage(createImage(10, 10, TRANSPARENT, []))).toBeNull();
    expect(analyseSignatureImage(createImage(10, 10, WHITE, []))).toBeNull();
  });
});

describe('signature paper', () => {
  const PENCIL: Pixel = [150, 150, 150, 255];

  it('finds the paper of a photographed or scanned signature', () => {
    expect(
      analyseSignatureImage(createImage(100, 60, PHOTO_PAPER, createStroke(40, 20, 30, 10), BLUE_PEN))?.paper,
    ).not.toBeNull();
    expect(analyseSignatureImage(createImage(100, 60, WHITE, createStroke(40, 20, 30, 10)))?.paper).not.toBeNull();
  });

  it('finds no paper behind strokes on a transparent canvas', () => {
    expect(analyseSignatureImage(createImage(100, 60, TRANSPARENT, createStroke(40, 20, 30, 10)))?.paper).toBeNull();
  });

  it('leaves strokes too faint to tell apart safely as they are, on their paper', () => {
    const analysis = analyseSignatureImage(createImage(100, 60, PHOTO_PAPER, createStroke(40, 20, 30, 10), PENCIL));

    expect(analysis?.bounds).toEqual({ x: 0, y: 0, width: 100, height: 60 });
    expect(analysis?.paper).toBeNull();
  });

  it('finds light strokes on the bright side of a shadowed photo', () => {
    const width = 400;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // The paper goes from bright on the left to shadowed on the right, and
        // the stroke is a constant 90 darker than the paper under it.
        const paper = 225 - Math.round((x / width) * 100);
        const isStroke = y >= 50 && y < 53 && x >= 50 && x <= 350;
        const value = isStroke ? paper - 90 : paper;

        data.set([value, value, value, 255], (y * width + x) * 4);
      }
    }

    expect(analyseSignatureImage({ data, width, height })?.bounds).toEqual({ x: 50, y: 50, width: 301, height: 3 });
  });

  it('keeps the dot of an "i" next to the signature', () => {
    const image = createImage(400, 200, PHOTO_PAPER, [
      ...createStroke(100, 60, 200, 4),
      ...createStroke(100, 100, 200, 4),
      ...createStroke(330, 70, 3, 3),
    ]);

    expect(analyseSignatureImage(image)?.bounds).toEqual({ x: 100, y: 60, width: 233, height: 44 });
  });

  it('leaves light strokes on a transparent canvas as they are', () => {
    const image = createImage(100, 60, TRANSPARENT, createStroke(40, 20, 30, 10), [170, 170, 170, 255]);

    expect(analyseSignatureImage(image)).toEqual({ bounds: { x: 40, y: 20, width: 30, height: 10 }, paper: null });
  });

  it('makes the paper transparent and keeps the strokes in their colour', () => {
    const image = createImage(100, 60, PHOTO_PAPER, createStroke(40, 20, 30, 10), BLUE_PEN);
    const analysis = analyseSignatureImage(image, 2);

    if (!analysis?.paper) {
      throw new Error('Expected paper');
    }

    const strokes = removeSignaturePaper(image, analysis.bounds, analysis.paper);
    const pixelAt = (x: number, y: number) => {
      const index = (y * analysis.bounds.width + x) * 4;

      return Array.from(strokes.slice(index, index + 4));
    };

    expect(analysis.bounds).toEqual({ x: 38, y: 18, width: 34, height: 14 });
    expect(pixelAt(0, 0)[3]).toBe(0);
    expect(pixelAt(10, 5)).toEqual(BLUE_PEN);
  });

  it('leaves a filled drawing on a transparent canvas as it is', () => {
    // Two light filled shapes with dark text, and see-through space between them.
    const image = createImage(100, 60, TRANSPARENT, [], INK);
    const fill = (x: number, y: number, w: number, h: number, pixel: Pixel) => {
      for (const [px, py] of createStroke(x, y, w, h)) {
        image.data.set(pixel, (py * 100 + px) * 4);
      }
    };

    fill(10, 10, 35, 40, [200, 200, 200, 255]);
    fill(55, 10, 35, 40, [200, 200, 200, 255]);
    fill(20, 25, 15, 4, INK);

    expect(analyseSignatureImage(image)).toEqual({ bounds: { x: 10, y: 10, width: 80, height: 40 }, paper: null });
  });

  it('never finds paper when told the image cannot have any, as with a stamp', () => {
    const image = createImage(100, 60, PHOTO_PAPER, createStroke(40, 20, 30, 10), BLUE_PEN);

    expect(analyseSignatureImage(image, 0, false)).toEqual({
      bounds: { x: 0, y: 0, width: 100, height: 60 },
      paper: null,
    });
  });
});
