import type { Material } from './impact-material.ts'

// Coordinates and velocities belong to the illustrated silhouette, not the atlas padding.
type Fragment = { image: HTMLCanvasElement; x: number; y: number; site: number; lane: number; arc: number }
type Flight = { lane: number; arc: number; duration: number }
type FractureFlight = Readonly<Partial<Record<number, Flight>>>
export const fracture = { release: 84, firstLanding: 348, settled: 540, end: 700 } as const
// Head and shoulder fragments carry the longest arcs. The heavy centre drops near the feet.
const sites = [
  { u: .26, v: .17, lane: -.70, arc: 14 }, { u: .72, v: .18, lane: .72, arc: 17 },
  { u: .10, v: .50, lane: -1, arc: 8 }, { u: .48, v: .47, lane: .02, arc: 7 },
  { u: .89, v: .55, lane: 1, arc: 11 }, { u: .29, v: .84, lane: -.36, arc: 4 },
  { u: .69, v: .86, lane: .38, arc: 5 },
]

// Whole fragments retain the pixels of the hit pose. These overrides affect
// only the flight of the atlas regions that carry each boss's landmarks.
export const bossFragmentFlights: Readonly<Partial<Record<string, FractureFlight>>> = {
  'chain-warden-hit': {
    3: { lane: -.64, arc: 19, duration: 322 }, // exposed chain
    4: { lane: .99, arc: 17, duration: 344 }, // bronze shoulder
    5: { lane: -.96, arc: 5, duration: 264 }, // heavy flail
  },
  'motion/boss': {
    1: { lane: .91, arc: 23, duration: 343 }, // red shoulder mark
    5: { lane: -.82, arc: 6, duration: 284 }, // knee on the planted leg
  },
  'motion/upper-boss': {
    0: { lane: -.98, arc: 9, duration: 264 }, // hammer head
    1: { lane: .86, arc: 23, duration: 350 }, // barred hood
    3: { lane: .64, arc: 15, duration: 303 }, // broken wrists and rings
  },
}

export function splitSilhouette(sheet: ImageData, rect: readonly number[], material?: Material): Fragment[] {
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
  const lit = material === 'ice' ? [186, 221, 231] : material === 'brass' ? [226, 184, 112] : [213, 199, 175]
  const side = material === 'ice' ? [136, 169, 182] : material === 'brass' ? [175, 132, 77] : [159, 144, 123]
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const offset = ((sy + y) * sheet.width + sx + x) * 4
    if (!sheet.data[offset + 3]) continue
    let nearest = 0, distance = Infinity
    for (const [i, { u, v }] of sites.entries()) {
      const d = (x - left - u * (right - left)) ** 2 + (y - top - v * (bottom - top)) ** 2
      if (d < distance) { distance = d; nearest = i }
    }
    groups[nearest].push({ x, y, offset })
  }
  return groups.flatMap((group, index) => {
    if (!group.length) return []
    const xs = group.map(p => p.x), ys = group.map(p => p.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    const image = document.createElement('canvas')
    image.width = Math.max(...xs) - x + 3
    image.height = Math.max(...ys) - y + 3
    const ctx = image.getContext('2d')!
    const pixels = ctx.createImageData(image.width, image.height)
    const offset = (p: typeof group[number]) => ((p.y - y + 1) * image.width + p.x - x + 1) * 4
    const face = new Uint8Array(image.width * image.height)
    for (const p of group) face[offset(p) / 4] = 1
    for (const p of group) {
      const at = offset(p), texel = at / 4
      const cut = (dx: number, dy: number) => {
        const x = p.x + dx, y = p.y + dy
        return x >= left && x <= right && y >= top && y <= bottom &&
          !face[texel + dx + dy * image.width] && sheet.data[p.offset + 4 * (dx + dy * sheet.width) + 3] > 0
      }
      // The cast lip exists only on the unlit side of a newly broken surface.
      // It never runs around a fragment or replaces an existing silhouette.
      const underside = cut(0, 1), returnEdge = cut(1, 0)
      if (underside) pixels.data.set([39, 32, 30, 116], at + image.width * 4)
      if (returnEdge) pixels.data.set([48, 39, 35, 78], at + 4)
      const cap = cut(0, -1), flank = cut(-1, 0)
      const inset = !cap && face[texel - image.width] && cut(0, -2)
      const light = cap ? lit : side
      const mix = cap ? .86 : flank ? .64 : inset ? .38 : 0
      const [r, g, b, alpha] = sheet.data.subarray(p.offset, p.offset + 4)
      const value = (r + 2 * g + b) / 4
      // Neutral middle values pick up reflected light on the exposed plane.
      // Keep deep joints, highlights, saturated markings and pixel placement.
      const bounce = Math.max(r, g, b) - Math.min(r, g, b) < 22 && value > 38
        ? Math.max(0, 38 - Math.abs(value - 74) * .78) * (1 - .35 * (p.y - y) / (image.height - 2)) : 0
      for (let c = 0; c < 3; c++) {
        const base = sheet.data[p.offset + c] + bounce
        const facet = base + Math.max(0, light[c] - base) * mix
        pixels.data[at + c] = Math.round(!mix && (underside || returnEdge) ? facet * .68 : facet)
      }
      pixels.data[at + 3] = alpha
    }
    ctx.putImageData(pixels, 0, 0)
    return [{ image, x: x - 1, y: y - 1, site: index, lane: sites[index].lane, arc: sites[index].arc }]
  })
}

