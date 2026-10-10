export type SignatureContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * The paper behind the strokes of a scanned or photographed signature,
 * measured per block so that shadows across the photo are part of the paper.
 */
export type SignaturePaper = {
  /**
   * Side in pixels of the square blocks the paper is measured in.
   */
  blockSize: number;

  /**
   * Number of blocks in each row.
   */
  blockColumns: number;

  /**
   * Darkness of the paper in each block.
   */
  levels: Uint8Array;

  /**
   * How much darker than the paper around it a pixel must be to be a stroke.
   */
  inkContrast: number;

  /**
   * Over how much more darkness strokes go from transparent to opaque, so
   * stroke edges stay smooth.
   */
  fade: number;
};

export type SignatureImageAnalysis = {
  /**
   * The box around the strokes.
   */
  bounds: SignatureContentBounds;

  /**
   * The paper to remove, or `null` when the strokes already sit on a
   * transparent canvas (drawn signatures, the stamp) or cannot be told apart
   * from the paper safely.
   */
  paper: SignaturePaper | null;
};

type SignaturePixels = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type Box = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * Pixels more transparent than this are empty canvas.
 */
const MIN_INK_ALPHA = 16;

/**
 * Pixels lighter than this on every channel are white, not strokes.
 */
const WHITE_CHANNEL = 240;

/**
 * Pixels at least this opaque can be paper.
 */
const MIN_PAPER_ALPHA = 250;

/**
 * Share of see-through pixels allowed inside a sheet of paper, for the soft
 * edges of a photo drawn into the signature pad.
 */
const MAX_PAPER_GAP_RATIO = 0.02;

/**
 * Paper is lighter than this. When most opaque pixels are darker, they are
 * strokes (a drawn signature, the stamp), not paper.
 */
const MAX_PAPER_DARKNESS = 160;

/**
 * The paper is measured in about this many blocks across the image, and in
 * blocks of at least this many pixels, so that shadows are followed but a
 * block is never mostly ink.
 */
const PAPER_BLOCKS_ACROSS = 20;
const MIN_PAPER_BLOCK_SIZE = 48;

/**
 * The paper in a block is its lightest tenth, which stays paper even where
 * strokes cover most of the block.
 */
const PAPER_PERCENTILE = 0.1;

/**
 * Blocks with fewer opaque pixels than this, such as blocks on the edge of a
 * photo, take the paper of the whole photo.
 */
const MIN_BLOCK_PAPER_PIXELS = 64;

/**
 * How much darker than the whole photo's paper a block's paper can be, as a
 * shadow. Darker than that, it is ink.
 */
const MAX_SHADOW_DARKNESS = 64;

/**
 * How much darker than the paper a pixel must be to count as a stroke.
 */
const MIN_INK_CONTRAST = 48;

/**
 * How many times the usual variation of the paper (grain, noise) a stroke
 * must stand out by.
 */
const PAPER_VARIATION_FACTOR = 4;

/**
 * How much darker than the paper the strokes must be, on average, to be cut
 * out of it. Below it they are too faint (pencil, a dark photo) to tell apart
 * safely, and the image is left as it is.
 */
const MIN_PAPER_REMOVAL_CONTRAST = 64;

/**
 * Size in pixels of the cells used to group stroke pixels into pieces.
 */
const CELL_SIZE = 8;

/**
 * Pieces closer than this many cells are one piece.
 */
const LINK_DISTANCE = 2;

/**
 * Pieces holding at least this share of the stroke pixels are the signature.
 */
const MIN_PIECE_RATIO = 0.02;

/**
 * Smaller pieces belong to the signature when they are this close to it, as
 * a share of its size (the dot of an "i", a full stop), and are specks of dust
 * when they are further away.
 */
const NEARBY_RATIO = 0.25;

/**
 * How dark a pixel looks on white paper, from 0 (white or transparent) to 255
 * (opaque black).
 */
