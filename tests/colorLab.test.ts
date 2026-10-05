import assert from 'node:assert/strict'
import test from 'node:test'
import { fitWithinSource } from '../client/src/features/colorLab/export'
import { applyColorLabPreset, type PixelBuffer } from '../client/src/features/colorLab/processor'
import { fitColorLabDimensions, requireSafeDimensions } from '../client/src/features/colorLab/dimensions'

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
  const zero = applyColorLabPreset(sample, 'classic-600', 0, 7)
  const full = applyColorLabPreset(sample, 'classic-600', 100, 7)
  assert.deepEqual([...zero.data], [...sample.data])
  assert.notDeepEqual([...full.data], [...sample.data])
})

test('switching presets derives B from original rather than stacking A into B', () => {
  applyColorLabPreset(sample, 'classic-600', 100, 7)
  const directB = applyColorLabPreset(sample, 'pink-fade', 100, 7)
  const selectedB = applyColorLabPreset(sample, 'pink-fade', 100, 7)
  assert.deepEqual([...selectedB.data], [...directB.data])
})

test('Red Film responds differently across tonal regions instead of applying a flat overlay', () => {
  const source = pixels([[25, 25, 25], [128, 128, 128], [235, 235, 235]], 3)
  const result = applyColorLabPreset(source, 'red-film', 100, 11)
  const redDeltas = [0, 1, 2].map((index) => result.data[index * 4]! - source.data[index * 4]!)
  assert.equal(new Set(redDeltas).size > 1, true)
  assert.equal(result.data[1]! < result.data[0]!, true)
  assert.equal(result.data[5]! < result.data[4]!, true)
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

test('Milk Fade raises blacks and compresses tonal contrast', () => {
  const source = pixels([[4, 4, 4], [128, 128, 128], [248, 248, 248]], 3)
  const result = applyColorLabPreset(source, 'milk-fade', 100, 23)
  assert.equal(luma(result.data, 0) > luma(source.data, 0), true)
  assert.equal(luma(result.data, 2) - luma(result.data, 0) < luma(source.data, 2) - luma(source.data, 0), true)
})

test('Cold Flash and SX-70 have measurably different tonal responses', () => {
  const cold = applyColorLabPreset(sample, 'cold-flash', 100, 29)
  const warm = applyColorLabPreset(sample, 'sx70-warm', 100, 29)
  assert.notDeepEqual([...cold.data], [...warm.data])
  assert.equal(luma(cold.data, 3) - luma(cold.data, 0) > luma(warm.data, 3) - luma(warm.data, 0), true)
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
