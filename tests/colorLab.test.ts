import assert from 'node:assert/strict'
import test from 'node:test'
import { fitWithinSource } from '../client/src/features/colorLab/export'
import { applyColorLabPreset, COLOR_LAB_RENDER_VERSION, createBurnPlan, createFilmDefectPlan, createFilmDefectRaster, renderFilmImage, type PixelBuffer } from '../client/src/features/colorLab/processor'
import { fitColorLabDimensions, requireSafeDimensions } from '../client/src/features/colorLab/dimensions'
import { colorLabPresets } from '../client/src/features/colorLab/presets'
import { ColorLabPreviewRuntime } from '../client/src/features/colorLab/previewRuntime'
import { isLatestPreviewRequest } from '../client/src/features/colorLab/previewClient'

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
  applyColorLabPreset(sample, 'burnt-film', 100, 7)
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
  const directB = applyColorLabPreset(sample, 'expired-film', 100, 7)
  const selectedB = applyColorLabPreset(sample, 'expired-film', 100, 7)
  assert.deepEqual([...selectedB.data], [...directB.data])
})

test('Expired Film uses tonal color crossover instead of a flat overlay', () => {
  const values = [[25, 25, 25], [128, 128, 128], [235, 235, 235]].flatMap((value) => Array.from({ length: 100 }, () => value))
  const source = pixels(values, 300)
  const result = applyColorLabPreset(source, 'expired-film', 100, 11)
  const channelAverage = (start: number, channel: number) => Array.from({ length: 100 }, (_, offset) => result.data[(start + offset) * 4 + channel]!).reduce((sum, value) => sum + value, 0) / 100
  const channelDeltas = [0, 100, 200].map((index) => [0, 1, 2].map((channel) => channelAverage(index, channel) - source.data[index * 4 + channel]!))
  assert.notDeepEqual(channelDeltas[0], channelDeltas[1])
  assert.notDeepEqual(channelDeltas[1], channelDeltas[2])
  assert.equal(channelAverage(0, 1) > channelAverage(0, 0), true)
  assert.equal(channelAverage(100, 0) > channelAverage(100, 1), true)
})

test('Burnt Film bloom is highlight-derived and does not globally flatten dark detail', () => {
  const values = Array.from({ length: 1024 }, (_, index) => {
    const x = index % 32; const y = Math.floor(index / 32)
    return x >= 14 && x <= 17 && y >= 14 && y <= 17 ? [250, 245, 230] : [15 + x, 20 + y, 25 + (x + y) / 2]
  })
  const source = pixels(values, 32)
  const result = applyColorLabPreset(source, 'burnt-film', 100, 19)
  const redValues = Array.from({ length: 1024 }, (_, index) => result.data[index * 4]!)
  assert.equal(new Set(redValues).size > 20, true)
  assert.equal(result.data[(15 * 32 + 15) * 4]! > result.data[0]!, true)
})

test('Faded Brown raises blacks and compresses tonal contrast', () => {
  const source = pixels([[4, 4, 4], [128, 128, 128], [248, 248, 248]], 3)
  const result = applyColorLabPreset(source, 'faded-brown', 100, 23)
  assert.equal(luma(result.data, 0) > luma(source.data, 0), true)
  assert.equal(luma(result.data, 2) - luma(result.data, 0) < luma(source.data, 2) - luma(source.data, 0), true)
})

test('Flash 90s and Faded Brown have measurably different tonal responses', () => {
  const flash = applyColorLabPreset(sample, 'flash-90s', 100, 29)
  const faded = applyColorLabPreset(sample, 'faded-brown', 100, 29)
  assert.notDeepEqual([...flash.data], [...faded.data])
  assert.equal(luma(flash.data, 3) - luma(flash.data, 0) > luma(faded.data, 3) - luma(faded.data, 0), true)
})

test('grain, dust, and scratches are deterministic per image and preset seed', () => {
  const source = pixels(Array.from({ length: 1024 }, () => [96, 112, 128]), 32)
  const first = applyColorLabPreset(source, 'burnt-film', 100, 101)
  const repeated = applyColorLabPreset(source, 'burnt-film', 100, 101)
  const otherPreset = applyColorLabPreset(source, 'expired-film', 100, 101)
  assert.deepEqual([...first.data], [...repeated.data])
  assert.notDeepEqual([...first.data], [...otherPreset.data])
})

