// The cells in a motion sheet contain transparent padding. Partition only the
// illustrated pixels, retaining their original colour and alpha in every shard.
type Fragment = { image: HTMLCanvasElement; x: number; y: number }
export const fracture = { release: 84, firstLanding: 348, settled: 540, end: 700 } as const
const sites = [[.14,.12], [.54,.14], [.87,.23], [.28,.42], [.66,.46],
  [.06,.69], [.43,.72], [.88,.66], [.24,.94], [.73,.92]]

export function splitSilhouette(sheet: ImageData, rect: readonly number[]): Fragment[] {
  const [sx, sy, width, height] = rect
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!sheet.data[((sy + y) * sheet.width + sx + x) * 4 + 3]) continue
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  const groups = sites.map(() => [] as { x: number; y: number; offset: number }[])
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const offset = ((sy + y) * sheet.width + sx + x) * 4
    if (!sheet.data[offset + 3]) continue
    let nearest = 0, distance = Infinity
    for (const [i, [u, v]] of sites.entries()) {
      const d = (x - left - u * (right - left)) ** 2 + (y - top - v * (bottom - top)) ** 2
      if (d < distance) { distance = d; nearest = i }
    }
    groups[nearest].push({ x, y, offset })
  }
  return groups.filter(group => group.length).map(group => {
    const xs = group.map(p => p.x), ys = group.map(p => p.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    const image = document.createElement('canvas')
    image.width = Math.max(...xs) - x + 1
    image.height = Math.max(...ys) - y + 1
    const ctx = image.getContext('2d')!
    const pixels = ctx.createImageData(image.width, image.height)
    for (const p of group) pixels.data.set(sheet.data.subarray(p.offset, p.offset + 4),
      ((p.y - y) * image.width + p.x - x) * 4)
    ctx.putImageData(pixels, 0, 0)
    return { image, x, y }
  })
}

export function scatterBody(ctx: CanvasRenderingContext2D, pieces: Fragment[], originX: number, originY: number,
  foot: number, ground: number, scale: number, age: number) {
  for (const [i, piece] of pieces.entries()) {
    const { image } = piece
    const flight = fracture.firstLanding - fracture.release + (i * 19) % 106
    const t = Math.min(1, Math.max(0, (age - fracture.release) / flight))
    const bounce = Math.max(0, Math.min(1, (age - fracture.release - flight) / 76))
    // Quarter-turns keep the illustrated pixel grid square and crisp.
    const turned = t > .4 && i % 3 !== 0
    const size = Math.max(1, Math.round(scale * (1 - .32 * t)))
    const w = (turned ? image.height : image.width) * size
    const h = (turned ? image.width : image.height) * size
    const launchX = originX + (piece.x + image.width / 2) * scale
    const launchY = originY + (piece.y + image.height / 2) * scale
    const spread = (i * 7 % 11 - 3) * 3.7
    const landingX = Math.max(w / 2 + 2, Math.min(ctx.canvas.width - w / 2 - 2, foot + spread * scale))
    const landingY = ground + ((i * 5) % 9) * size - h / 2
    const x = launchX + (landingX - launchX) * (1 - (1 - t) ** 2)
    const y = launchY + (landingY - launchY) * t * t - (8 + (i * 11) % 16) * scale * 4 * t * (1 - t)
      - 3 * size * 4 * bounce * (1 - bounce)
    ctx.save()
    ctx.translate(Math.round(x - w / 2) + (turned ? w : 0), Math.round(y - h / 2))
    if (turned) ctx.rotate(Math.PI / 2)
    ctx.drawImage(image, 0, 0, image.width * size, image.height * size)
    ctx.restore()
  }
}
