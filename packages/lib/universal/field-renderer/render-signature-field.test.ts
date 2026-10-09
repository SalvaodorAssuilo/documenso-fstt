// sort-imports-ignore
import '../../server-only/konva/skia-backend';

import type { Canvas as SkiaCanvas } from '@documenso/skia-canvas';
import { Canvas } from '@documenso/skia-canvas';
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';

import type { FieldToRender } from './field-renderer';
import { renderField } from './render-field';

const PAGE_WIDTH = 600;
const PAGE_HEIGHT = 800;

// 200 x 50 pt, a typical signature line.
const FIELD = { positionX: 10, positionY: 10, width: (200 / PAGE_WIDTH) * 100, height: (50 / PAGE_HEIGHT) * 100 };

/**
 * A drawn signature as the signature pad exports it: the whole 16:7 canvas,
 * with the strokes only covering a small area in the middle.
 */
const createPadSignature = async () => {
  const canvas = new Canvas(1120, 490);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'black';
  ctx.fillRect(410, 170, 300, 150);

  const png = await canvas.toBuffer('png');

  return `data:image/png;base64,${png.toString('base64')}`;
};

/**
 * Bounding box of the painted pixels on the rendered page.
 */
const getInkBounds = (canvas: SkiaCanvas) => {
  const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 128) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return { width: maxX - minX + 1, height: maxY - minY + 1 };
};

const renderSignature = (signatureImageAsBase64: string) => {
  const stage = new Konva.Stage({ width: PAGE_WIDTH, height: PAGE_HEIGHT });
  const layer = new Konva.Layer();

  renderField({
    scale: 1,
    field: {
      renderId: 'signature',
      type: 'SIGNATURE',
      page: 1,
      envelopeItemId: 'item',
      recipientId: 1,
      customText: '',
      inserted: true,
      fieldMeta: null,
      signature: { signatureImageAsBase64, typedSignature: null },
      ...FIELD,
    } as FieldToRender,
    translations: null,
    pageLayer: layer,
    pageWidth: PAGE_WIDTH,
    pageHeight: PAGE_HEIGHT,
    mode: 'export',
  });

  stage.add(layer);
  layer.draw();

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const bounds = getInkBounds(layer.canvas._canvas as unknown as SkiaCanvas);

  stage.destroy();

  return bounds;
};

describe('renderSignatureFieldElement', () => {
  beforeAll(async () => {
    // The renderer loads skia-canvas lazily; let that import settle.
    await import('@documenso/skia-canvas');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('scales the signature strokes to fill the field, ignoring the empty pad canvas', async () => {
    const ink = renderSignature(await createPadSignature());

    // The strokes are 2:1 and the field 4:1, so the strokes should fill the field height.
    expect(ink.height).toBeGreaterThanOrEqual(45);
    expect(ink.height).toBeLessThanOrEqual(50);
    expect(ink.width).toBeLessThanOrEqual(200);
  });
});
