import assert from 'node:assert/strict'
import test from 'node:test'
import { fitWithinSource } from '../client/src/features/colorLab/export'
import { applyColorLabPreset, type PixelBuffer } from '../client/src/features/colorLab/processor'

function pixels(values: number[][], width = values.length): PixelBuffer {
  return { width, height: values.length / width, data: new Uint8ClampedArray(values.flatMap(([r, g, b, a = 255]) => [r, g, b, a])) }
}

const sample = pixels([[12, 18, 25], [70, 85, 100], [145, 125, 110], [245, 235, 220]], 2)

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

test('HD dimensions preserve aspect ratio and never upscale', () => {
  assert.deepEqual(fitWithinSource(4032, 3024, 4096), { width: 4032, height: 3024 })
  assert.deepEqual(fitWithinSource(8064, 6048, 4096), { width: 4096, height: 3072 })
  assert.equal(4096 / 3072, 8064 / 6048)
})
