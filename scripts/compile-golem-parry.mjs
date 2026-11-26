import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const sharpPath = process.argv[2]
assert(sharpPath, 'Pass the sharp module path from the art workstation')
const sharp = createRequire(import.meta.url)(sharpPath)
const root = import.meta.dirname + '/..'
const open = (name) => sharp(root + '/art-source/' + name + '.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const [keys, inbetweens] = await Promise.all([open('golem-parry-poses'), open('golem-parry-inbetweens')])
assert.deepEqual([keys.info.width, keys.info.height, inbetweens.info.width, inbetweens.info.height], [1448, 1086, 1448, 1086])
const size = { width: 72, height: 44, baseline: 40, heroAnchor: 18, golemAnchor: 52 }
const palette = ['252522', '343430', '56534b', '898378', 'b2a691', 'e1d8c8', '40536d']
  .map((hex) => [...Buffer.from(hex, 'hex')])
const heroBoot = [72, 63, 64, 65, 65, 62, 61, 60, 65, 63, 64, 73]
const golemBoot = [284, 303, 307, 316, 314, 314, 312, 291, 278, 267, 308, 285]
// These two drawings share opaque pixels at the blade/arm junction. Use a cut
// through the junction, then rejoin at the original spacing on those cels.
const joined = new Map([[5, 173], [6, 208]])
const cel = (sheet, columns, tileWidth, tileHeight, pixel, index, ground, hero, golem, seam) => ({
  ...sheet, tileWidth, tileHeight, pixel,
  left: index % columns * tileWidth, top: Math.floor(index / columns) * tileHeight,
  ground, hero, golem, seam,
})
const drawings = [
  ...heroBoot.map((boot, i) => cel(keys, 4, 362, 362, 4, i, i < 4 ? 291 : 290, boot, golemBoot[i], joined.get(i))),
  ...[[128, 629, 416], [89, 570, 416], [151, 557, 387], [141, 562, 387]].map(
    ([hero, golem, ground], i) => cel(inbetweens, 2, 724, 543, 7, i, ground, hero, golem)),
]
const width = size.width * drawings.length
const atlas = Buffer.alloc(width * size.height * 2 * 4)

function closest(r, g, b) {
  if (b - r > 15 && b - g > 7) return palette[6]
  let best = palette[0], distance = Infinity
  for (const color of palette.slice(0, 6)) {
    const delta = (color[0] - r) ** 2 + (color[1] - g) ** 2 * 1.4 + (color[2] - b) ** 2
    if (delta < distance) { best = color; distance = delta }
  }
  return best
}

function splitCell({ left, top, data, info, tileWidth, tileHeight, ground, seam }, index) {
  const alphaAt = (x, y) => data[((top + y) * info.width + left + x) * 4 + 3]
  const firstRow = Math.max(0, ground - 285)
  const lastRow = Math.min(tileHeight, ground + 3)
  const masks = new Uint8Array(tileWidth * tileHeight)
  if (seam) {
    for (let y = firstRow; y < lastRow; y++) {
      for (let x = 0; x < tileWidth; x++) if (alphaAt(x, y) >= 186) masks[y * tileWidth + x] = x < seam ? 1 : 2
    }
    return masks
  }
  const seen = new Uint8Array(tileWidth * tileHeight)
  const components = []
  for (let y = firstRow; y < lastRow; y++) for (let x = 0; x < tileWidth; x++) {
    const i = y * tileWidth + x
    if (seen[i] || alphaAt(x, y) < 186) continue
    const cells = [i]
    seen[i] = 1
    for (let j = 0; j < cells.length; j++) {
      const pos = cells[j]
      const px = pos % tileWidth, py = Math.floor(pos / tileWidth)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy
        const next = ny * tileWidth + nx
        if (nx < 0 || nx >= tileWidth || ny < firstRow || ny >= lastRow || seen[next] || alphaAt(nx, ny) < 186) continue
        seen[next] = 1
        cells.push(next)
      }
    }
    if (cells.length > 1000) components.push({ cells, left: cells.reduce((min, pos) => Math.min(min, pos % tileWidth), tileWidth) })
  }
  assert.equal(components.length, 2, 'Two complete silhouettes in drawing ' + (index + 1))
  components.sort((a, b) => a.left - b.left).forEach(({ cells }, actor) => {
    for (const pos of cells) masks[pos] = actor + 1
  })
  return masks
}

for (const [index, drawing] of drawings.entries()) {
  const { data, info, left, top, hero, golem, tileWidth, pixel, ground } = drawing
  const masks = splitCell(drawing, index)
  for (let y = 0; y < size.height; y++) for (let x = 0; x < tileWidth / pixel; x++) {
    const sy = ground + (y - size.baseline) * pixel
    const swatch = [{ count: 0, r: 0, g: 0, b: 0 }, { count: 0, r: 0, g: 0, b: 0 }]
    for (let dy = 0; dy < pixel; dy++) for (let dx = 0; dx < pixel; dx++) {
      const sx = x * pixel + dx
      const actor = masks[(sy + dy) * tileWidth + sx]
      if (sx >= tileWidth || !actor) continue
      const from = ((top + sy + dy) * info.width + left + sx) * 4
      const color = swatch[actor - 1]
      color.count++
      color.r += data[from]
      color.g += data[from + 1]
      color.b += data[from + 2]
    }
    const actor = Number(swatch[1].count > swatch[0].count)
    const { count, r, g, b } = swatch[actor]
    if (count < pixel * pixel * .43) continue
    const rootX = Math.round((actor === 0 ? hero : golem) / pixel)
    const anchor = actor === 0 ? size.heroAnchor : size.golemAnchor
    const col = anchor + x - rootX
    assert.ok(col >= 0 && col < size.width, 'Drawing exceeds its cell ' + (index + 1))
    const to = ((actor * size.height + y) * width + index * size.width + col) * 4
    const color = closest(r / count * 1.06, g / count * 1.06, b / count * 1.06)
    atlas[to] = color[0]
    atlas[to + 1] = color[1]
    atlas[to + 2] = color[2]
    atlas[to + 3] = 255
  }
}
await sharp(atlas, { raw: { width, height: size.height * 2, channels: 4 } })
  .png({ palette: true, colours: 8, dither: 0 })
  .toFile(root + '/public/art/golem-parry.png')