const getDarkness = (data: Uint8ClampedArray, index: number) => {
  const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];

  return Math.round((data[index + 3] / 255) * (255 - luminance));
};

const isWhite = (data: Uint8ClampedArray, index: number) =>
  data[index] >= WHITE_CHANNEL && data[index + 1] >= WHITE_CHANNEL && data[index + 2] >= WHITE_CHANNEL;

const getPercentile = (histogram: ArrayLike<number>, total: number, fraction: number) => {
  let seen = 0;

  for (let value = 0; value < histogram.length; value++) {
    seen += histogram[value];

    if (seen >= total * fraction) {
      return value;
    }
  }

  return histogram.length - 1;
};

/**
 * Whether more than a few pixels inside the box are see-through. Paper is one
 * solid sheet, while a logo or a filled drawing on a transparent canvas has
 * gaps around and between its shapes.
 */
const hasGaps = (data: Uint8ClampedArray, width: number, box: Box) => {
  const area = (box.maxX - box.minX + 1) * (box.maxY - box.minY + 1);
  let gaps = 0;

  for (let y = box.minY; y <= box.maxY; y++) {
    for (let x = box.minX; x <= box.maxX; x++) {
      if (data[(y * width + x) * 4 + 3] < MIN_INK_ALPHA) {
        gaps++;
      }
    }
  }

  return gaps > area * MAX_PAPER_GAP_RATIO;
};

const getPaperLevel = (paper: Pick<SignaturePaper, 'blockSize' | 'blockColumns' | 'levels'>, x: number, y: number) =>
  paper.levels[Math.floor(y / paper.blockSize) * paper.blockColumns + Math.floor(x / paper.blockSize)];

const toBounds = ({ minX, minY, maxX, maxY }: Box, width: number, height: number, padding: number) => {
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + 1 + padding);
  const bottom = Math.min(height, maxY + 1 + padding);

  return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * The box around the signature, leaving out specks of dust: small pieces of
 * stroke pixels away from the signature. Returns `null` when no piece is big
 * enough to be the signature.
 */
const findSignatureBox = (
  cellInk: Uint32Array,
  cellBoxes: Box[],
  columns: number,
  rows: number,
  inkCount: number,
): Box | null => {
  const pieceOf = new Int32Array(cellInk.length).fill(-1);
  const pieces: Array<{ ink: number; box: Box }> = [];
  const queue: number[] = [];

  for (let start = 0; start < cellInk.length; start++) {
    if (cellInk[start] === 0 || pieceOf[start] !== -1) {
      continue;
    }

    const piece = { ink: 0, box: { ...cellBoxes[start] } };

    pieceOf[start] = pieces.length;
    queue.push(start);

    while (queue.length > 0) {
      const cell = queue.pop() ?? 0;
      const cellX = cell % columns;
      const cellY = (cell - cellX) / columns;

      piece.ink += cellInk[cell];
      piece.box.minX = Math.min(piece.box.minX, cellBoxes[cell].minX);
      piece.box.minY = Math.min(piece.box.minY, cellBoxes[cell].minY);
      piece.box.maxX = Math.max(piece.box.maxX, cellBoxes[cell].maxX);
      piece.box.maxY = Math.max(piece.box.maxY, cellBoxes[cell].maxY);

      for (let y = Math.max(0, cellY - LINK_DISTANCE); y <= Math.min(rows - 1, cellY + LINK_DISTANCE); y++) {
        for (let x = Math.max(0, cellX - LINK_DISTANCE); x <= Math.min(columns - 1, cellX + LINK_DISTANCE); x++) {
          const neighbour = y * columns + x;

          if (cellInk[neighbour] > 0 && pieceOf[neighbour] === -1) {
            pieceOf[neighbour] = pieces.length;
            queue.push(neighbour);
          }
        }
      }
    }

    pieces.push(piece);
  }

  const mainPieces = pieces.filter((piece) => piece.ink >= inkCount * MIN_PIECE_RATIO);

  if (mainPieces.length === 0) {
    return null;
  }

  const signature = { ...mainPieces[0].box };

  for (const { box } of mainPieces) {
    signature.minX = Math.min(signature.minX, box.minX);
    signature.minY = Math.min(signature.minY, box.minY);
    signature.maxX = Math.max(signature.maxX, box.maxX);
    signature.maxY = Math.max(signature.maxY, box.maxY);
  }

  const reach = Math.max(signature.maxX - signature.minX, signature.maxY - signature.minY) * NEARBY_RATIO + CELL_SIZE;
  const result = { ...signature };

  for (const { box } of pieces) {
    const isNearby =
      box.maxX >= signature.minX - reach &&
      box.minX <= signature.maxX + reach &&
      box.maxY >= signature.minY - reach &&
      box.minY <= signature.maxY + reach;

    if (isNearby) {
      result.minX = Math.min(result.minX, box.minX);
      result.minY = Math.min(result.minY, box.minY);
      result.maxX = Math.max(result.maxX, box.maxX);
      result.maxY = Math.max(result.maxY, box.maxY);
    }
  }

  return result;
};

