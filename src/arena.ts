import { atlasCell, frame, readyFrame, attackFrame, hurtFrame } from './enemy-motion.ts'
import type { MotionFrame } from './enemy-motion.ts'
import type { EnemyIntent } from './combat.ts'
import { enemyIntentAt, incomingAttack, splitEnemyDamage } from './combat.ts'
import type { Exchange } from './combat.ts'
import type { AscentEnemyId } from './enemy-roster.ts'
import { yachtAllocationTotals } from './yacht-combat.ts'
import type { YachtBattle } from './yacht-combat.ts'
import { drawGolemCounter, drawGolemParry, GOLEM_COUNTER, GOLEM_PARRY } from './golem-parry.ts'

// Horizontal reach, in source pixels, includes the opaque bounds of every pose.
type Sprite = {
  name: string
  footY: number
  poses: Readonly<Record<string, number>>
  scale: number
  reach: readonly [left: number, right: number]
  // Opaque bounds used for cues and for spacing the two resting actors.
  head: number
  restReach?: Sprite['reach']
}
type Placement = { foot: number; scale: number; travel: number }

const chamberFloor = 204
const chambers = ['floor-01-04', 'floor-05-08', 'floor-09-12'] as const
const footerHeight = 98
const actorDisplayScale = .8
const heroFootX = 26
const heroPoses = [
  'idle', 'guard-lift', 'guard', 'guard-brace', 'attack-prepare', 'step',
  'attack', 'attack-follow', 'hit', 'recover', 'fall', 'down',
] as const
const hero: Sprite = {
  name: 'hero', footY: 39,
  poses: Object.fromEntries(heroPoses.map((pose) => [pose, heroFootX])),
  scale: 3.75, reach: [20, 22], head: 8, restReach: [7, 21],
}
const heroSwordTip = [47 + .5, 20 + .5] as const
const boss: Sprite = { name: 'boss', footY: 47, poses: { idle: 30, charge: 25, attack: 37, knockdown: 36 }, scale: 4, reach: [35, 19], head: 1, restReach: [20, 6] }
const golem: Sprite = { name: 'golem', footY: 39, poses: { idle: 15, charge: 15, attack: 21, hit: 13 }, scale: 5, reach: [18, 17], head: 18, restReach: [15, 16] }

type PoseFrame = { pose: string; duration: number }
export type ImpactTarget = 'player' | 'enemy' | 'escort'
export type BattleHit = { target: ImpactTarget; damage: number; defeated?: boolean }
export function battleImpactTier(hit: BattleHit) {
  if (hit.defeated) return 'finisher'
  return hit.damage >= 5 ? 'heavy' : 'light'
}

const impactMotion = {
  light: { stop: 36, shake: .39 },
  heavy: { stop: 86, shake: .72 },
  finisher: { stop: 146, shake: 1 },
}

type Impact = BattleHit & { start: number; hold: number; x: number; y: number; lift: number; dust: boolean }
type ContactOptions = { parry?: boolean; ordered?: boolean; guarded?: boolean; incoming?: boolean; joint?: boolean }
type Attack = { start: number; intent: EnemyIntent; count: number; index: number; last?: number; escort: boolean; weakened: boolean; guarded: boolean }
type Swing = { target: 'escort' | 'enemy'; start: number; contact: number }
const debrisDuration = 330
const shadowFade = 60

function enemySprite(name: string, footX: number, footY: number, scale: number, reach: Sprite['reach'], head: Sprite['head']): Sprite {
  return { name, footY, poses: { idle: footX, charge: footX, attack: footX, hit: footX }, scale, reach, head }
}

export const ENEMY_SPRITES = {
  thorns: golem,
  lock: enemySprite('lock', 16, 38, 5, [15, 11], 17),
  freeze: { ...enemySprite('freeze', 16, 38, 5, [30, 14], 17), restReach: [14, 14] },
  rage: enemySprite('rage', 16, 38, 7, [14, 15], 22),
  reaction: enemySprite('reaction', 20, 46, 4, [16, 11], 18),
  vitality: enemySprite('vitality', 20, 46, 5, [18, 15], 22),
  escort: enemySprite('escort', 20, 46, 4, [18, 13], 14),
  'shield-soldier': enemySprite('shield-soldier', 16, 38, 7, [15, 7], 22),
  'seal-sentinel': enemySprite('seal-sentinel', 16, 38, 6, [15, 6], 20),
  'iron-knight': enemySprite('iron-knight', 20, 46, 6, [19, 6], 27),
  'chain-warden': { ...enemySprite('chain-warden', 29, 42, 5, [29, 10], 15), restReach: [16, 10] },
  boss,
} satisfies Record<AscentEnemyId, Sprite>

export const ESCORT_SPRITE: Sprite = { ...enemySprite('escort-guard', 12, 26, 4, [11, 8], 14), restReach: [11, 3] }

