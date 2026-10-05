import assert from 'node:assert/strict'
import test from 'node:test'
import { fitWithinSource } from '../client/src/features/colorLab/export'
import { applyColorLabPreset, createFilmDefectPlan, type PixelBuffer } from '../client/src/features/colorLab/processor'
import { fitColorLabDimensions, requireSafeDimensions } from '../client/src/features/colorLab/dimensions'
import { colorLabPresets, getColorLabPreset } from '../client/src/features/colorLab/presets'

function pixels(values: number[][], width = values.length): PixelBuffer {
  return { width, height: values.length / width, data: new Uint8ClampedArray(values.flatMap(([r, g, b, a = 255]) => [r, g, b, a])) }
}

const sample = pixels([[12, 18, 25], [70, 85, 100], [145, 125, 110], [245, 235, 220]], 2)
const luma = (data: Uint8ClampedArray, pixel: number) => data[pixel * 4]! * 0.2126 + data[pixel * 4 + 1]! * 0.7152 + data[pixel * 4 + 2]! * 0.0722

test('Original produces an identical independent pixel buffer', () => {
  const result = applyColorLabPreset(sample, 'original', 100, 7)
  assert.deepEqual([...result.data], [...sample.data])
  assert.notStrictEqual(result.data, sample.data)
})

test('presets never mutate original image data', () => {
  const before = [...sample.data]
  applyColorLabPreset(sample, 'dreamy-dust', 100, 7)
  assert.deepEqual([...sample.data], before)
})

test('intensity zero returns original and intensity 100 returns the full grade', () => {
  const zero = applyColorLabPreset(sample, 'golden-vintage', 0, 7)
  const full = applyColorLabPreset(sample, 'golden-vintage', 100, 7)
  assert.deepEqual([...zero.data], [...sample.data])
  assert.notDeepEqual([...full.data], [...sample.data])
})

test('switching presets derives B from original rather than stacking A into B', () => {
  applyColorLabPreset(sample, 'dark-instant', 100, 7)
  const directB = applyColorLabPreset(sample, 'pink-instant', 100, 7)
  const selectedB = applyColorLabPreset(sample, 'pink-instant', 100, 7)
  assert.deepEqual([...selectedB.data], [...directB.data])
})

test('Red Film responds differently across tonal regions instead of applying a flat overlay', () => {
  const source = pixels([[25, 25, 25], [128, 128, 128], [235, 235, 235]], 3)
  const result = applyColorLabPreset(source, 'red-film', 100, 11)
  const redDeltas = [0, 1, 2].map((index) => result.data[index * 4]! - source.data[index * 4]!)
  assert.equal(new Set(redDeltas).size > 1, true)
  assert.equal(result.data[4]! > result.data[5]!, true)
  assert.equal(result.data[8]! > result.data[9]!, true)
  assert.equal(luma(result.data, 0) < luma(result.data, 1), true)
  assert.equal(luma(result.data, 0) < luma(result.data, 2), true)
})

test('Dreamy Dust bloom is highlight-derived and does not globally flatten dark detail', () => {
  const source = pixels([
    [15, 20, 25], [25, 30, 35], [250, 245, 230],
    [35, 40, 45], [50, 55, 60], [20, 25, 30],
    [12, 16, 20], [75, 80, 85], [18, 22, 26],
  ], 3)
  const result = applyColorLabPreset(source, 'dreamy-dust', 100, 19)
  assert.notEqual(result.data[0], result.data[4])
  assert.equal(result.data[8]! > result.data[0]!, true)
})

test('Cream Instant raises blacks and compresses tonal contrast', () => {
  const source = pixels([[4, 4, 4], [128, 128, 128], [248, 248, 248]], 3)
  const result = applyColorLabPreset(source, 'cream-instant', 100, 23)
  assert.equal(luma(result.data, 0) > luma(source.data, 0), true)
  assert.equal(luma(result.data, 2) - luma(result.data, 0) < luma(source.data, 2) - luma(source.data, 0), true)
})

test('Flash 90s and Cream Instant have measurably different tonal responses', () => {
  const flash = applyColorLabPreset(sample, 'flash-90s', 100, 29)
  const cream = applyColorLabPreset(sample, 'cream-instant', 100, 29)
  assert.notDeepEqual([...flash.data], [...cream.data])
  assert.equal(luma(flash.data, 3) - luma(flash.data, 0) > luma(cream.data, 3) - luma(cream.data, 0), true)
})

test('grain, dust, and scratches are deterministic per image and preset seed', () => {
  const source = pixels(Array.from({ length: 1024 }, () => [96, 112, 128]), 32)
  const first = applyColorLabPreset(source, 'dreamy-dust', 100, 101)
  const repeated = applyColorLabPreset(source, 'dreamy-dust', 100, 101)
  const otherPreset = applyColorLabPreset(source, 'red-film', 100, 101)
  assert.deepEqual([...first.data], [...repeated.data])
  assert.notDeepEqual([...first.data], [...otherPreset.data])
})

test('bloom spreads from highlights without inventing glow in an all-dark source', () => {
  const darkValues = Array.from({ length: 25 }, () => [20, 20, 20])
  const withHighlight = darkValues.map((value) => [...value])
  withHighlight[12] = [255, 250, 235]
  const dark = applyColorLabPreset(pixels(darkValues, 5), 'dreamy-dust', 100, 41)
  const lit = applyColorLabPreset(pixels(withHighlight, 5), 'dreamy-dust', 100, 41)
  assert.equal(luma(lit.data, 10) > luma(dark.data, 10), true)
  assert.equal(Math.abs(luma(lit.data, 0) - luma(dark.data, 0)) < 1, true)
})

