import assert from 'node:assert/strict'
import test from 'node:test'
import { fitWithinSource } from '../client/src/features/colorLab/export'
import { applyColorLabPreset, COLOR_LAB_RENDER_VERSION, createFilmDefectPlan, createFilmDefectRaster, renderFilmImage, type PixelBuffer } from '../client/src/features/colorLab/processor'
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
  const values = [[25, 25, 25], [128, 128, 128], [235, 235, 235]].flatMap((value) => Array.from({ length: 100 }, () => value))
  const source = pixels(values, 300)
  const result = applyColorLabPreset(source, 'red-film', 100, 11)
  const channelAverage = (start: number, channel: number) => Array.from({ length: 100 }, (_, offset) => result.data[(start + offset) * 4 + channel]!).reduce((sum, value) => sum + value, 0) / 100
  const redDeltas = [0, 100, 200].map((index) => channelAverage(index, 0) - source.data[index * 4]!)
  assert.equal(new Set(redDeltas).size > 1, true)
  assert.equal(channelAverage(100, 0) > channelAverage(100, 1), true)
  assert.equal(channelAverage(200, 0) > channelAverage(200, 1), true)
  assert.equal(channelAverage(0, 0) < channelAverage(100, 0), true)
})

test('Dreamy Dust bloom is highlight-derived and does not globally flatten dark detail', () => {
  const values = Array.from({ length: 1024 }, (_, index) => {
    const x = index % 32; const y = Math.floor(index / 32)
    return x >= 14 && x <= 17 && y >= 14 && y <= 17 ? [250, 245, 230] : [15 + x, 20 + y, 25 + (x + y) / 2]
  })
  const source = pixels(values, 32)
  const result = applyColorLabPreset(source, 'dreamy-dust', 100, 19)
  const redValues = Array.from({ length: 1024 }, (_, index) => result.data[index * 4]!)
  assert.equal(new Set(redValues).size > 20, true)
  assert.equal(result.data[(15 * 32 + 15) * 4]! > result.data[0]!, true)
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
  const result = applyColorLabPreset(source, 'flash-90s', 100, 53, { grain: true, dust: false })
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
  assert.equal(getColorLabPreset('flash-90s').dustCount < getColorLabPreset('golden-vintage').dustCount, true)
  assert.equal(getColorLabPreset('cream-instant').dustCount < getColorLabPreset('muted-retro').dustCount, true)
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
  const source = pixels([
    ...Array.from({ length: 200 }, () => [35, 80, 145]),
    ...Array.from({ length: 200 }, () => [210, 120, 50]),
  ], 400)
  const result = applyColorLabPreset(source, 'bw-instant', 100, 67)
  const average = (start: number, channel: number) => Array.from({ length: 200 }, (_, offset) => result.data[(start + offset) * 4 + channel]!).reduce((sum, value) => sum + value, 0) / 200
  for (const start of [0, 200]) {
    const red = average(start, 0)
    const green = average(start, 1)
    const blue = average(start, 2)
    assert.equal(red >= green && green >= blue, true)
    assert.equal(red - blue <= 12, true)
  }
  assert.notEqual(average(0, 0), average(200, 0))
})

test('dust and long broken scratches use a deterministic normalized coordinate plan', () => {
  const plan = createFilmDefectPlan('dreamy-dust', 173, 1000, 1500)
  assert.deepEqual(plan, createFilmDefectPlan('dreamy-dust', 173, 1000, 1500))
  assert.notDeepEqual(plan, createFilmDefectPlan('dreamy-dust', 174, 1000, 1500))
  assert.equal(plan.dust.length, 975)
  assert.equal(plan.dust.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1), true)
  assert.equal(new Set(plan.dust.map(({ kind }) => kind)).size >= 3, true)
  assert.equal(plan.scratches.length >= 6 && plan.scratches.length <= 10, true)
  assert.equal(plan.scratches.every(({ x, yStart, yEnd, width, softness, interruptions }) => x >= 0 && x <= 1 && yStart >= 0 && yEnd <= 1 && yEnd > yStart && width >= 0.7 && width <= 2.8 && softness >= 0 && softness <= 1 && interruptions >= 1), true)
  assert.equal(plan.scratches.filter(({ yStart, yEnd }) => yEnd - yStart >= 0.4 && yEnd - yStart <= 0.95).length >= Math.ceil(plan.scratches.length * 0.45), true)
  assert.equal(plan.scratches.some(({ slope, curve }) => Math.abs(slope) > 0.02 && Math.abs(curve) > 0.005), true)
})