function layoutSprites(sprites: readonly Sprite[], width: number, density: number, headroom: number, forecastHeight: number) {
  const edge = 8 * density
  const scales = sprites.map((sprite, index) => {
    const height = headroom - (index === sprites.length - 1 ? forecastHeight : 0)
    const preferred = Math.round(Math.round(sprite.scale * actorDisplayScale) * density)
    if (sprite === hero) return preferred
    if (sprite === boss && headroom >= 50 * preferred) return preferred
    return Math.max(1, Math.min(preferred, Math.floor(height / (sprite.footY - sprite.head))))
  })

  const last = sprites.length - 1
  const resting = sprites.map((sprite) => sprite.restReach ?? sprite.reach)
  // The actors move into the shared space for contact. Only the two outer edges
  // need to reserve the full pose overhang when choosing a pixel scale.
  const footprint = (sprite: Sprite, index: number) =>
    ((index === 0 ? sprite.reach[0] : resting[index][0]) +
      (index === last ? sprite.reach[1] : resting[index][1])) * scales[index]
  const available = width - 2 * edge
  while (sprites.reduce((sum, sprite, index) => sum + footprint(sprite, index), 0) > available) {
    let widest = -1
    for (const [index, sprite] of sprites.entries()) {
      if (sprite !== hero && scales[index] > 1 && (widest < 0 || footprint(sprite, index) > footprint(sprites[widest], widest))) widest = index
    }
    if (widest < 0) break
    scales[widest]--
  }

  const bodyWidth = resting.reduce((sum, [left, right], index) => sum + (left + right) * scales[index], 0)
  const leftOverhang = Math.max(0, (sprites[0].reach[0] - resting[0][0]) * scales[0])
  const rightOverhang = Math.max(0, (sprites[last].reach[1] - resting[last][1]) * scales[last])
  const gap = Math.max(0, Math.min(30 * density, (width - bodyWidth - 2 * edge - leftOverhang - rightOverhang) / last))
  const center = (width - bodyWidth - gap * last) / 2
  let start = Math.max(edge + leftOverhang, Math.min(center, width - bodyWidth - gap * last - edge - rightOverhang))
  const freeEdge = Math.max(0, Math.min(start - leftOverhang, width - start - bodyWidth - gap * last - rightOverhang) - edge)
  const travel = Math.min(35 * density, freeEdge / 2)
  const shake = Math.min(10 * density, freeEdge - travel)
  const placements = new Map<Sprite, Placement>()
  for (const [index, sprite] of sprites.entries()) {
    const [left, right] = resting[index]
    const scale = scales[index]
    placements.set(sprite, { foot: Math.round(start + left * scale), scale, travel })
    start += (left + right) * scale + gap
  }
  return { placements, shake }
}

export function enemyPlanPose(enemyId: AscentEnemyId, battle: YachtBattle) {
  const intent = enemyIntentAt(battle)
  if (enemyId === 'boss' && intent.id === 'knockdown') return 'knockdown'
  if (intent.id === 'knockdown' || intent.id === 'stunned') return 'hit' in ENEMY_SPRITES[enemyId].poses ? 'hit' : 'idle'
  if (enemyId === 'chain-warden' && battle.phase === 'assign') {
    return intent.gimmick === 'reflect' || intent.chargeThreshold !== undefined || intent.id === 'critical' ? 'charge' : 'idle'
  }
  if (battle.phase === 'assign' && (intent.chargeThreshold !== undefined || (enemyId !== 'boss' && intent.hits.length))) return 'charge'
  return 'idle'
}

function enemyAttacked(before: YachtBattle, exchange: Exchange) {
  return exchange.dealt < before.enemyHp && exchange.hitsTaken.length > 0
}

export function enemyExchangePoses(enemyId: AscentEnemyId, before: YachtBattle, exchange: Exchange) {
  const attacked = enemyAttacked(before, exchange)
  if (enemyId === 'boss') {
    return attacked && enemyIntentAt(before).id === 'critical' ? [{ pose: 'attack', duration: 220 }] : []
  }
  const poses: PoseFrame[] = []
  if (exchange.dealt) poses.push({ pose: 'hit', duration: 140 })
  if (attacked) poses.push({ pose: 'attack', duration: 160 })
  return poses
}

export function escortExchangePoses(before: YachtBattle, exchange: Exchange) {
  if (!before.escort) return []
  if (exchange.gimmick === 'retreat') return [{ pose: 'hit', duration: 160 }]
  const { attack } = yachtAllocationTotals(before, before.slots, exchange.awakenedDice ?? before.dice)
  const { escortDealt } = splitEnemyDamage(before, attack)
  const poses: PoseFrame[] = []
  if (escortDealt) poses.push({ pose: 'hit', duration: 140 })
  if (escortDealt < before.escort.hp && enemyAttacked(before, exchange)) poses.push({ pose: 'attack', duration: 160 })
  return poses
}

export function heroExchangePoses(before: YachtBattle, exchange: Exchange) {
  const frames: PoseFrame[] = []
  if (before.slots.includes('attack')) frames.push({ pose: 'attack', duration: 160 })
  if (exchange.gimmick === 'reflect') return [{ pose: 'guard', duration: 160 }, ...frames]
  if (exchange.dealt < before.enemyHp) {
    const totals = yachtAllocationTotals(before, before.slots, exchange.awakenedDice ?? before.dice)
    if (totals.guard > 0 && incomingAttack(before, totals).totalDamage > 0) {
      frames.push({ pose: 'guard', duration: 150 })
    }
  }
  if (exchange.hitsTaken.some((damage) => damage > 0)) frames.push({ pose: 'hit', duration: 150 })
  return frames
}

