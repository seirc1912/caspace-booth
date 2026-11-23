import sharp from 'sharp'

/** 400px long edge, like the customer thumbnails; stays well under the 512 KB server limit. */
export async function makeThumbnail(bytes: Buffer) {
  return sharp(bytes).rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70, mozjpeg: true }).toBuffer()
}
