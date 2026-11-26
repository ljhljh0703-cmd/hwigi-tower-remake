import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'

const [sharpModule, ...selected] = process.argv.slice(2)
assert.ok(sharpModule, 'Pass an installed sharp module folder')
const sharp = createRequire(import.meta.url)(sharpModule)
const root = new URL('../', import.meta.url)
const path = (relative) => new URL(relative, root)
const labels = {
  golem: '가시 골렘', lock: '자물쇠', freeze: '얼림', rage: '격노',
  reaction: '반격형', vitality: '체력 비례 일격', escort: '호위 소환 본체', 'escort-guard': '소환 호위병',
  'shield-soldier': '방패병', 'seal-sentinel': '봉인 파수꾼', 'iron-knight': '철갑 기사',
  boss: '12층 문지기', 'boss-special': '12층 문지기 특수', effects: '타격·얼림·봉인 효과',
}
const actorFrames = ['ready', 'anticipate', 'approach', 'contact', 'follow', 'reload',
  'repeat-contact', 'special-contact', 'hit', 'heavy-hit', 'fall', 'down']
const bossFrames = ['ready', 'charge-set', 'charge-peak', 'charge-contact', 'interrupted', 'knee-down',
  'knockdown', 'get-up', 'seal-set', 'seal-contact', 'seal-recover', 'defeated']
const effectFrames = ['chip-start', 'chip-burst', 'chip-spread', 'chip-end',
  'frost-start', 'frost-contact', 'frost-split', 'frost-end', 'seal-start', 'seal-contact', 'seal-break', 'seal-end']
const frontPicking = new Set([3, 6, 7])
const alpha = 158

async function rgba(file) {
  const { data, info } = await sharp(await readFile(path(file))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

// Prefer a transparent separator near each expected edge. This accounts for
// a small drift in source-sheet placement without retouching the drawing.
function separators(length, count, density) {
  const bounds = [0]
  for (let i = 1; i < count; i++) {
    const ideal = Math.round(length * i / count)
    const radius = Math.round(length / count * .14)
    let best = ideal, bestScore = Infinity
    for (let value = ideal - radius; value <= ideal + radius; value++) {
      const overhead = [-2, -1, 0, 1, 2].reduce((amount, padding) => amount + density(value + padding), 0)
      const score = overhead + Math.abs(value - ideal) * .017
      if (score < bestScore) { best = value; bestScore = score }
    }
    bounds.push(best)
  }
  return [...bounds, length]
}

function extract(source, left, right, top, bottom, effects = false) {
  const width = right - left, height = bottom - top
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    mask[y * width + x] = Number(source.data[((top + y) * source.width + left + x) * 4 + 3] >= alpha)
  }
  if (!effects) {
    const visited = new Uint8Array(mask.length)
    const components = []
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || visited[i]) continue
      const pixels = [i]
      visited[i] = 1
      for (let p = 0; p < pixels.length; p++) {
        const x = pixels[p] % width, y = Math.floor(pixels[p] / width)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, pos = ny * width + nx
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[pos] || visited[pos]) continue
          visited[pos] = 1
          pixels.push(pos)
        }
      }
      components.push(pixels)
    }
    const maximum = Math.max(0, ...components.map((pixels) => pixels.length))
    mask.fill(0)
    for (const pixels of components) {
      if (pixels.length >= maximum * .025) for (const pos of pixels) mask[pos] = 1
    }
  }
  let x0 = width, x1 = 0, y0 = height, y1 = 0, count = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1)
    y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1)
    count++
  }
  assert.ok(count >= (effects ? 45 : 200), 'Empty, merged, or misplaced source cell')
  const edge = x0 < 2 || x1 > width - 2 || y0 < 2 || y1 > height - 2
  const rear = []
  for (let x = x0; x < x1; x++) {
    for (let y = Math.max(y0, y1 - Math.ceil((y1 - y0) * .085)); y < y1; y++) {
      if (mask[y * width + x]) { rear.push(x); break }
    }
  }
  // For a left-facing actor the rear foot is on the right.
  const pivot = effects ? (x0 + x1) / 2 : rear[Math.floor((rear.length - 1) * .79)]
  return { mask, width, height, top, left, x0, x1, y0, y1, pivot, edge }
}

function splitSheet(source, effects) {
  const opaque = (x, y) => source.data[(y * source.width + x) * 4 + 3] >= alpha
  const ys = separators(source.height, 3, (y) => {
    let count = 0
    for (let x = 0; x < source.width; x++) count += Number(opaque(x, y))
    return count
  })
  return ys.slice(0, -1).flatMap((top, row) => {
    const xs = separators(source.width, 4, (x) => {
      let count = 0
      for (let y = top; y < ys[row + 1]; y++) count += Number(opaque(x, y))
      return count
    })
    return xs.slice(0, -1).map((left, col) => extract(source, left, xs[col + 1], top, ys[row + 1], effects))
  })
}

function reference(id) {
  const sprite = id === 'boss-special' ? 'boss' : id
  return 'public/art/' + sprite + '-idle.png'
}

async function paletteFor(id) {
  if (id === 'effects') {
    return { height: 28, colors: ['3c3b36', '776e61', 'a39784', 'd2c8b5', 'ece4d6', 'b8d6e2', '8cb4c8',
      '668799', '936643', 'bf9465', 'e2bf8a'].map(hex => [...Buffer.from(hex, 'hex')]) }
  }
  const sprite = await rgba(reference(id))
  const colors = new Map()
  let top = sprite.height, bottom = 0
  for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
    const offset = (y * sprite.width + x) * 4
    if (sprite.data[offset + 3] <= 200) continue
    top = Math.min(top, y)
    bottom = Math.max(bottom, y + 1)
    const key = sprite.data.subarray(offset, offset + 3).toString('hex')
    colors.set(key, (colors.get(key) ?? 0) + 1)
  }
  const entries = [...colors].sort((a, b) => b[1] - a[1]).slice(0, 24)
  return { height: bottom - top, colors: entries.map(([key]) => [...Buffer.from(key, 'hex')]) }
}