export class Arena {
  private readonly frame: HTMLElement
  private readonly encounter: HTMLElement
  private readonly intent: HTMLElement
  private readonly inventory: HTMLElement
  private readonly canvas = document.createElement('canvas')
  private readonly context = this.canvas.getContext('2d')!
  private readonly pixelData = new Map<string, ImageData>()
  private attack?: Attack
  private swing?: Swing
  private brace?: { at: number; parry: boolean }
  private falls = new Map<ImpactTarget, Impact>()
  private transition?: { at: number; pose: MotionFrame }
  private recoverUntil = 0
  private chamber: typeof chambers[number] = chambers[0]
  private readonly images = new Map<string, HTMLImageElement>()
  private density = 1
  private placements = new Map<Sprite, Placement>()
  private shake = 0
  private floor = 0
  private battle?: YachtBattle
  private enemyId: AscentEnemyId = 'thorns'
  private golemParry?: number
  private golemCounter?: { start: number; defeated: boolean }
  private animation = 0
  private animationSpeed = 1
  private reducedMotion = false
  private impacts: Impact[] = []
  private heldParryAt?: number
  private frozen?: { at: number; until: number }
  private shadows: { at: number; multi: boolean }[] = []
  private trauma = 0
  private lastFrame = 0

  constructor(frame: HTMLElement, encounter: HTMLElement, intent: HTMLElement, inventory: HTMLElement) {
    this.frame = frame
    this.encounter = encounter
    this.intent = intent
    this.inventory = inventory
    frame.append(this.canvas)
    const layout = new ResizeObserver(this.resize)
    layout.observe(frame)
    layout.observe(intent)
    layout.observe(inventory)
    window.addEventListener('resize', this.resize)
    this.watchDensity()
  }

  private load(name: string) {
    if (this.images.has(name)) return
    const image = new Image()
    this.images.set(name, image)
    image.addEventListener('load', () => {
      if (name.startsWith('motion/') || name.startsWith('hero-') || name.startsWith('chain-warden-')) {
        const pixels = document.createElement('canvas')
        pixels.width = image.width
        pixels.height = image.height
        const ctx = pixels.getContext('2d')!
        ctx.drawImage(image, 0, 0)
        this.pixelData.set(name, ctx.getImageData(0, 0, image.width, image.height))
      }
      this.draw()
    }, { once: true })
    image.src = new URL(`art/${name}.png`, document.baseURI).href
  }

  private loadSprite(sprite: Sprite) {
    for (const pose of Object.keys(sprite.poses)) this.load(`${sprite.name}-${pose}`)
  }

  private watchDensity = () => {
    window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      .addEventListener('change', this.watchDensity, { once: true })
    this.resize()
  }

  private resize = () => {
    const { left, right, top, bottom, width, height } = this.frame.getBoundingClientRect()
    if (!width || !height) return

    const density = window.devicePixelRatio
    const pxLeft = Math.round(left * density)
    const pxTop = Math.round(top * density)
    this.density = density
    this.canvas.width = Math.round(right * density) - pxLeft
    this.canvas.height = Math.round(bottom * density) - pxTop
    this.canvas.style.left = `${pxLeft / density - left}px`
    this.canvas.style.top = `${pxTop / density - top}px`
    this.canvas.style.width = `${this.canvas.width / density}px`
    this.canvas.style.height = `${this.canvas.height / density}px`
    this.context.imageSmoothingEnabled = false
    this.positionActors()
    this.draw()
  }

  private positionActors() {
    if (!this.canvas.width || !this.canvas.height) return
    const footer = parseFloat(getComputedStyle(this.encounter).getPropertyValue('--arena-footer')) || footerHeight
    this.floor = Math.max(1, this.canvas.height - Math.round(footer * this.density))
    const enemy = ENEMY_SPRITES[this.enemyId]
    const actors = this.enemyId === 'escort' ? [hero, ESCORT_SPRITE, enemy] : [hero, enemy]
    const { width: intentWidth, height: intentHeight } = this.intent.getBoundingClientRect()
    const stage = this.frame.getBoundingClientRect()
    const rail = this.inventory.getBoundingClientRect()
    const gap = 6
    const top = rail.height ? Math.max(gap, rail.bottom - stage.top + gap) : gap
    const { placements, shake } = layoutSprites(actors, this.canvas.width, this.density,
      this.floor - (enemy === boss ? gap : top) * this.density, (intentHeight + gap) * this.density)
    this.placements = placements
    this.shake = shake

    const canvasLeft = parseFloat(this.canvas.style.left)
    const canvasTop = parseFloat(this.canvas.style.top)
    const x = (sprite: Sprite) => canvasLeft + placements.get(sprite)!.foot / this.density
    const ground = canvasTop + this.floor / this.density
    const foe = placements.get(enemy)!
    let headY = ground - (enemy.footY - enemy.head) * foe.scale / this.density
    const half = intentWidth / 2
    let center = Math.max(half + gap, Math.min(x(enemy), stage.width - half - gap))
    if (enemy === boss && this.battle) {
      const intent = enemyIntentAt(this.battle)
      const { cell, atlas } = atlasCell(readyFrame(boss.name, intent, this.battle.erasedStrikeTurn === this.battle.turn))
      headY = ground - (atlas.pivot[1] - cell.bounds[1]) * foe.scale / this.density
      const left = canvasLeft + (this.atlasFoot(boss) + (cell.bounds[0] - atlas.pivot[0]) * foe.scale) / this.density
      if (headY - intentHeight - gap < top && left >= intentWidth + gap * 2) center = left - half - gap
    }
    this.encounter.style.setProperty('--intent-center', `${center}px`)
    this.encounter.style.setProperty('--intent-top', `${Math.max(top, headY - intentHeight - gap)}px`)
    this.encounter.style.setProperty('--ground', `${ground}px`)
    this.encounter.style.setProperty('--player-x', `${x(hero)}px`)
    this.encounter.style.setProperty('--enemy-x', `${x(enemy)}px`)
    this.encounter.style.setProperty('--player-body', `${ground - hero.footY * placements.get(hero)!.scale * .51 / this.density}px`)
    if (this.enemyId === 'escort') this.encounter.style.setProperty('--escort-x', `${x(ESCORT_SPRITE)}px`)
  }