/**
 * Find the strokes of a signature in an RGBA image: the box around them, so
 * the empty canvas or paper around them can be cropped away, and the paper
 * behind them, if any, so it can be removed.
 *
 * Works for drawn signatures (strokes on a transparent canvas) and uploaded
 * ones (a scan or photo of a signature on paper, which may be off-white or
 * shadowed). When the strokes on paper cannot be told apart from it safely,
 * the image is treated as before: cropped to what is not empty or white.
 *
 * Pass `canHavePaper: false` for images that are designed assets, such as a
 * stamp, so they are only ever cropped to what is not empty or white.
 *
 * Returns `null` when the image has no strokes.
 */
export const analyseSignatureImage = (
  { data, width, height }: SignaturePixels,
  padding = 0,
  canHavePaper = true,
): SignatureImageAnalysis | null => {
  const blockSize = Math.min(
    255,
    Math.max(MIN_PAPER_BLOCK_SIZE, Math.ceil(Math.max(width, height) / PAPER_BLOCKS_ACROSS)),
  );
  const blockColumns = Math.ceil(width / blockSize);
  const blockCount = blockColumns * Math.ceil(height / blockSize);
  const blockHistograms = new Uint16Array(blockCount * 256);
  const blockOpaque = new Uint32Array(blockCount);
  const opaqueHistogram = new Uint32Array(256);
  const plain: Box = { minX: width, minY: height, maxX: -1, maxY: -1 };
  let visibleCount = 0;
  let opaqueCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;

      if (data[index + 3] < MIN_INK_ALPHA) {
        continue;
      }

      visibleCount++;

      if (!isWhite(data, index)) {
        plain.minX = Math.min(plain.minX, x);
        plain.minY = Math.min(plain.minY, y);
        plain.maxX = Math.max(plain.maxX, x);
        plain.maxY = Math.max(plain.maxY, y);
      }

      if (data[index + 3] >= MIN_PAPER_ALPHA) {
        const darkness = getDarkness(data, index);
        const block = Math.floor(y / blockSize) * blockColumns + Math.floor(x / blockSize);

        opaqueHistogram[darkness]++;
        opaqueCount++;
        blockHistograms[block * 256 + darkness]++;
        blockOpaque[block]++;
      }
    }
  }

  if (plain.maxX < 0) {
    return null;
  }

  // Strokes on a transparent canvas, or anything that cannot be cut out of
  // its paper safely, is cropped to what is not empty or white.
  const asItIs = { bounds: toBounds(plain, width, height, padding), paper: null };

  if (!canHavePaper || opaqueCount * 2 < visibleCount || hasGaps(data, width, plain)) {
    return asItIs;
  }

  // Strokes cover a small part of a signature photo, so the typical opaque
  // pixel is paper.
  const photoPaper = getPercentile(opaqueHistogram, opaqueCount, 0.5);

  if (photoPaper > MAX_PAPER_DARKNESS) {
    return asItIs;
  }

  const levels = new Uint8Array(blockCount);

  for (let block = 0; block < blockCount; block++) {
    const blockPaper =
      blockOpaque[block] >= MIN_BLOCK_PAPER_PIXELS
        ? getPercentile(blockHistograms.subarray(block * 256, block * 256 + 256), blockOpaque[block], PAPER_PERCENTILE)
        : photoPaper;

    levels[block] = Math.min(blockPaper, photoPaper + MAX_SHADOW_DARKNESS);
  }

  const paperMap = { blockSize, blockColumns, levels };

  const deviations = new Uint32Array(256);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;

      if (data[index + 3] >= MIN_PAPER_ALPHA) {
        deviations[Math.abs(getDarkness(data, index) - getPaperLevel(paperMap, x, y))]++;
      }
    }
  }

  const inkContrast = Math.max(MIN_INK_CONTRAST, PAPER_VARIATION_FACTOR * getPercentile(deviations, opaqueCount, 0.5));

  // Stroke pixels are counted per cell, with the box around them in each cell.
  const columns = Math.ceil(width / CELL_SIZE);
  const rows = Math.ceil(height / CELL_SIZE);
  const cellInk = new Uint32Array(columns * rows);
  const cellBoxes: Box[] = Array.from({ length: columns * rows }, () => ({
    minX: width,
    minY: height,
    maxX: -1,
    maxY: -1,
  }));
  let inkCount = 0;
  let inkContrastSum = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;

      if (data[index + 3] < MIN_INK_ALPHA) {
        continue;
      }

      const contrast = getDarkness(data, index) - getPaperLevel(paperMap, x, y);

      if (contrast <= inkContrast) {
        continue;
      }

      const cell = Math.floor(y / CELL_SIZE) * columns + Math.floor(x / CELL_SIZE);
      const box = cellBoxes[cell];

      cellInk[cell]++;
      box.minX = Math.min(box.minX, x);
      box.minY = Math.min(box.minY, y);
      box.maxX = Math.max(box.maxX, x);
      box.maxY = Math.max(box.maxY, y);
      inkCount++;
      inkContrastSum += contrast;
    }
  }

  if (inkCount === 0 || inkContrastSum / inkCount < MIN_PAPER_REMOVAL_CONTRAST) {
    return asItIs;
  }

  const signature = findSignatureBox(cellInk, cellBoxes, columns, rows, inkCount);

  if (!signature) {
    return asItIs;
  }

  return {
    bounds: toBounds(signature, width, height, padding),
    paper: {
      ...paperMap,
      inkContrast,
      fade: Math.max(1, (inkContrastSum / inkCount - inkContrast) / 2),
    },
  };
};

/**
 * Copy an area of a signature image with its paper made transparent, so only
 * the strokes remain, in their own colour.
 */
export const removeSignaturePaper = (
  { data, width }: SignaturePixels,
  area: SignatureContentBounds,
  paper: SignaturePaper,
): Uint8ClampedArray => {
  const result = new Uint8ClampedArray(area.width * area.height * 4);

  for (let y = 0; y < area.height; y++) {
    for (let x = 0; x < area.width; x++) {
      const source = ((area.y + y) * width + area.x + x) * 4;
      const target = (y * area.width + x) * 4;
      const contrast = getDarkness(data, source) - getPaperLevel(paper, area.x + x, area.y + y);
      const opacity = Math.min(1, Math.max(0, (contrast - paper.inkContrast) / paper.fade));

      result[target] = data[source];
      result[target + 1] = data[source + 1];
      result[target + 2] = data[source + 2];
      result[target + 3] = Math.round(data[source + 3] * opacity);
    }
  }

  return result;
};
