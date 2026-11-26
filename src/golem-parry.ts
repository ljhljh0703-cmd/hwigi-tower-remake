export const GOLEM_PARRY = {
  art: 'golem-parry',
  contact: 218,
  release: 338,
  landing: 438,
  end: 566,
}

const swingLead = 185
const frames = [
  [0, 0], [34, 1], [75, 2], [118, 3], [155, 4], [swingLead, 12],
  [GOLEM_PARRY.contact, 5], [270, 6], [298, 13], [325, 7],
  [356, 8], [386, 9], [413, 14], [GOLEM_PARRY.landing, 10], [468, 15], [507, 11],
] as const
const cell = { width: 72, height: 44, floor: 40, hero: 18, golem: 52 }

type Actor = { foot: number; scale: number }

const progress = (value: number) => Math.max(0, Math.min(1, value))
const ease = (value: number) => { const t = progress(value); return t * t * (3 - 2 * t) }
const between = (from: number, to: number, t: number) => from + (to - from) * t

export function drawGolemParry(
  context: CanvasRenderingContext2D, art: HTMLImageElement, elapsed: number,
  floor: number, density: number, hero: Actor, enemy: Actor,
) {
  const width = context.canvas.width
  const scale = Math.max(1, Math.min(hero.scale, Math.floor((width - 58 * density) / 96)))
  const margin = 9 * density
  const heroFoot = Math.round(Math.max(margin + 10 * scale,
    Math.min(hero.foot - 4 * scale, width - margin - 78 * scale - 42 * density)))
  // The two contact drawings use the same offset between the marked rear feet.
  const meet = heroFoot + 63 * scale
  const home = Math.round(enemy.foot + 6 * enemy.scale)
  const safeEdge = width - margin - 16 * scale
  const loaded = Math.min(safeEdge, meet + 10 * scale)
  const ready = Math.min(safeEdge, home)
  const slip = Math.max(0, Math.min(42 * density, safeEdge - meet))
  let golemFoot = elapsed < swingLead
    ? between(ready, loaded, ease((elapsed - 68) / (swingLead - 68)))
    : between(loaded, meet, ease((elapsed - swingLead) / (GOLEM_PARRY.contact - swingLead)))
  if (elapsed >= GOLEM_PARRY.release) {
    golemFoot = meet + slip * ease((elapsed - GOLEM_PARRY.release) / 96)
  }
  if (elapsed >= GOLEM_PARRY.landing) {
    golemFoot = between(golemFoot, home, ease((elapsed - GOLEM_PARRY.landing) / (GOLEM_PARRY.end - GOLEM_PARRY.landing)))
  }
  let index = 0
  while (index + 1 < frames.length && frames[index + 1][0] <= elapsed) index++
  const pose = frames[index][1]
  const top = floor - cell.floor * scale
  const draw = (row: number, foot: number, pivot: number) => {
    context.drawImage(art, pose * cell.width, row * cell.height, cell.width, cell.height,
      Math.round(foot - pivot * scale), top, cell.width * scale, cell.height * scale)
  }
  draw(1, golemFoot, cell.golem)
  draw(0, heroFoot, cell.hero)

  const spark = elapsed - GOLEM_PARRY.contact
  if (spark >= 0 && spark < 64) {
    const x = heroFoot + 27 * scale
    const y = floor - 22 * scale
    const unit = Math.max(1, Math.round(scale * .66))
    const mark = (dx: number, dy: number, w: number, h: number) =>
      context.fillRect(x + dx * unit, y + dy * unit, w * unit, h * unit)
    context.save()
    context.globalAlpha = 1 - progress((spark - 24) / 40)
    context.fillStyle = '#d8e5ec'
    mark(-7, 0, 15, 1)
    mark(-1, -4, 3, 9)
    mark(-5, -3, 2, 1)
    mark(4, 3, 3, 1)
    context.fillStyle = '#fff9e7'
    mark(-3, -1, 7, 3)
    mark(0, -3, 1, 7)
    context.restore()
  }

  const dust = elapsed - GOLEM_PARRY.landing
  if (dust >= 0 && dust < 118) {
    context.save()
    context.globalAlpha = 1 - dust / 118
    context.fillStyle = '#b2a691'
    for (let i = 0; i < 5; i++) {
      const x = golemFoot + ((i - 2) * 2 + dust / 16) * scale
      const y = floor - ((i % 3) + 1 + dust / 34) * scale
      context.fillRect(Math.round(x), Math.round(y), scale, Math.max(1, Math.round(scale * .56)))
    }
    context.restore()
  }
}