  private drawBackground(ground: number, width: number, height: number) {
    const image = this.images.get('ui/backgrounds/' + this.chamber)
    if (!image?.naturalWidth) return
    // Keep the masonry visible in shallow arenas and align the stone floor to the feet.
    const top = Math.min(42, Math.max(0, Math.round(chamberFloor - ground * image.width / width)))
    this.context.drawImage(image, 0, top, image.width, chamberFloor - top, 0, 0, width, ground)
    this.context.drawImage(image, 0, chamberFloor, image.width, image.height - chamberFloor,
      0, ground, width, height - ground)
  }

  private drawHero(pose: string, shift = 0, lift = 0) {
    const image = this.images.get('hero-' + pose)
    if (!image?.naturalWidth) return
    const { foot, scale } = this.placements.get(hero)!
    const anchoredX = Math.round(foot + shift - hero.poses[pose] * scale)
    const x = pose === 'down' ? Math.max(Math.ceil(3 * this.density), anchoredX) : anchoredX
    this.context.drawImage(image, x,
      Math.round(this.floor + lift - hero.footY * scale), image.width * scale, image.height * scale)
  }

  private drawCell(pose: MotionFrame, foot: number, ground: number, scale: number) {
    const { cell, atlas, art } = atlasCell(pose)
    const image = this.images.get(art)
    if (!image?.naturalWidth) return
    const [x, y, w, h] = cell.rect
    this.context.drawImage(image, x, y, w, h, Math.round(foot - atlas.pivot[0] * scale),
      Math.round(ground - atlas.pivot[1] * scale), w * scale, h * scale)
  }

  // Scan the illustrated row that the blade actually crosses. A sprite's bounding box
  // can include empty air beside a bent arm or several rows above a short guard.
  private edgePixel(key: string, rect: number[], row: number, right: boolean) {
    const [sx, sy, width, height] = rect
    const pixels = this.pixelData.get(key)
    const center = Math.max(0, Math.min(height - 1, Math.round(row)))
    if (pixels) for (let delta = 0; delta < height; delta++) {
      for (const y of delta ? [center + delta, center - delta] : [center]) {
        if (y < 0 || y >= height) continue
        for (let i = 0; i < width; i++) {
          const x = right ? width - 1 - i : i
          if (pixels.data[((sy + y) * pixels.width + sx + x) * 4 + 3] > 100) return { x, y }
        }
      }
    }
    return { x: right ? width - 1 : 0, y: center }
  }

  private atlasFoot(sprite: Sprite) {
    const { atlas, cell } = atlasCell(frame(sprite.name, 'ready'))
    const [left, right] = sprite.restReach ?? sprite.reach
    const placement = this.placements.get(sprite)!
    // Centre the illustrated resting silhouette in the approved B layout.
    // The dedicated parry sheets retain their original pair of foot anchors.
    const center = cell.bounds[0] + cell.bounds[2] / 2 - atlas.pivot[0]
    return Math.round(placement.foot + ((right - left) / 2 - center) * placement.scale)
  }

  private bladePoint(target: 'enemy' | 'escort') {
    const sprite = target === 'enemy' ? ENEMY_SPRITES[this.enemyId] : ESCORT_SPRITE
    const { scale } = this.placements.get(sprite)!
    const foot = this.atlasFoot(sprite)
    const hand = this.placements.get(hero)!
    const { atlas, cell, art } = atlasCell(frame(sprite.name, 'hit'))
    const bladeHeight = (heroSwordTip[1] - hero.footY) * hand.scale
    const edge = this.edgePixel(art, cell.rect, atlas.pivot[1] - .5 + bladeHeight / scale, false)
    const y = (edge.y + .5 - atlas.pivot[1]) * scale
    // Let the short guard recoil up into the blade while the hero keeps their footing.
    const lift = target === 'escort' ? Math.min(0, bladeHeight - y) : 0
    return { x: foot + (edge.x + .5 - atlas.pivot[0]) * scale,
      y: this.floor + y + lift, lift }
  }

  private incomingPoint(pose: MotionFrame, sprite: Sprite, guarded: boolean) {
    const { atlas, cell } = atlasCell(pose)
    const tip = cell.candidateContact ?? [cell.bounds[0], cell.bounds[1] + cell.bounds[3] / 2]
    const actor = this.placements.get(sprite)!
    const hand = this.placements.get(hero)!
    const stance = guarded ? 'guard-brace' : 'hit'
    const pixel = this.pixelData.get('hero-' + stance)
    const height = (tip[1] + .5 - atlas.pivot[1]) * actor.scale
    const row = hero.footY - .5 + height / hand.scale
    const edge = this.edgePixel('hero-' + stance, [0, 0, pixel?.width ?? 72, pixel?.height ?? 44],
      guarded ? Math.max(15, Math.min(21, row)) : row, true)
    const x = hand.foot + (edge.x + .5 - hero.poses[stance]) * hand.scale
    const y = this.floor + (edge.y + .5 - hero.footY) * hand.scale
    return { x, y, shift: x - (this.atlasFoot(sprite) + (tip[0] + .5 - atlas.pivot[0]) * actor.scale), lift: y - this.floor - height }
  }