test('bloom spreads from highlights without inventing glow in an all-dark source', () => {
  const darkValues = Array.from({ length: 25 }, () => [20, 20, 20])
  const withHighlight = darkValues.map((value) => [...value])
  withHighlight[12] = [255, 250, 235]
  const dark = applyColorLabPreset(pixels(darkValues, 5), 'burnt-film', 100, 41)
  const lit = applyColorLabPreset(pixels(withHighlight, 5), 'burnt-film', 100, 41)
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

test('color presets do not carry hidden Grain or Dust settings', () => {
  for (const preset of colorLabPresets) {
    assert.equal('dustCount' in preset, false)
    assert.equal('abrasionDensity' in preset, false)
    assert.equal('scratchMax' in preset, false)
    assert.equal('fiberMax' in preset, false)
    assert.equal('grainStrength' in preset, false)
  }
})

test('preset lineup is exactly the requested final nine-film collection', () => {
  assert.deepEqual(colorLabPresets.map(({ id, name }) => ({ id, name })), [
    { id: 'original', name: 'Original' },
    { id: 'bw-instant', name: 'B&W Instant' },
    { id: 'dark-instant', name: 'Dark Instant' },
    { id: 'flash-90s', name: 'Flash 90s' },
    { id: 'golden-vintage', name: 'Golden Vintage' },
    { id: 'greenish-film', name: 'Greenish Film' },
    { id: 'faded-brown', name: 'Faded Brown' },
    { id: 'expired-film', name: 'Expired Film' },
    { id: 'burnt-film', name: 'Burnt Film' },
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
  const plan = createFilmDefectPlan('golden-vintage', 173, 1000, 1500)
  assert.deepEqual(plan, createFilmDefectPlan('golden-vintage', 173, 1000, 1500))
  assert.notDeepEqual(plan, createFilmDefectPlan('golden-vintage', 174, 1000, 1500))
  assert.equal(plan.dust.length, 975)
  assert.equal(plan.dust.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1), true)
  assert.equal(new Set(plan.dust.map(({ kind }) => kind)).size >= 3, true)
  assert.equal(plan.scratches.length >= 6 && plan.scratches.length <= 10, true)
  assert.equal(plan.scratches.every(({ x, yStart, yEnd, width, softness, interruptions }) => x >= 0 && x <= 1 && yStart >= 0 && yEnd <= 1 && yEnd > yStart && width >= 0.7 && width <= 2.8 && softness >= 0 && softness <= 1 && interruptions >= 1), true)
  assert.equal(plan.scratches.filter(({ yStart, yEnd }) => yEnd - yStart >= 0.4 && yEnd - yStart <= 0.95).length >= Math.ceil(plan.scratches.length * 0.45), true)
  assert.equal(plan.scratches.some(({ slope, curve }) => Math.abs(slope) > 0.02 && Math.abs(curve) > 0.005), true)
})

test('thumbnail, main, and export rasterize one area-scaled deterministic defect layout', () => {
  assert.equal(COLOR_LAB_RENDER_VERSION, 7)
  const thumbnail = createFilmDefectRaster(180, 135, 'golden-vintage', 307)
  const main = createFilmDefectRaster(1200, 900, 'golden-vintage', 307)
  const hd = createFilmDefectRaster(2400, 1800, 'golden-vintage', 307)
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
    const rendered = renderFilmImage(source, 'golden-vintage', 100, 401, { grain: true, dust: true })
    assert.notDeepEqual([...rendered.data], [...source.data])
    const raster = createFilmDefectRaster(width, height, 'golden-vintage', 401)
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
  const anotherColor = createFilmDefectPlan('expired-film', 601, 1200, 800)
  assert.deepEqual(toggledBackOn, first)
  assert.deepEqual(anotherColor, first)
})

test('Burnt Film uses stable normalized edge-damage geometry for the same photo', () => {
  const first = createBurnPlan(811)
  assert.deepEqual(createBurnPlan(811), first)
  assert.notDeepEqual(createBurnPlan(812), first)
  assert.equal(first.length >= 1 && first.length <= 4, true)
  assert.equal(first.every(({ x, yStart, yEnd, width, tilt, wobble, strength }) => [x, yStart, yEnd, width, tilt, wobble, strength].every(Number.isFinite) && yEnd - yStart >= 0.5 && yEnd - yStart <= 1.01 && width >= 0.03 && width <= 0.3 && strength > 0 && strength <= 1), true)
  assert.equal(first.some(({ x }) => x < 0 || x > 1), true)
})

test('Burnt Film edge damage is deterministic, spatially selective, and independent from optional effects', () => {
  const source = pixels(Array.from({ length: 120 * 80 }, () => [105, 120, 135]), 120)
  const clean = renderFilmImage(source, 'burnt-film', 100, 823, { grain: false, dust: false })
  const repeated = renderFilmImage(source, 'burnt-film', 100, 823, { grain: false, dust: false })
  const both = renderFilmImage(source, 'burnt-film', 100, 823, { grain: true, dust: true })
  assert.deepEqual([...repeated.data], [...clean.data])
  assert.notDeepEqual([...clean.data], [...source.data])
  assert.notDeepEqual([...both.data], [...clean.data])
  const deltaAt = (pixel: number) => Math.abs(clean.data[pixel * 4]! - source.data[pixel * 4]!) + Math.abs(clean.data[pixel * 4 + 1]! - source.data[pixel * 4 + 1]!) + Math.abs(clean.data[pixel * 4 + 2]! - source.data[pixel * 4 + 2]!)
  const borderPixels = Array.from({ length: 120 }, (_, x) => [x, 79 * 120 + x]).flat().concat(Array.from({ length: 78 }, (_, y) => [(y + 1) * 120, (y + 1) * 120 + 119]).flat())
  const edgeDelta = Math.max(...borderPixels.map(deltaAt))
  const center = (40 * 120 + 60) * 4
  const centerDelta = Math.abs(clean.data[center]! - source.data[center]!) + Math.abs(clean.data[center + 1]! - source.data[center + 1]!) + Math.abs(clean.data[center + 2]! - source.data[center + 2]!)
  assert.equal(edgeDelta > centerDelta, true)
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

test('preview runtime reuses one source and cached base color across effect toggles', () => {
  const source = pixels(Array.from({ length: 4096 }, (_, index) => [70 + index % 90, 85 + index % 70, 100 + index % 50]), 64)
  const before = [...source.data]
  const runtime = new ColorLabPreviewRuntime('source-a', source, 907)
  const clean = runtime.render('golden-vintage', 100, { grain: false, dust: false })
  const grain = runtime.render('golden-vintage', 100, { grain: true, dust: false })
  const dust = runtime.render('golden-vintage', 100, { grain: false, dust: true })
  const both = runtime.render('golden-vintage', 100, { grain: true, dust: true })
  assert.equal(runtime.metrics.baseRenders, 1)
  assert.equal(runtime.metrics.baseCacheHits, 3)
  assert.equal(runtime.metrics.grainGenerations, 1)
  assert.equal(runtime.metrics.dustGenerations, 1)
  assert.deepEqual([...source.data], before)
  assert.notDeepEqual([...clean.data], [...grain.data])
  assert.notDeepEqual([...clean.data], [...dust.data])
  assert.notDeepEqual([...both.data], [...grain.data])
})

test('preview base cache key separates preset and intensity while revisits hit cache', () => {
  const source = pixels(Array.from({ length: 1024 }, (_, index) => [80 + index % 70, 90 + index % 60, 110 + index % 40]), 32)
  const runtime = new ColorLabPreviewRuntime('source-b', source, 919)
  runtime.render('golden-vintage', 100, { grain: false, dust: false })
  runtime.render('expired-film', 100, { grain: false, dust: false })
  runtime.render('expired-film', 75, { grain: false, dust: false })
  runtime.render('expired-film', 100, { grain: false, dust: false })
  assert.equal(runtime.metrics.baseRenders, 3)
  assert.equal(runtime.metrics.baseCacheHits, 1)
})

test('latest preview request token rejects stale rapid preset results', () => {
  const requests = ['original', 'golden-vintage', 'burnt-film', 'expired-film', 'dark-instant', 'bw-instant'].map((presetId, index) => ({ presetId, requestId: index + 1 }))
  const latestRequestId = requests.at(-1)!.requestId
  assert.deepEqual(requests.filter(({ requestId }) => isLatestPreviewRequest(requestId, latestRequestId)).map(({ presetId }) => presetId), ['bw-instant'])
  assert.equal(isLatestPreviewRequest(2, 6), false)
  assert.equal(isLatestPreviewRequest(6, 6), true)
})

test('HD dimensions preserve aspect ratio and never upscale', () => {
  assert.deepEqual(fitWithinSource(4032, 3024, 4096), { width: 4032, height: 3024 })
  assert.deepEqual(fitWithinSource(8064, 6048, 4096), { width: 4096, height: 3072 })
  assert.equal(4096 / 3072, 8064 / 6048)
})

test('landscape, portrait, preview, and thumbnail dimensions are finite positive integers', () => {
  assert.deepEqual(fitColorLabDimensions(4032, 3024, 1600, 'preview'), { width: 1600, height: 1200 })
  assert.deepEqual(fitColorLabDimensions(3024, 4032, 1600, 'preview'), { width: 1200, height: 1600 })
  assert.deepEqual(fitColorLabDimensions(4032, 3024, 180, 'thumbnail'), { width: 180, height: 135 })
  assert.deepEqual(fitColorLabDimensions(3024, 4032, 180, 'Burnt Film thumbnail'), { width: 135, height: 180 })
})

test('invalid dimensions fail before NaN or Infinity can reach a canvas API', () => {
  for (const [width, height] of [[Number.NaN, 100], [100, Number.NaN], [Number.POSITIVE_INFINITY, 100], [0, 100], [-1, 100]]) {
    assert.throws(() => requireSafeDimensions(width, height, 'regression source'), /invalid regression source dimensions/)
  }
  assert.throws(() => fitColorLabDimensions(100, 100, Number.NaN, 'thumbnail'), /invalid thumbnail limit/)
})

test('processor rejects invalid geometry before Expired or Burnt Film processing', () => {
  const invalid = { width: Number.NaN, height: 1, data: new Uint8ClampedArray(4) }
  assert.throws(() => applyColorLabPreset(invalid, 'expired-film', 100, 1), /invalid processor dimensions/)
  assert.throws(() => applyColorLabPreset(invalid, 'burnt-film', 82, 1), /invalid processor dimensions/)
})
