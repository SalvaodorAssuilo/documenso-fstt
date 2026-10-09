import Konva from 'konva';

import { DEFAULT_SIGNATURE_TEXT_FONT_SIZE, getSignatureFontFamily } from '../../constants/pdf';
import { AppError } from '../../errors/app-error';
import type { TSignatureFieldMeta } from '../../types/field-meta';
import { resolveFieldOverflowMode } from '../../types/field-meta';
import { calculateOverflowLayout } from './calculate-overflow-layout';
import { createFieldHoverInteraction, upsertFieldGroup, upsertFieldRect } from './field-generic-items';
import type { FieldToRender, RenderFieldElementOptions } from './field-renderer';
import { calculateFieldPosition } from './field-renderer';
import type { SignatureContentBounds } from './signature-content-bounds';
import { getSignatureContentBounds } from './signature-content-bounds';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SkiaImage: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SkiaImageData: any;

void (async () => {
  if (typeof window === 'undefined') {
    const mod = await import('@documenso/skia-canvas');
    SkiaImage = mod.Image;
    SkiaImageData = mod.ImageData;
  }
})();

/**
 * Pixels kept around the signature strokes when cropping, so anti-aliased
 * edges and pen tapers are not clipped.
 */
const SIGNATURE_CROP_PADDING = 4;

const readImagePixels = (img: HTMLImageElement): ImageData | null => {
  if (typeof window !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      return null;
    }

    ctx.drawImage(img, 0, 0);

    return ctx.getImageData(0, 0, img.width, img.height);
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return new SkiaImageData(img) as ImageData;
};

/**
 * The part of the signature image to render.
 *
 * Signature pads export their whole canvas, so the strokes can cover a small
 * part of a mostly empty image. Cropping to the strokes lets them fill the
 * field. Falls back to the whole image when its pixels cannot be read.
 */
const getSignatureCrop = (img: HTMLImageElement): SignatureContentBounds => {
  const wholeImage = { x: 0, y: 0, width: img.width, height: img.height };

  try {
    const pixels = readImagePixels(img);

    return (pixels && getSignatureContentBounds(pixels, SIGNATURE_CROP_PADDING)) ?? wholeImage;
  } catch {
    return wholeImage;
  }
};

const getImageDimensions = (crop: SignatureContentBounds, fieldWidth: number, fieldHeight: number) => {
  let imageWidth = crop.width;
  let imageHeight = crop.height;

  const scalingFactor = Math.min(fieldWidth / imageWidth, fieldHeight / imageHeight);

  imageWidth = imageWidth * scalingFactor;
  imageHeight = imageHeight * scalingFactor;

  const imageX = (fieldWidth - imageWidth) / 2;
  const imageY = (fieldHeight - imageHeight) / 2;

  return {
    width: imageWidth,
    height: imageHeight,
    x: imageX,
    y: imageY,
  };
};

type FieldSignature =
  | {
      node: Konva.Text;
      isImageSignature: false;
      isLabel: boolean;
    }
  | {
      node: Konva.Image;
      isImageSignature: true;
      isLabel: boolean;
    };

/**
 * The pixel ratio used when caching the signature image as an offscreen bitmap.
 *
 * Konva's default redraw composites the source image with low-quality scaling
 * which makes signatures look blurry, especially when the source PNG is much
 * larger than the field. Caching at a high pixel ratio rasterises the shape
 * once into a sharp bitmap that is then reused on every redraw.
 *
 * Multiplied by `devicePixelRatio` to keep the cache crisp on retina displays.
 */
const SIGNATURE_IMAGE_CACHE_PIXEL_RATIO = 2;

/**
 * Build a Konva.Image for a base64 signature, sized to fit within the given
 * field dimensions. Works in both browser and Node.js (via skia-canvas).
 */
