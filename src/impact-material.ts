import type { AscentEnemyId } from './enemy-roster.ts'
import type { ImpactTarget } from './arena.ts'

export type Material = 'brass' | 'stone' | 'ice'
const surfaces: Partial<Record<AscentEnemyId, Material>> = {
  lock: 'brass',
  thorns: 'stone',
  freeze: 'ice',
}

export function impactMaterial(enemy: AscentEnemyId, target: ImpactTarget): Material | undefined {
  return target === 'enemy' ? surfaces[enemy] : undefined
}

// Local artwork, in whole pixels relative to the struck surface. Each fragment
// has a fixed path so a held or replayed frame draws exactly the same pixels.
export function drawMaterialChips(ctx: CanvasRenderingContext2D, material: Material, age: number,
  originX: number, originY: number, floor: number, px: number, heavy: boolean) {
  const duration = material === 'ice' ? 168 : material === 'brass' ? 188 : 226
  const t = (age - 12) / duration
  if (t <= 0 || t >= 1) return
  const ground = (floor - originY) / px
  const count = heavy ? (material === 'stone' ? 6 : 5) : 3
  const spread = heavy ? 1 : .65
  const dot = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(originX) + Math.round(x) * px, Math.round(originY) + Math.round(y) * px, w * px, h * px)
  }
  for (let i = 0; i < count; i++) {
    if (material === 'brass') {
      const x = (16 + (i * 13) % 28) * t * spread
      const y = Math.min(ground - 2, ((i - 2) * 19 * t + 17 * t * t) * spread)
      const width = t < .65 ? 5 : 2
      dot(x, y, width, 1, t < .55 ? '#d69337' : '#9d6730')
      dot(x + width, y + Math.sign(i - 2), 2, 1, '#ffe29a')
    } else if (material === 'stone') {
      const x = (i - 1) * 8 * t * spread
      const flight = ground * (1.4 + i * .18) * t * t - (10 + i * 3) * t
      const y = Math.min(flight, ground - 3) - Math.max(0, 4 - Math.abs(flight - ground - 6) * .65)
      const width = i % 2 ? 3 : 4
      dot(x, y, width, 3, '#796e60')
      dot(x + 1, y - 1, width - 1, 2, t < .65 ? '#dfcbb4' : '#a29586')
    } else {
      const x = (i - 1) * 12 * t * spread
      const y = Math.min(ground - 3, (-26 - (i * 13) % 24 + 64 * t) * t * spread)
      const cool = t > .46
      dot(x, y, 2, 3, cool ? '#5386a4' : '#8ad7e6')
      dot(x + 1, y - 2, 1, 3, cool ? '#83acbe' : '#e0ffff')
    }
  }
}
