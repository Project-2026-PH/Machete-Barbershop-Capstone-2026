/** Image operations used only after the ordinary receipt OCR pass misses a field. */
export interface ReceiptPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type ReceiptPoint = readonly [number, number];
export type ReceiptQuad = readonly [ReceiptPoint, ReceiptPoint, ReceiptPoint, ReceiptPoint];

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const luminance = (data: Uint8ClampedArray, offset: number) =>
  (77 * data[offset] + 150 * data[offset + 1] + 29 * data[offset + 2]) >> 8;

const otsuThreshold = (gray: Uint8Array): number => {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[value] += 1;
  let total = 0;
  for (let i = 0; i < 256; i++) total += i * histogram[i];
  let below = 0;
  let belowWeight = 0;
  let best = 0;
  let bestVariance = -1;
  for (let i = 0; i < 256; i++) {
    below += histogram[i];
    if (!below || below === gray.length) continue;
    belowWeight += i * histogram[i];
    const difference = belowWeight / below - (total - belowWeight) / (gray.length - below);
    const variance = below * (gray.length - below) * difference * difference;
    if (variance > bestVariance) { bestVariance = variance; best = i; }
  }
  return best;
};

const quadrilateralArea = (quad: ReceiptQuad): number => {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const current = quad[i];
    const next = quad[(i + 1) % 4];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area) / 2;
};

/** Finds the largest enclosed high-contrast screen region; returns null when corners are unreliable. */
export const detectReceiptQuadrilateral = (image: ReceiptPixels): ReceiptQuad | null => {
  const { width, height, data } = image;
  if (width < 60 || height < 60 || data.length < width * height * 4) return null;
  const total = width * height;
  const gray = new Uint8Array(total);
  for (let i = 0; i < total; i++) gray[i] = luminance(data, i * 4);
  const threshold = otsuThreshold(gray);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let best: { quad: ReceiptQuad; score: number } | null = null;

  for (const bright of [true, false]) {
    visited.fill(0);
    for (let start = 0; start < total; start++) {
      if (visited[start] || (gray[start] > threshold) !== bright) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      let minSum = Infinity; let maxSum = -Infinity;
      let minDiff = Infinity; let maxDiff = -Infinity;
      let topLeft: ReceiptPoint = [0, 0]; let topRight: ReceiptPoint = [0, 0];
      let bottomRight: ReceiptPoint = [0, 0]; let bottomLeft: ReceiptPoint = [0, 0];
      let touchesBorder = false;
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
        const sum = x + y;
        const diff = x - y;
        if (sum < minSum) { minSum = sum; topLeft = [x, y]; }
        if (sum > maxSum) { maxSum = sum; bottomRight = [x, y]; }
        if (diff > maxDiff) { maxDiff = diff; topRight = [x, y]; }
        if (diff < minDiff) { minDiff = diff; bottomLeft = [x, y]; }
        for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
          if (neighbor < 0 || neighbor >= total || visited[neighbor]) continue;
          if (Math.abs((neighbor % width) - x) + Math.abs(Math.floor(neighbor / width) - y) !== 1) continue;
          if ((gray[neighbor] > threshold) !== bright) continue;
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      if (touchesBorder || tail < total * 0.045 || tail > total * 0.85) continue;
      const quad: ReceiptQuad = [topLeft, topRight, bottomRight, bottomLeft];
      const area = quadrilateralArea(quad);
      if (area < total * 0.045 || area > total * 0.88) continue;
      const score = area * Math.min(1, tail / area);
      if (!best || score > best.score) best = { quad, score };
    }
  }
  return best?.quad ?? null;
};

const solveHomography = (source: ReceiptQuad, width: number, height: number): number[] | null => {
  const target: ReceiptQuad = [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]];
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = target[i];
    const [x, y] = source[i];
    rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    rows.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-8) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let j = column; j < 9; j++) rows[column][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let j = column; j < 9; j++) rows[row][j] -= factor * rows[column][j];
    }
  }
  return rows.map(row => row[8]);
};

export const warpReceiptPixels = (image: ReceiptPixels, quad: ReceiptQuad, width: number, height: number): ReceiptPixels => {
  const output = new Uint8ClampedArray(width * height * 4);
  const matrix = solveHomography(quad, width, height);
  if (!matrix) return { data: output, width, height };
  for (let v = 0; v < height; v++) for (let u = 0; u < width; u++) {
    const denominator = matrix[6] * u + matrix[7] * v + 1;
    const x = clamp((matrix[0] * u + matrix[1] * v + matrix[2]) / denominator, 0, image.width - 1);
    const y = clamp((matrix[3] * u + matrix[4] * v + matrix[5]) / denominator, 0, image.height - 1);
    const x0 = Math.floor(x); const y0 = Math.floor(y);
    const x1 = Math.min(image.width - 1, x0 + 1); const y1 = Math.min(image.height - 1, y0 + 1);
    const fx = x - x0; const fy = y - y0;
    const offset = (v * width + u) * 4;
    for (let channel = 0; channel < 3; channel++) {
      output[offset + channel] =
        image.data[(y0 * image.width + x0) * 4 + channel] * (1 - fx) * (1 - fy) +
        image.data[(y0 * image.width + x1) * 4 + channel] * fx * (1 - fy) +
        image.data[(y1 * image.width + x0) * 4 + channel] * (1 - fx) * fy +
        image.data[(y1 * image.width + x1) * 4 + channel] * fx * fy;
    }
    output[offset + 3] = 255;
  }
  return { data: output, width, height };
};