const createSignatureImage = (signatureImageAsBase64: string, fieldWidth: number, fieldHeight: number): Konva.Image => {
  if (typeof window !== 'undefined') {
    const img = new Image();

    const image = new Konva.Image({
      image: img,
      x: 0,
      y: 0,
      width: fieldWidth,
      height: fieldHeight,
      listening: false,
    });

    img.onload = () => {
      const crop = getSignatureCrop(img);

      image.setAttrs({
        image: img,
        crop,
        ...getImageDimensions(crop, fieldWidth, fieldHeight),
      });

      // Cache the image as a high-resolution bitmap so it stays sharp on
      // redraws and zoom changes instead of being re-scaled from the source PNG
      // every time.
      image.cache({
        pixelRatio: SIGNATURE_IMAGE_CACHE_PIXEL_RATIO * (window.devicePixelRatio || 1),
      });
    };

    img.src = signatureImageAsBase64;

    return image;
  }

  // Node.js with skia-canvas
  if (!SkiaImage) {
    throw new Error('Skia image not found');
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const img = new SkiaImage(signatureImageAsBase64) as unknown as HTMLImageElement;
  const crop = getSignatureCrop(img);

  return new Konva.Image({
    image: img,
    crop,
    ...getImageDimensions(crop, fieldWidth, fieldHeight),
    listening: false,
  });
};

const createFieldSignature = (field: FieldToRender, options: RenderFieldElementOptions): FieldSignature => {
  const { pageWidth, pageHeight, mode = 'edit', translations } = options;

  const { fieldX, fieldY, fieldWidth, fieldHeight } = calculateFieldPosition(field, pageWidth, pageHeight);
  const fontSize = field.fieldMeta?.fontSize || DEFAULT_SIGNATURE_TEXT_FONT_SIZE;

  const fieldText = new Konva.Text({
    id: `${field.renderId}-text`,
    name: 'field-text',
    listening: false,
  });

  const fieldTypeName = translations?.[field.type] || field.type;

  // Calculate text positioning based on alignment
  const textX = 0;
  const textY = 0;

  let textToRender: string = fieldTypeName;

  const signature = field.signature;

  // Handle edit mode.
  if (mode === 'edit') {
    textToRender = fieldTypeName;

    // If the field has already been signed and we have the signature data
    // available, render it. Otherwise leave the field type label as a placeholder.
    if (field.inserted && signature?.typedSignature) {
      textToRender = signature.typedSignature;
    }

    if (field.inserted && signature?.signatureImageAsBase64) {
      return {
        node: createSignatureImage(signature.signatureImageAsBase64, fieldWidth, fieldHeight),
        isImageSignature: true,
        isLabel: false,
      };
    }
  }

  // Handle sign mode.
  if (mode === 'sign' || mode === 'export') {
    textToRender = fieldTypeName;

    if (field.inserted && !signature) {
      throw new AppError('MISSING_SIGNATURE');
    }

    if (signature?.typedSignature) {
      textToRender = signature.typedSignature;
    }

    if (signature?.signatureImageAsBase64) {
      return {
        node: createSignatureImage(signature.signatureImageAsBase64, fieldWidth, fieldHeight),
        isImageSignature: true,
        isLabel: false,
      };
    }
  }

  const fieldMeta = field.fieldMeta as TSignatureFieldMeta | undefined;

  // Whether we're rendering the field type name (like "Signature") vs actual signed content.
  // Overflow should not apply to the label.
  const isLabel = !signature?.typedSignature;

  const overflowLayout = calculateOverflowLayout({
    overflowMode: resolveFieldOverflowMode(fieldMeta),
    isLabel,
    textToRender,
    fontSize,
    fontFamily: getSignatureFontFamily(textToRender),
    lineHeight: 1,
    letterSpacing: 0,
    textAlign: 'center',
    verticalAlign: 'middle',
    baseX: textX,
    baseY: textY,
    baseWidth: fieldWidth,
    baseHeight: fieldHeight,
    groupX: fieldX,
    groupY: fieldY,
    pageWidth,
    pageHeight,
  });

  fieldText.setAttrs({
    x: overflowLayout.x,
    y: overflowLayout.y,
    verticalAlign: overflowLayout.verticalAlign,
    wrap: overflowLayout.wrap,
    text: textToRender,
    fontSize,
    fontFamily: getSignatureFontFamily(textToRender),
    align: overflowLayout.textAlign,
    width: overflowLayout.width,
    height: overflowLayout.height,
  } satisfies Partial<Konva.TextConfig>);

  return { node: fieldText, isImageSignature: false, isLabel };
};

export const renderSignatureFieldElement = (field: FieldToRender, options: RenderFieldElementOptions) => {
  const { mode = 'edit', pageLayer, pageWidth, pageHeight, color } = options;

  const isFirstRender = !pageLayer.findOne(`#${field.renderId}`);

  const fieldGroup = upsertFieldGroup(field, options);

  // Clear previous children and listeners to re-render fresh.
  fieldGroup.removeChildren();
  fieldGroup.off('transform');

  // Assign elements to group and any listeners that should only be run on initialization.
  if (isFirstRender) {
    pageLayer.add(fieldGroup);
  }

  // Render the field background and text.
  const fieldRect = upsertFieldRect(field, options);
  const { node: fieldSignature, isImageSignature, isLabel } = createFieldSignature(field, options);

  fieldGroup.add(fieldRect);
  fieldGroup.add(fieldSignature);

  fieldGroup.on('transform', () => {
    const groupScaleX = fieldGroup.scaleX();
    const groupScaleY = fieldGroup.scaleY();

    // Adjust text scale so it doesn't change while group is resized.
    fieldSignature.scaleX(1 / groupScaleX);
    fieldSignature.scaleY(1 / groupScaleY);

    const rectWidth = fieldRect.width() * groupScaleX;
    const rectHeight = fieldRect.height() * groupScaleY;

    // During active transform, use crop dimensions (field bounds only).
    if (!isImageSignature) {
      fieldSignature.x(0);
      fieldSignature.y(0);
      fieldSignature.wrap('word');
    }

    fieldSignature.width(rectWidth);
    fieldSignature.height(rectHeight);

    fieldGroup.getLayer()?.batchDraw();
  });

  fieldGroup.on('transformend', () => {
    fieldSignature.scaleX(1);
    fieldSignature.scaleY(1);

    const rectWidth = fieldRect.width();
    const rectHeight = fieldRect.height();

    if (!isImageSignature) {
      const fieldMeta = field.fieldMeta as TSignatureFieldMeta | undefined;

      const newOverflowLayout = calculateOverflowLayout({
        overflowMode: resolveFieldOverflowMode(fieldMeta),
        isLabel,
        textToRender: fieldSignature.text(),
        fontSize: fieldSignature.fontSize(),
        fontFamily: getSignatureFontFamily(fieldSignature.text()),
        lineHeight: 1,
        letterSpacing: 0,
        textAlign: 'center',
        verticalAlign: 'middle',
        baseX: 0,
        baseY: 0,
        baseWidth: rectWidth,
        baseHeight: rectHeight,
        groupX: fieldGroup.x(),
        groupY: fieldGroup.y(),
        pageWidth,
        pageHeight,
      });

      fieldSignature.x(newOverflowLayout.x);
      fieldSignature.y(newOverflowLayout.y);
      fieldSignature.width(newOverflowLayout.width);
      fieldSignature.height(newOverflowLayout.height);
      fieldSignature.wrap(newOverflowLayout.wrap);
      fieldSignature.verticalAlign(newOverflowLayout.verticalAlign);
    } else {
      fieldSignature.width(rectWidth);
      fieldSignature.height(rectHeight);
    }

    fieldGroup.getLayer()?.batchDraw();
  });

  // Handle export mode.
  if (mode === 'export') {
    // Hide the rectangle.
    fieldRect.opacity(0);
  }

  if (color !== 'readOnly' && mode !== 'export') {
    createFieldHoverInteraction({ fieldGroup, fieldRect, options });
  }

  return {
    fieldGroup,
    isFirstRender,
  };
};