  private drawShadow(now: number, { at, multi }: (typeof this.shadows)[number]) {
    // 각 타격의 배경 그림자는 다음 접촉과 독립적으로 사라진다.
    const alpha = .35 * Math.max(0, Math.min(1,
      ((now - at) * this.animationSpeed + (multi ? 96 : shadowFade)) / shadowFade,
      (80 + shadowFade - (now - at) * this.animationSpeed) / shadowFade))
    if (!alpha) return
    const { context, density } = this
    const enemy = this.placements.get(ENEMY_SPRITES[this.enemyId])!
    const x = enemy.foot - 8 * enemy.scale
    const y = this.floor - 24 * enemy.scale
    const radius = (this.canvas.width / density <= 310 ? 9 : 12) * density
    context.save()
    context.translate(x, y)
    context.scale(1, .5)
    const gradient = context.createRadialGradient(0, 0, radius * .44, 0, 0, radius)
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`)
    gradient.addColorStop(1, 'transparent')
    context.fillStyle = gradient
    context.fillRect(-radius, -radius, radius * 2, radius * 2)
    context.restore()
  }

  private drawDebris(impact: Impact, now: number) {
    const age = (now - impact.start) * this.animationSpeed
    if (age < 0 || age >= debrisDuration) return
    const dir = impact.target === 'player' ? -1 : 1
    const px = Math.max(1, Math.round(this.density))
    if (age < 78) {
      this.drawCell(frame('effects', age < 25 ? 'chip-start' : 'chip-burst'), impact.x, impact.y, px)
    }
    if (this.reducedMotion || !impact.dust) return
    for (let i = 0; i < 7; i++) {
      const t = Math.max(0, (age - (i > 3 ? 72 : 20)) / debrisDuration)
      if (!t) continue
      this.context.fillStyle = i > 3 ? '#a89880' : '#d5c6aa'
      const size = (i > 3 ? 1 : 2) * px
      this.context.fillRect(Math.round(impact.x + dir * (8 + i * 5) * t * px),
        Math.round(impact.y + (50 * t * t - (i % 3 + 1) * 9 * t) * px), size, size)
    }
  }

  private drawDefeat(battle: YachtBattle) {
    const { context, canvas } = this
    // Frame the same chamber in portrait, keeping both silhouettes on its floor.
    const pixel = Math.min(canvas.height / 164, canvas.width / 104)
    const width = canvas.width / pixel
    const height = canvas.height / pixel
    const ground = Math.round(height * 122 / 164)
    context.save()
    context.scale(pixel, pixel)
    this.drawBackground(ground, width, height)
    context.fillStyle = 'rgba(33, 31, 25, .4)'
    context.fillRect(0, 0, width, height)

    const drawSurvivor = (sprite: Sprite, x: number) => {
      const image = this.images.get(`${sprite.name}-idle`)
      if (image?.naturalWidth) context.drawImage(image, Math.round(x) - sprite.poses.idle, ground - sprite.footY)
    }
    context.globalAlpha = .47
    if (battle.enemyHp > 0) {
      drawSurvivor(ENEMY_SPRITES[this.enemyId], width * .85)
      if (battle.escort) drawSurvivor(ESCORT_SPRITE, width * .59)
    }
    context.globalAlpha = 1
    const x = Math.round(width * .30)
    context.fillStyle = '#332e25'
    context.fillRect(x - 24, ground, 45, 3)
    context.fillRect(x - 20, ground + 3, 35, 1)
    const fallen = this.images.get('hero-down')
    if (fallen?.naturalWidth) context.drawImage(fallen, x - hero.poses.down, ground - hero.footY)
    context.restore()
  }

  private draw(now = performance.now()) {
    now = this.heldParryAt ?? now
    const { battle, canvas, context } = this
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!battle || !this.floor || !this.placements.size) return
    if (battle.phase === 'lost') {
      this.drawDefeat(battle)
      return
    }
    this.drawBackground(this.floor, canvas.width, canvas.height)
    context.save()
    if (!this.reducedMotion && this.trauma) {
      const distance = Math.min(10 * this.density, this.shake) * this.trauma ** 2
      context.translate(Math.round(Math.sin(now / 29) * distance), 0)
    }
    const parryArt = this.images.get(GOLEM_PARRY.art)
    const counterArt = this.images.get(GOLEM_COUNTER.art)
    if (this.golemCounter && parryArt?.naturalWidth && counterArt?.naturalWidth) {
      const elapsed = Math.min(GOLEM_COUNTER.end, (now - this.golemCounter.start) * this.animationSpeed)
      drawGolemCounter(context, counterArt, parryArt, elapsed, this.floor, this.density,
        this.placements.get(hero)!, this.placements.get(golem)!, this.golemCounter.defeated)
      context.restore()
      return
    }
    if (parryArt?.naturalWidth && this.golemParry !== undefined) {
      const elapsed = Math.min(GOLEM_PARRY.end, (now - this.golemParry) * this.animationSpeed)
      drawGolemParry(context, parryArt, elapsed, this.floor, this.density, this.placements.get(hero)!, this.placements.get(golem)!)
      context.restore()
      return
    }
    for (const shadow of this.shadows) this.drawShadow(now, shadow)
    const age = (start: number) => Math.max(0, (now - start) * this.animationSpeed)
    const enemy = ENEMY_SPRITES[this.enemyId]
    const attack = this.attack
    const since = attack?.last === undefined ? Infinity : age(attack.last)
    const left = attack ? 152 + (attack.index + 1) * 248 - age(attack.start) : Infinity
    const approaching = attack && attack.index + 1 < attack.count && left < 154
    const contactHold = this.brace?.parry ? 120 : 51
    const atContact = attack && since < contactHold
    const brace = this.brace && age(this.brace.at) < 140 ? this.brace : undefined
    const swing = this.swing
    const swingAge = swing ? age(swing.start) : Infinity
    const swingProgress = swing ? Math.max(0, Math.min(1, swingAge / swing.contact,
      1 - (swingAge - swing.contact - 50) / 94)) : 0
    const hit = this.falls.get('player') ?? this.impacts.filter(item => item.target === 'player').at(-1)
    const hurtAge = hit ? age(hit.start) : Infinity
    const hurt = hit && (hit.defeated || hurtAge < 145)
    const hand = this.placements.get(hero)!
    let pose = 'idle'
    if (brace || atContact && attack.guarded) pose = 'guard-brace'
    else if (hurt) pose = hit.defeated
      ? hurtAge < 72 ? 'hit' : hurtAge < 190 ? 'fall' : 'down'
      : hurtAge < 101 ? 'hit' : 'recover'
    else if (swing && swingProgress > 0) pose = this.reducedMotion ? 'attack'
      : swingAge < swing.contact * .34 ? 'attack-prepare'
      : swingAge < swing.contact * .8 ? 'step'
      : swingAge < swing.contact + 35 ? 'attack' : 'attack-follow'
    else if (approaching && attack.guarded) pose = this.reducedMotion || left < 113 ? 'guard' : 'guard-lift'
    let dx = 0, dy = 0
    if (swing && (pose === 'attack' || pose === 'step' || pose === 'attack-follow')) {
      const point = this.bladePoint(swing.target)
      const t = this.reducedMotion ? 1 : swingProgress ** 2
      dx = (point.x - hand.foot - (heroSwordTip[0] - hero.poses.attack) * hand.scale) * t
      dy = (point.y - this.floor - (heroSwordTip[1] - hero.footY) * hand.scale) * t
    } else if (!this.reducedMotion && (hurt || (brace && !brace.parry))) {
      const elapsed = age(brace?.at ?? hit!.start)
      dx = -(brace ? 3 : attack && attack.index < attack.count - 1 ? 4 : 9) * this.density * Math.sin(Math.PI * Math.min(1, Math.max(0, elapsed - 40) / 105))
    }
    if (battle.playerHp > 0 || hurt) this.drawHero(pose, dx, dy)
    const paintEnemy = (sprite: Sprite, target: 'enemy' | 'escort') => {
      const placement = this.placements.get(sprite)
      if (!placement) return
      const impact = this.falls.get(target) ?? this.impacts.filter(item => item.target === target).at(-1)
      if (target === 'escort' && !battle.escort && !impact) return
      const elapsed = impact ? age(impact.start) : Infinity
      const striking = attack && (target === 'enemy' || (attack.escort && attack.index <= 0 && !(since >= 105 && attack.index === 0)))
      const intent = enemyIntentAt(battle)
      const interrupted = this.transition && target === 'enemy' && age(this.transition.at) < 200
      let cell = target === 'enemy' ? readyFrame(sprite.name, intent, battle.erasedStrikeTurn === battle.turn) : frame(sprite.name, 'ready')
      let shift = 0, lift = 0
      if (impact && (impact.defeated || (elapsed < 135 && (!striking || !atContact || impact.start >= (attack.last ?? 0))))) {
        cell = hurtFrame(sprite.name, impact.damage, Boolean(impact.defeated), elapsed)
        if (target === 'escort') lift = impact.lift * Math.max(0, 1 - elapsed / 105)
        if (!this.reducedMotion && elapsed > impact.hold) shift = 6 * this.density * Math.sin(Math.PI * Math.min(1, (elapsed - impact.hold) / 88))
      } else if (striking && (since < contactHold + 54 || approaching)) {
        const stage = atContact ? 'contact' : since < contactHold + 54 ? 'follow' : left <= 78 ? 'approach' : 'anticipate'
        const repeated = atContact || since < contactHold + 54 ? attack.index > 0 : attack.index >= 0
        const attackIntent = target === 'escort' ? { ...attack.intent, id: 'impact', mechanic: undefined } : attack.intent
        cell = attackFrame(sprite.name, attackIntent, repeated, attack.weakened, stage)
        const tip = this.incomingPoint(attackFrame(sprite.name, attackIntent, repeated, attack.weakened, 'contact'), sprite, attack.guarded)
        const t = atContact ? 1 : since < contactHold + 54 ? 1 - (since - contactHold) / 54 : Math.max(0, 1 - left / 90)
        shift = tip.shift * Math.min(1, t)
        lift = tip.lift * Math.min(1, t)
      } else if (interrupted) cell = this.transition!.pose
      this.drawCell(cell, this.atlasFoot(sprite) + shift, this.floor + lift, placement.scale)
    }
    paintEnemy(enemy, 'enemy')
    if (this.enemyId === 'escort') paintEnemy(ESCORT_SPRITE, 'escort')
    if (brace && attack) {
      const p = this.incomingPoint(attackFrame(enemy.name, attack.intent, attack.index > 0, attack.weakened, 'contact'), enemy, true)
      context.fillStyle = brace.parry ? '#fff4d6' : '#b89f87'
      const size = Math.max(1, Math.round(this.density))
      for (let i = 0; i < (brace.parry ? 3 : 1); i++) context.fillRect(Math.round(p.x + i * 4 * size), Math.round(p.y - i * size), (3 + i) * size, size)
    }
    if (attack?.last !== undefined && attack.intent.id === 'critical' && since < 155 && !this.reducedMotion) {
      const px = Math.max(1, Math.round(this.density))
      const t = since / 155
      const strength = attack.weakened ? .48 : 1
      const foot = this.placements.get(hero)!.foot + 8 * px
      for (const dir of [-1, 1]) for (let i = 0; i < 4; i++) {
        context.fillStyle = i % 2 ? '#a3957c' : '#c7b798'
        context.fillRect(Math.round(foot + dir * (5 + i * 7) * t * strength * px),
          Math.round(this.floor - Math.sin(Math.PI * t) * (2 + i) * strength * px), 2 * px, px)
      }
    }
    for (const hit of this.impacts) this.drawDebris(hit, now)
    context.restore()
  }

  private animate = () => {
    if (this.heldParryAt !== undefined) return
    const now = performance.now()
    this.trauma = Math.max(0, this.trauma - Math.max(0, now - this.lastFrame) / 1000 * 1.5 * this.animationSpeed)
    this.lastFrame = now
    if (this.frozen && now >= this.frozen.until) {
      this.frozen = undefined
    }
    const parryIsPlaying = this.golemParry !== undefined && (now - this.golemParry) * this.animationSpeed < GOLEM_PARRY.end
    const counterIsPlaying = this.golemCounter && (now - this.golemCounter.start) * this.animationSpeed < GOLEM_COUNTER.end
    this.shadows = this.shadows.filter(({ at }) => (now - at) * this.animationSpeed < 80 + shadowFade)
    this.impacts = this.impacts.filter((hit) => now - hit.start < (this.reducedMotion ? 144 : debrisDuration / this.animationSpeed))
    if (this.attack && this.attack.index + 1 >= this.attack.count && now - (this.attack.last ?? this.attack.start) > 180 / this.animationSpeed) this.attack = undefined
    if (this.swing && (now - this.swing.start) * this.animationSpeed > this.swing.contact + 150) this.swing = undefined
    if (this.transition && (now - this.transition.at) * this.animationSpeed > 200) this.transition = undefined
    this.draw(now)
    if (this.attack || this.swing || this.transition || parryIsPlaying || counterIsPlaying || this.impacts.length || this.frozen || this.shadows.length || this.trauma) {
      this.animation = requestAnimationFrame(this.animate)
    }
  }

  setAnimation(speed: number, reducedMotion: boolean) {
    if (this.animationSpeed === speed && this.reducedMotion === reducedMotion) return
    this.animationSpeed = speed
    this.reducedMotion = reducedMotion
    if (reducedMotion) {
      this.trauma = 0
      this.golemParry = undefined
      this.golemCounter = undefined
      this.frozen = undefined
      this.shadows = []
    }
    this.restartAnimation()
  }

  holdFieldParry() {
    if (this.reducedMotion) return
    if (this.golemParry !== undefined) this.heldParryAt = this.golemParry + GOLEM_PARRY.end / this.animationSpeed
    else if (this.attack?.last) this.heldParryAt = this.attack.last + 60 / this.animationSpeed
    else return
    this.draw()
  }

  clearContact() {
    this.heldParryAt = undefined
    this.attack = undefined
    this.trauma = 0
    this.recoverUntil = 0
    this.swing = undefined
    this.brace = undefined
    this.transition = undefined
    this.falls.clear()
    this.golemParry = undefined
    this.golemCounter = undefined
    this.impacts = []
    this.frozen = undefined
    this.shadows = []
  }

  queueShadow(at: number, multi: boolean) {
    if (this.reducedMotion || this.enemyId !== 'boss') return
    this.shadows.push({ at, multi })
    this.restartAnimation()
  }

  freeze(duration: number, now = performance.now()) {
    if (!this.reducedMotion) {
      const until = now + duration / this.animationSpeed
      if (this.frozen) {
        this.frozen.until = Math.max(this.frozen.until, until)
      } else {
        this.frozen = { at: now, until }
      }
      this.restartAnimation()
    }
  }

  contact(hits: BattleHit[], { parry, ordered, guarded, incoming, joint }: ContactOptions = {}) {
    const now = performance.now()
    this.recoverUntil = Math.max(this.recoverUntil, now + (parry ? 180 : 150) / this.animationSpeed)
    if (incoming && this.attack) {
      this.attack.last = now
      this.attack.index++
      this.attack.guarded = Boolean(parry || guarded)
      this.brace = this.attack.guarded ? { at: now, parry: Boolean(parry) } : undefined
    }
    for (const hit of hits) {
      const enemy = ENEMY_SPRITES[this.enemyId]
      const current = this.attack
      const point = hit.target !== 'player' ? this.bladePoint(hit.target)
        : this.incomingPoint(attackFrame(enemy.name, current?.intent ?? enemyIntentAt(this.battle!), (current?.index ?? 0) > 0, Boolean(current?.weakened), 'contact'), enemy, false)
      const hold = this.reducedMotion ? 0 : Math.min(100, ordered ? 48 : 38 + 5 * hit.damage)
      const impact = { ...hit, ...point, start: now, hold, dust: !ordered || !incoming || Boolean(current && current.index === current.count - 1) }
      this.impacts.push(impact)
      if (hit.defeated) this.falls.set(hit.target, impact)
      if (hit.target !== 'player' && !joint) this.swing = { start: now - 96 / this.animationSpeed, contact: 96, target: hit.target }
    }
    if (this.reducedMotion || (parry && this.golemParry !== undefined)) {
      this.restartAnimation()
      return
    }
    let duration = parry ? 120 : guarded ? 30 : 0
    for (const hit of hits) {
      const motion = impactMotion[battleImpactTier(hit)]
      duration = Math.max(duration, motion.stop)
      this.trauma = Math.max(this.trauma, motion.shake)
    }
    this.lastFrame = now
    if (duration) this.freeze(duration, now)
    else this.restartAnimation()
  }

  beginGolemParry(now: number) {
    if (this.reducedMotion || this.enemyId !== 'thorns' || !this.images.get(GOLEM_PARRY.art)?.naturalWidth) return false
    this.golemParry = now
    this.restartAnimation()
    return true
  }

  playExchange(before: YachtBattle, exchange: Exchange, count: number, intent: EnemyIntent) {
    const now = performance.now()
    this.attack = { start: now, count, index: -1, intent, escort: Boolean(before.escort && (exchange.escortDealt ?? 0) < before.escort.hp),
      weakened: before.weakenedStrikeTurn === before.turn, guarded: before.slots.includes('guard') }
    if (exchange.escortDealt || exchange.dealt) this.swing = { target: exchange.escortDealt ? 'escort' : 'enemy', start: now, contact: exchange.escortDealt ? 45 : 96 }
    this.restartAnimation()
  }

  settlePose(pose: string) {
    const name = ENEMY_SPRITES[this.enemyId].name
    const at = performance.now()
    this.transition = { at, pose: frame(name === 'boss' ? 'boss-special' : name, pose) }
    this.recoverUntil = Math.max(this.recoverUntil, at + 200 / this.animationSpeed)
    this.restartAnimation()
  }

  async finishExchange() {
    // Persisted combat has already advanced. Keep the outgoing plan on screen
    // until its last contact and follow-through have been painted.
    if (this.golemParryHeld) return
    const remaining = this.recoverUntil - performance.now()
    if (remaining > 0 && !this.reducedMotion && !document.hidden) {
      await new Promise<void>(resolve => window.setTimeout(resolve, remaining))
    }
    this.clearContact()
    this.draw()
  }

  get golemParryHeld() {
    return this.golemParry !== undefined && !this.reducedMotion
  }

  beginGolemCounter(defeated: boolean) {
    if (!this.golemParryHeld || !this.images.get(GOLEM_COUNTER.art)?.naturalWidth) return false
    this.heldParryAt = undefined
    this.golemCounter = { start: performance.now(), defeated }
    this.restartAnimation()
    return true
  }

  counterStrike() {
    if (this.reducedMotion) return
    this.golemParry = undefined
    this.swing = { start: performance.now(), contact: 128, target: this.battle?.escort ? 'escort' : 'enemy' }
    this.restartAnimation()
  }

  private restartAnimation() {
    cancelAnimationFrame(this.animation)
    this.animate()
  }

  finishStrike() {
    this.swing = undefined
    this.restartAnimation()
  }

  prime(enemyId: AscentEnemyId) {
    this.loadSprite(hero)
    const enemy = ENEMY_SPRITES[enemyId]
    if (enemyId === 'chain-warden') this.loadSprite(enemy)
    else {
      this.load('motion/' + enemy.name)
      this.load(enemy.name + '-idle')
    }
    this.load('motion/effects')
    if (enemyId === 'boss') this.load('motion/boss-special')
    if (enemyId === 'freeze') this.load('freeze-ready')
    if (enemyId === 'escort') {
      this.load('motion/escort-guard')
      this.load('escort-guard-idle')
    }
    if (enemyId === 'thorns') {
      this.load(GOLEM_PARRY.art)
      this.load(GOLEM_COUNTER.art)
    }
  }

  flightTarget(target: 'escort' | 'enemy') {
    const point = this.bladePoint(target)
    return { x: point.x / this.density, y: point.y / this.density }
  }

  refresh(battle: YachtBattle, enemyId: AscentEnemyId, floor: number) {
    this.chamber = chambers[floor <= 4 ? 0 : floor <= 8 ? 1 : 2]
    if (!this.encounter.hidden) this.load('ui/backgrounds/' + this.chamber)
    if (this.battle?.seed !== battle.seed || this.enemyId !== enemyId) {
      this.clearContact()
      this.trauma = 0
      this.enemyId = enemyId
    }
    this.battle = battle
    if (battle.phase !== 'counter') this.golemParry = undefined
    if (this.floor) this.positionActors()
    else this.resize()
    this.prime(enemyId)
    this.draw()
  }
}