function nearest(palette, red, green, blue) {
  let value = palette[0], minimum = Infinity
  for (const candidate of palette) {
    const error = (red - candidate[0]) ** 2 + (green - candidate[1]) ** 2 * 1.35 + (blue - candidate[2]) ** 2
    if (error < minimum) { value = candidate; minimum = error }
  }
  return value
}

async function nativeFrame(source, cell, ratio, colors) {
  const width = cell.x1 - cell.x0, height = cell.y1 - cell.y0
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!cell.mask[(cell.y0 + y) * cell.width + cell.x0 + x]) continue
    const a = ((cell.top + cell.y0 + y) * source.width + cell.left + cell.x0 + x) * 4
    source.data.copy(pixels, (y * width + x) * 4, a, a + 4)
  }
  const w = Math.max(1, Math.round(width / ratio)), h = Math.max(1, Math.round(height / ratio))
  const native = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .resize(w, h, { fit: 'fill' }).raw().toBuffer()
  let solids = 0
  for (let i = 0; i < native.length; i += 4) {
    if (native[i + 3] < 130) {
      native.fill(0, i, i + 4)
      continue
    }
    const match = nearest(colors, native[i], native[i + 1], native[i + 2])
    native[i] = match[0]; native[i + 1] = match[1]; native[i + 2] = match[2]; native[i + 3] = 255
    solids++
  }
  return { pixels: native, w, h, pivot: Math.round((cell.pivot - cell.x0) / ratio), solids, edge: cell.edge }
}

function attackTip(frame, xOffset, yOffset) {
  const start = Math.round(frame.h * .18), end = Math.round(frame.h * .68)
  for (let x = 0; x < frame.w; x++) {
    for (let y = start; y <= end; y++) {
      if (frame.pixels[(y * frame.w + x) * 4 + 3]) return [xOffset + x, yOffset + y]
    }
  }
  return null
}

async function compile(id) {
  const effects = id === 'effects'
  const source = await rgba('art-source/enemy-motion/raw/' + id + '.png')
  const cells = splitSheet(source, effects)
  const { height, colors } = await paletteFor(id)
  const ratio = effects ? Math.max(...cells.map(({ y1, y0, x1, x0 }) => Math.max(y1 - y0, x1 - x0))) / 24
    : (cells[0].y1 - cells[0].y0) / height
  const frames = await Promise.all(cells.map((cell) => nativeFrame(source, cell, ratio, colors)))
  const pivotX = Math.max(...frames.map(({ pivot }) => pivot)) + 4
  const tallest = Math.max(...frames.map(({ h }) => h))
  const pivotY = (effects ? Math.ceil(tallest / 2) : tallest) + 3
  const cellWidth = pivotX + Math.max(...frames.map(({ w, pivot }) => w - pivot)) + 4
  const cellHeight = tallest + 7
  const width = cellWidth * 4, rows = 3
  const sheet = Buffer.alloc(width * cellHeight * rows * 4)
  const names = effects ? effectFrames : id === 'boss-special' ? bossFrames : actorFrames
  const contact = effects ? new Set() : id === 'boss-special' ? new Set([3, 9]) : frontPicking
  const metadata = frames.map((frame, index) => {
    assert.ok(frame.solids >= (effects ? 3 : 12), id + ' native cell is empty ' + index)
    const column = index % 4, row = Math.floor(index / 4)
    const x = pivotX - frame.pivot, y = pivotY - (effects ? Math.ceil(frame.h / 2) : frame.h)
    for (let dy = 0; dy < frame.h; dy++) {
      const lineStart = ((row * cellHeight + y + dy) * width + column * cellWidth + x) * 4
      frame.pixels.copy(sheet, lineStart, dy * frame.w * 4, (dy + 1) * frame.w * 4)
    }
    return { id: names[index], index, rect: [column * cellWidth, row * cellHeight, cellWidth, cellHeight],
      bounds: [x, y, frame.w, frame.h], alphaPixels: frame.solids, drawing: createHash('sha256').update(frame.pixels).digest('hex').slice(0, 12),
      ...(contact.has(index) ? { candidateContact: attackTip(frame, x, y) } : {}),
      ...(frame.edge ? { sourceEdge: true } : {}) }
  })
  const output = 'art-source/enemy-motion/atlases/' + id + '.png'
  await sharp(sheet, { raw: { width, height: cellHeight * rows, channels: 4 } }).png().toFile(fileURLToPath(path(output)))
  await mkdir(path('public/art/motion/'), { recursive: true })
  await copyFile(path(output), path('public/art/motion/' + id + '.png'))
  return { id, label: labels[id], source: 'art-source/enemy-motion/raw/' + id + '.png', sheet: output,
    frameCount: frames.length, width, height: cellHeight * rows, pivot: [pivotX, pivotY],
    reference: effects ? null : reference(id), frames: metadata }
}

const results = []
for (const id of selected.length ? selected : Object.keys(labels)) {
  assert.ok(id in labels, 'Unknown sheet ' + id)
  const entry = await compile(id)
  results.push(entry)
  console.log(id, entry.width + 'x' + entry.height, entry.frames.length, 'frames')
}
if (selected.length === 0) {
  await writeFile(path('art-source/enemy-motion/manifest.json'), JSON.stringify({ version: 1, sheets: results }, null, 2) + '\n')
}
