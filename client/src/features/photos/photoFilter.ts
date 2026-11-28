export const photoFilterCss = (grayscale: boolean) => grayscale ? 'grayscale(1)' : 'none'

export function grayscaleRgbaPixels(pixels: Uint8ClampedArray) {
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const grayscale = Math.round(pixels[index]! * 0.2126 + pixels[index + 1]! * 0.7152 + pixels[index + 2]! * 0.0722)
    pixels[index] = grayscale
    pixels[index + 1] = grayscale
    pixels[index + 2] = grayscale
  }
  return pixels
}