test('Flash 90s grain remains fine stochastic texture without flat block patches', () => {
  const source = pixels(Array.from({ length: 256 }, () => [180, 120, 145]), 16)
  const result = applyColorLabPreset(source, 'flash-90s', 100, 53)
  const redValues = Array.from({ length: 256 }, (_, index) => result.data[index * 4]!)
  assert.equal(new Set(redValues).size > 8, true)
  for (let blockY = 0; blockY < 4; blockY += 1) {
    for (let blockX = 0; blockX < 4; blockX += 1) {
      const block = []
      for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) block.push(redValues[(blockY * 4 + y) * 16 + blockX * 4 + x])
      assert.equal(new Set(block).size > 2, true)
    }
  }
})

test('dust remains sparse and separate from grain for normal presets', () => {
  assert.equal(getColorLabPreset('flash-90s').dustCount <= 20, true)
  assert.equal(getColorLabPreset('cream-instant').dustCount <= 20, true)
  assert.equal(getColorLabPreset('dreamy-dust').dustCount > getColorLabPreset('golden-vintage').dustCount, true)
  assert.equal(getColorLabPreset('original').dustCount, 0)
  assert.equal(getColorLabPreset('original').grainStrength, 0)
})

test('preset lineup is exactly the requested eleven-film collection', () => {
  assert.deepEqual(colorLabPresets.map(({ id, name }) => ({ id, name })), [
    { id: 'original', name: 'Original' },
    { id: 'bw-instant', name: 'B&W Instant' },
    { id: 'dark-instant', name: 'Dark Instant' },
    { id: 'flash-90s', name: 'Flash 90s' },
    { id: 'cream-instant', name: 'Cream Instant' },
    { id: 'golden-vintage', name: 'Golden Vintage' },
    { id: 'greenish-film', name: 'Greenish Film' },
    { id: 'pink-instant', name: 'Pink Instant' },
    { id: 'muted-retro', name: 'Muted Retro' },
    { id: 'red-film', name: 'Red Film' },
    { id: 'dreamy-dust', name: 'Dreamy Dust' },
  ])
})

test('B&W Instant removes chroma while preserving distinct tones', () => {
  const source = pixels([[35, 80, 145], [210, 120, 50]], 2)
  const result = applyColorLabPreset(source, 'bw-instant', 100, 67)
  for (let pixel = 0; pixel < 2; pixel += 1) {
    const red = result.data[pixel * 4]!
    const green = result.data[pixel * 4 + 1]!
    const blue = result.data[pixel * 4 + 2]!
    assert.equal(red >= green && green >= blue, true)
    assert.equal(red - blue <= 12, true)
  }
  assert.notEqual(luma(result.data, 0), luma(result.data, 1))
})

test('dust and long broken scratches use a deterministic normalized coordinate plan', () => {
  const plan = createFilmDefectPlan('dreamy-dust', 173)
  assert.deepEqual(plan, createFilmDefectPlan('dreamy-dust', 173))
  assert.notDeepEqual(plan, createFilmDefectPlan('dreamy-dust', 174))
  assert.equal(plan.dust.length, getColorLabPreset('dreamy-dust').dustCount)
  assert.equal(plan.dust.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1), true)
  assert.equal(plan.scratches.length >= 3 && plan.scratches.length <= 7, true)
  assert.equal(plan.scratches.every(({ x, yStart, yEnd }) => x >= 0 && x <= 1 && yStart >= 0 && yEnd <= 1 && yEnd - yStart >= 0.2 && yEnd - yStart <= 0.7), true)
})

test('HD dimensions preserve aspect ratio and never upscale', () => {
  assert.deepEqual(fitWithinSource(4032, 3024, 4096), { width: 4032, height: 3024 })
  assert.deepEqual(fitWithinSource(8064, 6048, 4096), { width: 4096, height: 3072 })
  assert.equal(4096 / 3072, 8064 / 6048)
})

test('landscape, portrait, preview, thumbnail, and Dreamy Dust dimensions are finite positive integers', () => {
  assert.deepEqual(fitColorLabDimensions(4032, 3024, 1600, 'preview'), { width: 1600, height: 1200 })
  assert.deepEqual(fitColorLabDimensions(3024, 4032, 1600, 'preview'), { width: 1200, height: 1600 })
  assert.deepEqual(fitColorLabDimensions(4032, 3024, 180, 'thumbnail'), { width: 180, height: 135 })
  assert.deepEqual(fitColorLabDimensions(3024, 4032, 180, 'Dreamy Dust thumbnail'), { width: 135, height: 180 })
})

test('invalid dimensions fail before NaN or Infinity can reach a canvas API', () => {
  for (const [width, height] of [[Number.NaN, 100], [100, Number.NaN], [Number.POSITIVE_INFINITY, 100], [0, 100], [-1, 100]]) {
    assert.throws(() => requireSafeDimensions(width, height, 'regression source'), /invalid regression source dimensions/)
  }
  assert.throws(() => fitColorLabDimensions(100, 100, Number.NaN, 'thumbnail'), /invalid thumbnail limit/)
})

test('processor rejects invalid geometry before Red Film or Dreamy Dust processing', () => {
  const invalid = { width: Number.NaN, height: 1, data: new Uint8ClampedArray(4) }
  assert.throws(() => applyColorLabPreset(invalid, 'red-film', 100, 1), /invalid processor dimensions/)
  assert.throws(() => applyColorLabPreset(invalid, 'dreamy-dust', 82, 1), /invalid processor dimensions/)
})
