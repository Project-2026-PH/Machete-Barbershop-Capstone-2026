import sharp from 'sharp';

const MAX_OUTPUT_WIDTH = 1600;
const JPEG_QUALITY = 88;

export type NormalizedReceiptImage = {
  buffer: Buffer;
  contentType: 'image/jpeg';
  width: number;
  height: number;
};

export const normalizeReceiptImage = async (input: Buffer): Promise<NormalizedReceiptImage> => {
  const { data, info } = await sharp(input, { limitInputPixels: 12000 * 12000 })
    .rotate()
    .resize({ width: MAX_OUTPUT_WIDTH, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: 'image/jpeg',
    width: info.width,
    height: info.height,
  };
};