test('thumbnail, main, and export rasterize one area-scaled deterministic defect layout', () => {
  assert.equal(COLOR_LAB_RENDER_VERSION, 5)
  const thumbnail = createFilmDefectRaster(180, 135, 'dreamy-dust', 307)
  const main = createFilmDefectRaster(1200, 900, 'dreamy-dust', 307)
  const hd = createFilmDefectRaster(2400, 1800, 'dreamy-dust', 307)
  assert.equal(thumbnail.plan.dust.length < main.plan.dust.length, true)
  assert.equal(main.plan.dust.length < hd.plan.dust.length, true)
  assert.deepEqual(main.plan.dust.slice(0, thumbnail.plan.dust.length), thumbnail.plan.dust)
  assert.deepEqual(hd.plan.dust.slice(0, main.plan.dust.length), main.plan.dust)
  assert.deepEqual(main.plan.abrasion.slice(0, thumbnail.plan.abrasion.length), thumbnail.plan.abrasion)
  assert.deepEqual(hd.plan.abrasion.slice(0, main.plan.abrasion.length), main.plan.abrasion)
  assert.deepEqual(thumbnail.plan.scratches, main.plan.scratches)
  assert.deepEqual(main.plan.scratches, hd.plan.scratches)
  assert.deepEqual(thumbnail.plan.fibers, main.plan.fibers)
  assert.deepEqual(main.plan.fibers, hd.plan.fibers)
  for (const raster of [thumbnail, main, hd]) {
    assert.equal(raster.dust.size > 0, true)
    assert.equal(raster.abrasion.size > 0, true)
    assert.equal(raster.scratches.size > 0, true)
    assert.equal(raster.fibers.size > 0, true)
  }
  const originalSource = pixels(Array.from({ length: 100 }, () => [90, 110, 130]), 10)
  assert.deepEqual([...renderFilmImage(originalSource, 'original', 100, 307, { grain: false, dust: false }).data], [...originalSource.data])
})

test('canonical film renderer bakes defects into thumbnail, main, and export pixels', () => {
  const fixture = (width: number, height: number): PixelBuffer => ({
    width,
    height,
    data: new Uint8ClampedArray(Array.from({ length: width * height }, (_, index) => {
      const x = index % width; const y = Math.floor(index / width)
      return [70 + x / width * 120, 55 + y / height * 140, 90 + (x + y) / (width + height) * 100, 255]
    }).flat()),
  })
  for (const [width, height] of [[90, 60], [300, 200], [600, 400]]) {
    const source = fixture(width, height)
    const rendered = renderFilmImage(source, 'dreamy-dust', 100, 401, { grain: true, dust: true })
    assert.notDeepEqual([...rendered.data], [...source.data])
    const raster = createFilmDefectRaster(width, height, 'dreamy-dust', 401)
    assert.equal(raster.dust.size > 0, true)
    assert.equal(raster.abrasion.size > 0, true)
    assert.equal(raster.scratches.size > 0, true)
    assert.equal(raster.fibers.size > 0, true)
  }
  assert.strictEqual(applyColorLabPreset, renderFilmImage)
})

test('Grain and Dust are independent optional effects in every combination', () => {
  const source = pixels(Array.from({ length: 4096 }, (_, index) => [70 + index % 90, 85 + index % 70, 100 + index % 50]), 64)
  const clean = renderFilmImage(source, 'original', 100, 509, { grain: false, dust: false })
  const grainOnly = renderFilmImage(source, 'original', 100, 509, { grain: true, dust: false })
  const dustOnly = renderFilmImage(source, 'original', 100, 509, { grain: false, dust: true })
  const both = renderFilmImage(source, 'original', 100, 509, { grain: true, dust: true })
  assert.deepEqual([...clean.data], [...source.data])
  assert.notDeepEqual([...grainOnly.data], [...clean.data])
  assert.notDeepEqual([...dustOnly.data], [...clean.data])
  assert.notDeepEqual([...both.data], [...grainOnly.data])
  assert.notDeepEqual([...both.data], [...dustOnly.data])
})

test('Dust toggle restores identical geometry and is stable across color presets', () => {
  const first = createFilmDefectPlan('golden-vintage', 601, 1200, 800)
  const toggledBackOn = createFilmDefectPlan('golden-vintage', 601, 1200, 800)
  const anotherColor = createFilmDefectPlan('pink-instant', 601, 1200, 800)
  assert.deepEqual(toggledBackOn, first)
  assert.deepEqual(anotherColor, first)
})

test('enabled Grain and Dust contribute to both main-preview and HD-sized pixels', () => {
  const fixture = (width: number, height: number) => pixels(Array.from({ length: width * height }, (_, index) => [80 + index % 80, 95 + index % 60, 115 + index % 40]), width)
  for (const [width, height] of [[240, 160], [720, 480]]) {
    const source = fixture(width, height)
    const clean = renderFilmImage(source, 'golden-vintage', 100, 701, { grain: false, dust: false })
    const textured = renderFilmImage(source, 'golden-vintage', 100, 701, { grain: true, dust: true })
    assert.notDeepEqual([...textured.data], [...clean.data])
    const raster = createFilmDefectRaster(width, height, 'golden-vintage', 701)
    assert.equal(raster.dust.size > 0 && raster.abrasion.size > 0 && raster.scratches.size > 0 && raster.fibers.size > 0, true)
  }
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
