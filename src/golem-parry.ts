import { fracture } from './body-fragments.ts'

export const GOLEM_PARRY = {
  art: 'golem-parry',
  contact: 280,
  release: 328,
  landing: 448,
  end: 460,
}

export const GOLEM_COUNTER = {
  art: 'golem-counter',
  contact: 166,
  end: 505,
}

const swingLead = 214
const parryCels = [
  [0, 0], [31, 1], [70, 2], [110, 3], [154, 4], [swingLead, 12],
  [GOLEM_PARRY.contact, 5], [GOLEM_PARRY.release, 6], [353, 13], [380, 7], [406, 8], [431, 9],
] as const
const counterCels = [
  [0, 0], [45, 1], [88, 2], [125, 3], [GOLEM_COUNTER.contact, 4],
  [226, 5], [310, 6], [412, 7],
] as const
const cell = { width: 72, height: 44, floor: 40, hero: 18, golem: 52 }

type Actor = { foot: number; scale: number }
type Pose = readonly [at: number, index: number]

const progress = (value: number) => Math.max(0, Math.min(1, value))
const ease = (value: number) => { const t = progress(value); return t * t * (3 - 2 * t) }
const between = (from: number, to: number, t: number) => from + (to - from) * t

function poseAt(cels: readonly Pose[], elapsed: number) {
  let index = 0
  while (index + 1 < cels.length && cels[index + 1][0] <= elapsed) index++
  return cels[index][1]
}

function positions(width: number, density: number, hero: Actor, enemy: Actor) {
  const scale = Math.max(1, Math.min(hero.scale, Math.floor((width - 58 * density) / 96)))
  const margin = 9 * density
  const heroFoot = Math.round(Math.max(margin + 10 * scale,
    Math.min(hero.foot - 4 * scale, width - margin - 78 * scale - 42 * density)))
  // Calibrated to the rear feet in the two shared contact drawings.
  const meet = heroFoot + 63 * scale
  const safeEdge = width - margin - 16 * scale
  const home = Math.min(safeEdge, Math.round(enemy.foot + 6 * enemy.scale))
  const frozen = Math.max(meet, Math.min(meet + 42 * density, safeEdge))
  return { scale, heroFoot, meet, safeEdge, home, frozen }
}

function actors(context: CanvasRenderingContext2D, art: HTMLImageElement, pose: number,
  scale: number, floor: number, heroFoot: number, golemFoot: number, showEnemy = true) {
  const top = floor - cell.floor * scale
  const draw = (row: number, foot: number, pivot: number) => {
    context.drawImage(art, pose * cell.width, row * cell.height, cell.width, cell.height,
      Math.round(foot - pivot * scale), top, cell.width * scale, cell.height * scale)
  }
  if (showEnemy) draw(1, golemFoot, cell.golem)
  draw(0, heroFoot, cell.hero)
}

function clash(context: CanvasRenderingContext2D, x: number, y: number, unit: number, age: number, counter = false) {
  const duration = counter ? 82 : 78
  if (age < 0 || age >= duration) return
  const mark = (dx: number, dy: number, w: number, h: number) =>
    context.fillRect(Math.round(x + dx * unit), Math.round(y + dy * unit), w * unit, h * unit)
  context.save()
  context.globalAlpha = 1 - progress((age - 22) / (duration - 22))
  context.fillStyle = counter ? '#e99852' : '#b8e0ed'
  mark(-8, 0, 17, 2)
  mark(-1, -6, 3, 12)
  mark(-6, 3, 3, 1)
  mark(5, -4, 3, 1)
  mark(-5, -3, 2, 1)
  mark(4, 4, 3, 1)
  context.fillStyle = '#fff4d6'
  mark(-4, -1, 9, 3)
  mark(0, -4, 1, 9)
  context.restore()
}

function rockChips(context: CanvasRenderingContext2D, foot: number, floor: number, scale: number, age: number, counter = false) {
  if (age < 0 || age > 122) return
  context.save()
  context.globalAlpha = 1 - age / 122
  context.fillStyle = counter ? '#b8a897' : '#a49986'
  for (let i = 0; i < 5; i++) {
    const x = foot + ((i - 3) * 2 + age / (15 - i)) * scale
    const y = floor - ((i % 3) + 1 + age / (counter ? 19 : 34)) * scale
    context.fillRect(Math.round(x), Math.round(y), scale, Math.max(1, Math.round(scale * .6)))
  }
  context.restore()
}

export function drawGolemParry(
  context: CanvasRenderingContext2D, art: HTMLImageElement, elapsed: number,
  floor: number, density: number, hero: Actor, enemy: Actor,
) {
  const { scale, heroFoot, meet, safeEdge, home, frozen } = positions(context.canvas.width, density, hero, enemy)
  const loaded = Math.min(safeEdge, meet + 10 * scale)
  let golemFoot = elapsed < swingLead
    ? between(home, loaded, ease((elapsed - 68) / (swingLead - 68)))
    : between(loaded, meet, ease((elapsed - swingLead) / (GOLEM_PARRY.contact - swingLead)))
  if (elapsed >= GOLEM_PARRY.release) {
    const travel = progress((elapsed - GOLEM_PARRY.release) / 108)
    golemFoot = between(meet, frozen, 1 - (1 - travel) ** 2)
  }
  actors(context, art, poseAt(parryCels, elapsed), scale, floor, heroFoot, golemFoot)
  clash(context, heroFoot + 27 * scale, floor - 22 * scale,
    Math.max(1, Math.round(scale * .75)), elapsed - GOLEM_PARRY.contact)
  rockChips(context, golemFoot, floor, scale, elapsed - GOLEM_PARRY.landing)
}

export function drawGolemCounter(
  context: CanvasRenderingContext2D, art: HTMLImageElement, parryArt: HTMLImageElement, elapsed: number,
  floor: number, density: number, hero: Actor, enemy: Actor, defeated: boolean,
  drawFragments: (rect: number[], pivot: number[], foot: number, scale: number, age: number) => boolean,
) {
  const { scale, heroFoot, safeEdge, home, frozen } = positions(context.canvas.width, density, hero, enemy)
  if (elapsed < 34) {
    drawGolemParry(context, parryArt, GOLEM_PARRY.end, floor, density, hero, enemy)
    return
  }
  const hit = elapsed - GOLEM_COUNTER.contact
  const arrive = ease((elapsed - 74) / 92)
  const recover = ease((elapsed - 266) / 225)
  const stride = Math.max(0, frozen - heroFoot - 52 * scale)
  const heroX = heroFoot + stride * arrive * (1 - recover)
  const golemX = between(Math.min(safeEdge, frozen + 4 * density * ease((hit - 48) / 82)), home, recover)
  // Cell 5 is the recoiling full body immediately before it breaks.
  const broken = defeated && hit >= fracture.release && drawFragments(
    [5 * cell.width, cell.height, cell.width, cell.height], [cell.golem, cell.floor],
    Math.min(safeEdge, frozen + 2 * density), scale, hit)
  actors(context, art, poseAt(counterCels, elapsed), scale, floor, heroX, golemX, !broken)
  clash(context, golemX - 15 * scale, floor - 31 * scale,
    Math.max(1, Math.round(scale * .86)), hit, true)
  rockChips(context, golemX - 8 * scale, floor, scale, hit - 46, true)
}