const toCanvas = (image: ReceiptPixels): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const pixels = new Uint8ClampedArray(image.data.length);
  pixels.set(image.data);
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  return canvas;
};

const enhanceReceiptPixels = (image: ReceiptPixels): [ReceiptPixels, ReceiptPixels] => {
  const { width, height, data } = image;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = luminance(data, i * 4);
  // A small Gaussian kernel attenuates the pixel grid without erasing text edges.
  const blurred = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0; let weight = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const w = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
      sum += gray[clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1)] * w;
      weight += w;
    }
    blurred[y * width + x] = sum / weight;
  }
  // CLAHE with clipped local histograms avoids amplifying glare and dark backgrounds.
  const tile = 64;
  const tilesX = Math.ceil(width / tile); const tilesY = Math.ceil(height / tile);
  const maps: Uint8Array[] = [];
  for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
    const histogram = new Uint32Array(256);
    let count = 0;
    for (let y = ty * tile; y < Math.min(height, (ty + 1) * tile); y++)
      for (let x = tx * tile; x < Math.min(width, (tx + 1) * tile); x++) { histogram[blurred[y * width + x]]++; count++; }
    const clipLimit = Math.max(2, Math.ceil(count / 256) * 3);
    let excess = 0;
    for (let i = 0; i < 256; i++) if (histogram[i] > clipLimit) { excess += histogram[i] - clipLimit; histogram[i] = clipLimit; }
    for (let i = 0; i < 256; i++) histogram[i] += Math.floor(excess / 256) + (i < excess % 256 ? 1 : 0);
    const map = new Uint8Array(256);
    let cumulative = 0;
    for (let i = 0; i < 256; i++) { cumulative += histogram[i]; map[i] = clamp(Math.round(cumulative * 255 / count), 0, 255); }
    maps.push(map);
  }
  const contrasted = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tx = Math.min(tilesX - 1, Math.floor(x / tile));
    const ty = Math.min(tilesY - 1, Math.floor(y / tile));
    contrasted[y * width + x] = maps[ty * tilesX + tx][blurred[y * width + x]];
  }
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y++) for (let x = 1; x <= width; x++)
    integral[y * (width + 1) + x] = contrasted[(y - 1) * width + x - 1] + integral[(y - 1) * (width + 1) + x] + integral[y * (width + 1) + x - 1] - integral[(y - 1) * (width + 1) + x - 1];
  const contrastData = new Uint8ClampedArray(data.length);
  const thresholdData = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = Math.max(0, x - 15); const x1 = Math.min(width, x + 16);
    const y0 = Math.max(0, y - 15); const y1 = Math.min(height, y + 16);
    const localSum = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
    const mean = localSum / ((x1 - x0) * (y1 - y0));
    const value = contrasted[y * width + x];
    const binary = value < mean - 10 ? 0 : 255;
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) { contrastData[offset + channel] = value; thresholdData[offset + channel] = binary; }
    contrastData[offset + 3] = thresholdData[offset + 3] = 255;
  }
  return [{ data: contrastData, width, height }, { data: thresholdData, width, height }];
};

/** Returns corrected/contrast/adaptive-threshold variants; callers OCR only as many as needed. */
export const buildReceiptPhotoVariants = async (file: File): Promise<HTMLCanvasElement[]> => {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const source = context.getImageData(0, 0, canvas.width, canvas.height);
    const detection = document.createElement('canvas');
    const detectionScale = Math.min(1, 600 / Math.max(canvas.width, canvas.height));
    detection.width = Math.max(1, Math.round(canvas.width * detectionScale));
    detection.height = Math.max(1, Math.round(canvas.height * detectionScale));
    const detectionContext = detection.getContext('2d', { willReadFrequently: true });
    detectionContext?.drawImage(canvas, 0, 0, detection.width, detection.height);
    const small = detectionContext?.getImageData(0, 0, detection.width, detection.height);
    const detected = small ? detectReceiptQuadrilateral(small) : null;
    let corrected: ReceiptPixels = source;
    if (detected) {
      const quad = detected.map(([x, y]) => [x / detectionScale, y / detectionScale] as ReceiptPoint) as unknown as ReceiptQuad;
      const distance = (a: ReceiptPoint, b: ReceiptPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const outputWidth = clamp(Math.round(Math.max(distance(quad[0], quad[1]), distance(quad[3], quad[2]))), 120, 1800);
      const outputHeight = clamp(Math.round(Math.max(distance(quad[0], quad[3]), distance(quad[1], quad[2]))), 120, 1800);
      corrected = warpReceiptPixels(source, quad, outputWidth, outputHeight);
    }
    const [contrast, threshold] = enhanceReceiptPixels(corrected);
    return [toCanvas(corrected), toCanvas(contrast), toCanvas(threshold)];
  } finally {
    bitmap.close();
  }
};

/** Cashier evidence screens need a reference suggestion, with manual entry as the fallback. */
export const scanReceiptReference = async (file: File, extract: (text: string) => string | null): Promise<string | null> => {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const original = await worker.recognize(file);
    let reference = extract(original.data.text);
    if (reference) return reference;
    for (const canvas of await buildReceiptPhotoVariants(file)) {
      const result = await worker.recognize(canvas);
      reference = extract(result.data.text);
      if (reference) return reference;
    }
    return null;
  } finally {
    await worker.terminate();
  }
};