export function scatterBody(ctx: CanvasRenderingContext2D, pieces: Fragment[], originX: number, originY: number,
  foot: number, ground: number, scale: number, age: number, density: number, ceiling: number, profile?: FractureFlight) {
  const width = ctx.canvas.width
  const radius = Math.min(22 * scale, width * .24)
  const margin = Math.max(...pieces.map(({ image }) => Math.max(image.width, image.height))) * scale / 2 + 5 * density
  const center = Math.max(margin + radius, Math.min(width - margin - radius, foot + 4 * scale))
  const poses = pieces.map((piece, i) => {
    const { image } = piece
    const custom = profile?.[piece.site]
    const flight = custom?.duration ?? fracture.firstLanding - fracture.release + (i * 19) % 106
    const t = Math.min(1, Math.max(0, (age - fracture.release) / flight))
    const bounce = Math.max(0, Math.min(1, (age - fracture.release - flight) / 76))
    // Quarter-turns keep the illustrated pixel grid square and crisp.
    const turned = t > .4 && i % 3 !== 0
    const size = Math.max(1, Math.round(scale * (1 - .32 * t)))
    const w = (turned ? image.height : image.width) * size
    const h = (turned ? image.width : image.height) * size
    const launchX = originX + (piece.x + image.width / 2) * scale
    const launchY = originY + (piece.y + image.height / 2) * scale
    const landingX = center + (custom?.lane ?? piece.lane) * radius
    const base = ground + (2 + i % 3 * 3) * density
    const landingY = base - h / 2
    const x = launchX + (landingX - launchX) * (1 - (1 - t) ** 2)
    const arc = Math.min((custom?.arc ?? piece.arc) * scale, Math.max(0, launchY - h / 2 - ceiling))
    const y = launchY + (landingY - launchY) * t * t - arc * 4 * t * (1 - t)
      - 3 * size * 4 * bounce * (1 - bounce)
    return { image, turned, size, w, h, x, y, base, t }
  })
  // Paint all shadows on the floor before the first fragment. The stepped
  // penumbra resolves into a short contact edge as each foot of stone lands.
  const px = Math.max(1, Math.round(density))
  for (const { x, w, base, t } of poses) {
    if (t > .55) {
      const opacity = (t - .55) / .45
      const half = Math.max(2 * px, Math.round(w * (.22 + .27 * t)))
      const left = Math.round(x - half + px), top = Math.round(base - 3 * px)
      ctx.fillStyle = 'rgba(43,35,32,' + .30 * opacity + ')'
      ctx.fillRect(left, top + px, half * 2, 3 * px)
      ctx.fillStyle = 'rgba(40,32,31,' + .64 * opacity + ')'
      ctx.fillRect(left + 2 * px, top, Math.max(px, half * 2 - 4 * px), 3 * px)
    }
  }
  for (const { image, turned, size, w, h, x, y } of poses) {
    ctx.save()
    ctx.translate(Math.round(x - w / 2) + (turned ? w : 0), Math.round(y - h / 2))
    if (turned) ctx.rotate(Math.PI / 2)
    ctx.drawImage(image, 0, 0, image.width * size, image.height * size)
    ctx.restore()
  }
}
