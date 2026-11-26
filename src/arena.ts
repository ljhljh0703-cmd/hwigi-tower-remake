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

const chamberFloor = 136
const footerHeight = 98
const actorDisplayScale = .8
const hero: Sprite = { name: 'hero', footY: 39, poses: { idle: 14, attack: 12, guard: 11, hit: 17 }, scale: 3.75, reach: [17, 20], head: 4, restReach: [11, 15] }
const boss: Sprite = { name: 'boss', footY: 47, poses: { idle: 30, charge: 25, attack: 37, knockdown: 36 }, scale: 4, reach: [35, 19], head: 1 }
const golem: Sprite = { name: 'golem', footY: 39, poses: { idle: 15, charge: 15, attack: 21, hit: 13 }, scale: 5, reach: [18, 17], head: 18, restReach: [15, 16] }

type PoseFrame = { pose: string; duration: number }
export type ImpactTarget = 'player' | 'enemy' | 'escort'
export type BattleHit = { target: ImpactTarget; damage: number; defeated?: boolean }
type Impact = BattleHit & { start: number; markedUntil: number }
type ContactOptions = { parry?: boolean; counter?: boolean; ordered?: boolean; guarded?: boolean }
const flashDuration = 80
const debrisDuration = 400
const shadowFade = 60
const escortMark = ['..D..', '.DLD.', 'DLLLD', '.DLD.', '..D..']

function enemySprite(name: string, footX: number, footY: number, scale: number, reach: Sprite['reach'], head: Sprite['head']): Sprite {
  return { name, footY, poses: { idle: footX, charge: footX, attack: footX, hit: footX }, scale, reach, head }
}

export const ENEMY_SPRITES = {
  thorns: golem,
  lock: enemySprite('lock', 16, 38, 5, [15, 11], 17),
  freeze: enemySprite('freeze', 16, 38, 5, [15, 11], 17),
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

export const ESCORT_SPRITE = enemySprite('escort-guard', 12, 26, 4, [11, 8], 14)

function layoutSprites(sprites: readonly Sprite[], width: number, density: number, headroom: number, forecastHeight: number) {
  const edge = 8 * density
  const scales = sprites.map((sprite, index) => {
    const height = headroom - (index === sprites.length - 1 ? forecastHeight : 0)
    const preferred = Math.round(sprite.scale * actorDisplayScale * density)
    return Math.max(1, Math.min(preferred, Math.floor(height / (sprite.footY - sprite.head))))
  })

  const footprint = (sprite: Sprite, index: number) => (sprite.reach[0] + sprite.reach[1]) * scales[index]
  const available = width - (sprites.length + 1) * edge
  while (sprites.reduce((sum, sprite, index) => sum + footprint(sprite, index), 0) > available) {
    let widest = -1
    for (const [index, sprite] of sprites.entries()) {
      if (scales[index] > 1 && (widest < 0 || footprint(sprite, index) > footprint(sprites[widest], widest))) widest = index
    }
    if (widest < 0) break
    scales[widest]--
  }

  const resting = sprites.map((sprite) => sprite.restReach ?? sprite.reach)
  const bodyWidth = resting.reduce((sum, [left, right], index) => sum + (left + right) * scales[index], 0)
  const last = sprites.length - 1
  const overhang = Math.max((sprites[0].reach[0] - resting[0][0]) * scales[0],
    (sprites[last].reach[1] - resting[last][1]) * scales[last])
  const gap = Math.max(0, Math.min(30 * density, (width - bodyWidth - 2 * (edge + overhang)) / last))
  let start = (width - bodyWidth - gap * last) / 2
  const freeEdge = Math.max(0, start - overhang - edge)
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

function poseAt(frames: readonly PoseFrame[], elapsed: number) {
  for (const frame of frames) {
    if (elapsed < frame.duration) return frame.pose
    elapsed -= frame.duration
  }
}

function strikeProgress(elapsed: number, oneWay: number) {
  return Math.max(0, 1 - Math.abs(elapsed / oneWay - 1))
}

export class Arena {
  private readonly frame: HTMLElement
  private readonly encounter: HTMLElement
  private readonly intent: HTMLElement
  private readonly inventory: HTMLElement
  private readonly canvas = document.createElement('canvas')
  private readonly context = this.canvas.getContext('2d')!
  private readonly flashCanvas = document.createElement('canvas')
  private readonly flashContext = this.flashCanvas.getContext('2d')!
  private readonly images = new Map<string, HTMLImageElement>()
  private density = 1
  private placements = new Map<Sprite, Placement>()
  private shake = 0
  private floor = 0
  private battle?: YachtBattle
  private enemyId: AscentEnemyId = 'thorns'
  private strike?: { start: number }
  private golemParry?: number
  private golemCounter?: { start: number; defeated: boolean }
  private motion?: { start: number; duration: number; hero: readonly PoseFrame[]; enemy: readonly PoseFrame[]; escort: readonly PoseFrame[] }
  private animation = 0
  private animationSpeed = 1
  private reducedMotion = false
  private impacts: Impact[] = []
  private reaction?: { start: number; until: number; block: boolean; recoil: BattleHit[] }
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
    image.addEventListener('load', () => this.draw(), { once: true })
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
    const footer = parseFloat(getComputedStyle(this.encounter).getPropertyValue('--arena-footer')) || footerHeight
    this.floor = Math.max(1, this.canvas.height - Math.round(footer * density))
    this.positionActors()
    this.draw()
  }

  private positionActors() {
    if (!this.canvas.width || !this.floor) return
    const enemy = ENEMY_SPRITES[this.enemyId]
    const actors = this.enemyId === 'escort' ? [hero, ESCORT_SPRITE, enemy] : [hero, enemy]
    const { width: intentWidth, height: intentHeight } = this.intent.getBoundingClientRect()
    const stage = this.frame.getBoundingClientRect()
    const rail = this.inventory.getBoundingClientRect()
    const gap = 6
    const top = rail.height ? Math.max(gap, rail.bottom - stage.top + gap) : gap
    const { placements, shake } = layoutSprites(actors, this.canvas.width, this.density,
      this.floor - top * this.density, (intentHeight + gap) * this.density)
    this.placements = placements
    this.shake = shake

    const canvasLeft = parseFloat(this.canvas.style.left)
    const canvasTop = parseFloat(this.canvas.style.top)
    const x = (sprite: Sprite) => canvasLeft + placements.get(sprite)!.foot / this.density
    const ground = canvasTop + this.floor / this.density
    const foe = placements.get(enemy)!
    const headY = ground - (enemy.footY - enemy.head) * foe.scale / this.density
    const half = intentWidth / 2
    const center = Math.max(half + gap, Math.min(x(enemy), stage.width - half - gap))
    this.encounter.style.setProperty('--intent-center', `${center}px`)
    this.encounter.style.setProperty('--intent-top', `${Math.max(gap, headY - intentHeight - gap)}px`)
    this.encounter.style.setProperty('--ground', `${ground}px`)
    this.encounter.style.setProperty('--player-x', `${x(hero)}px`)
    this.encounter.style.setProperty('--enemy-x', `${x(enemy)}px`)
    this.encounter.style.setProperty('--player-body', `${ground - hero.footY * placements.get(hero)!.scale * .51 / this.density}px`)
    if (this.enemyId === 'escort') this.encounter.style.setProperty('--escort-x', `${x(ESCORT_SPRITE)}px`)
  }

  private drawBackground() {
    const image = this.images.get('chamber')
    if (!image?.naturalWidth) return
    const { width, height } = this.canvas
    const floor = this.floor
    const scale = Math.ceil(Math.max(width / image.width, floor / chamberFloor, (height - floor) / (image.height - chamberFloor)))
    this.context.drawImage(image, Math.round((width - image.width * scale) / 2),
      floor - chamberFloor * scale, image.width * scale, image.height * scale)
  }

  private drawSprite(sprite: Sprite, pose: string, shift = 0, flash = 0, shieldMark = false) {
    const image = this.images.get(`${sprite.name}-${pose}`)
    const readyPose = image?.naturalWidth ? pose : 'idle'
    const readyImage = this.images.get(`${sprite.name}-${readyPose}`)
    if (!readyImage?.naturalWidth) return
    const placement = this.placements.get(sprite)
    if (!placement) return
    const { scale, travel } = placement
    const foot = Math.round(placement.foot + Math.max(-travel, Math.min(travel, shift)))
    const left = foot - sprite.poses[readyPose] * scale
    const top = this.floor - sprite.footY * scale
    const { naturalWidth: width, naturalHeight: height } = readyImage
    this.context.drawImage(readyImage, left, top, width * scale, height * scale)
    if (flash > 0) {
      this.flashCanvas.width = width
      this.flashCanvas.height = height
      const mask = this.flashContext
      mask.drawImage(readyImage, 0, 0)
      mask.globalCompositeOperation = 'source-in'
      mask.fillStyle = '#fff'
      mask.fillRect(0, 0, width, height)
      this.context.save()
      this.context.globalAlpha = flash
      this.context.drawImage(this.flashCanvas, left, top, width * scale, height * scale)
      this.context.restore()
    }
    if (shieldMark) {
      const markLeft = foot + (4 - ESCORT_SPRITE.poses.hit) * scale
      for (const [row, cells] of escortMark.entries()) {
        for (const [column, cell] of [...cells].entries()) {
          if (cell === '.') continue
          this.context.fillStyle = cell === 'L' ? '#fff0b8' : '#211b29'
          this.context.fillRect(markLeft + column * scale, top + (19 + row) * scale, scale, scale)
        }
      }
    }
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
    if (this.reducedMotion) return
    const progress = (now - impact.start) * this.animationSpeed / debrisDuration
    const { context, density } = this
    const sprite = { player: hero, enemy: ENEMY_SPRITES[this.enemyId], escort: ESCORT_SPRITE }[impact.target]
    const placement = this.placements.get(sprite)
    if (!placement) return
    const x = placement.foot
    const y = this.floor - sprite.footY * placement.scale * .51
    const count = 6 + Math.min(6, Math.floor(impact.damage / 2))
    context.save()
    context.globalAlpha = (1 - progress) ** 2
    for (let i = 0; i < count; i++) {
      const distance = (14 + (i * 13) % 30) * progress
      const angle = i * 2.4
      const side = (2 + i % 3) * density
      context.fillStyle = ['#cbbcb0', '#8d7d72', '#e7d9c5'][i % 3]
      context.fillRect(Math.round(x + Math.cos(angle) * distance * density),
        Math.round(y + (Math.sin(angle) * distance + 32 * progress ** 2) * density), side, side)
    }
    context.restore()
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
    const room = this.images.get('chamber')
    if (room?.naturalWidth) {
      const roomWidth = Math.max(132, width)
      context.drawImage(room, 0, 24, room.width, room.height - 24, (width - roomWidth) / 2, 0, roomWidth, height)
    }
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
    const fallen = this.images.get('hero-hit')
    if (fallen?.naturalWidth) {
      context.translate(x, ground - 7)
      context.scale(1, .53)
      context.rotate(-Math.PI / 2)
      context.drawImage(fallen, -16, -21)
    }
    context.restore()
  }

  private draw(now = performance.now()) {
    const { motion, strike, battle, canvas, context, reaction } = this
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!battle || !this.floor || !this.placements.size) return
    if (battle.phase === 'lost') {
      this.drawDefeat(battle)
      return
    }
    const clock = this.frozen?.at ?? now
    const elapsed = strike ? (clock - strike.start) * this.animationSpeed : Infinity
    const recoil = reaction && now < reaction.until ? reaction.recoil : []
    const isHit = (target: ImpactTarget) => recoil.some((hit) => hit.target === target)
    const block = reaction?.block && now < reaction.until
    const heroPose = block ? 'guard' : isHit('player') ? 'hit' : recoil.length ? 'attack'
      : motion && poseAt(motion.hero, (clock - motion.start) * this.animationSpeed)
    const enemyPose = isHit('enemy') ? 'hit' : (block || isHit('player')) ? 'attack'
      : motion && poseAt(motion.enemy, (clock - motion.start) * this.animationSpeed)
    const escortPose = isHit('escort') ? 'hit' : motion && poseAt(motion.escort, (clock - motion.start) * this.animationSpeed)
    const flash = (target: ImpactTarget) => this.reducedMotion ? 0 : this.impacts.some((impact) =>
      impact.target === target && (now - impact.start) * this.animationSpeed < flashDuration) ? 1 : 0
    const offset = (target: ImpactTarget, side: number) => {
      if (this.reducedMotion) return 0
      const strength = this.frozen ? Math.max(0, (this.frozen.until - now) / (this.frozen.until - this.frozen.at)) : 0
      const jitter = Math.sin(now / 7) * side * strength * 1.6
      const hit = recoil.find((impact) => impact.target === target)
      const remaining = reaction ? Math.max(0, (reaction.until - now) / (reaction.until - reaction.start)) : 0
      return jitter + (hit ? side * Math.min(10, 6 + hit.damage / 2) * remaining : 0)
    }
    this.drawBackground()
    context.save()
    if (!this.reducedMotion && this.trauma) {
      const strength = this.trauma ** 2 * this.density
      context.translate(Math.round(Math.sin(now / 29) * Math.min(10 * strength, this.shake)), 0)
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
    const restingGolem = this.enemyId === 'thorns' && battle.playerHp > 0 && battle.enemyHp > 0
      && !motion && !strike && !reaction && !this.impacts.length
    if (parryArt?.naturalWidth && (this.golemParry !== undefined || restingGolem)) {
      const elapsed = this.golemParry === undefined ? 0 : Math.min(GOLEM_PARRY.end, (now - this.golemParry) * this.animationSpeed)
      drawGolemParry(context, parryArt, elapsed, this.floor, this.density, this.placements.get(hero)!, this.placements.get(golem)!)
      context.restore()
      return
    }
    for (const shadow of this.shadows) this.drawShadow(now, shadow)
    const enemy = ENEMY_SPRITES[this.enemyId]
    if (battle.playerHp > 0 || heroPose) {
      const lunge = this.placements.get(hero)!.travel * strikeProgress(elapsed, 128) ** 3
      this.drawSprite(hero, heroPose ?? 'idle', lunge + offset('player', -1) * this.density, flash('player'))
    }
    if (battle.enemyHp > 0 || enemyPose) {
      const retreat = 12 * strikeProgress(elapsed - 128, 68)
      this.drawSprite(enemy, enemyPose ?? enemyPlanPose(this.enemyId, battle),
        (retreat + offset('enemy', 1)) * this.density, flash('enemy'))
    }
    const shieldMark = this.impacts.some((hit) => hit.target === 'escort' && now < hit.markedUntil)
    if (escortPose || shieldMark || (battle.escort && battle.enemyHp > 0)) {
      const ready = battle.phase === 'assign' && enemyIntentAt(battle).hits.length > 0
      this.drawSprite(ESCORT_SPRITE, escortPose ?? (ready ? 'charge' : 'idle'),
        shieldMark ? 0 : offset('escort', 1) * this.density, flash('escort'), shieldMark)
    }
    for (const hit of this.impacts) this.drawDebris(hit, now)
    context.restore()
  }

  private animate = () => {
    const now = performance.now()
    this.trauma = Math.max(0, this.trauma - Math.max(0, now - this.lastFrame) / 1000 * 1.5 * this.animationSpeed)
    this.lastFrame = now
    if (this.frozen && now >= this.frozen.until) {
      const duration = this.frozen.until - this.frozen.at
      if (this.motion) this.motion.start += duration
      if (this.strike) this.strike.start += duration
      this.frozen = undefined
    }
    const parryIsPlaying = this.golemParry !== undefined && (now - this.golemParry) * this.animationSpeed < GOLEM_PARRY.end
    const counterIsPlaying = this.golemCounter && (now - this.golemCounter.start) * this.animationSpeed < GOLEM_COUNTER.end
    if (!this.frozen && this.motion && (now - this.motion.start) * this.animationSpeed >= this.motion.duration) this.motion = undefined
    if (this.strike && (now - this.strike.start) * this.animationSpeed >= 288 && !this.frozen) this.strike = undefined
    if (this.reaction && now >= this.reaction.until) this.reaction = undefined
    this.shadows = this.shadows.filter(({ at }) => (now - at) * this.animationSpeed < 80 + shadowFade)
    this.impacts = this.impacts.filter((hit) => now - hit.start < (this.reducedMotion ? 144 : debrisDuration / this.animationSpeed))
    this.draw(now)
    if (parryIsPlaying || counterIsPlaying || this.motion || this.strike || this.impacts.length || this.frozen || this.reaction || this.shadows.length || this.trauma) {
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
      this.motion = undefined
      this.reaction = undefined
      this.strike = undefined
      this.frozen = undefined
      this.shadows = []
    }
    this.restartAnimation()
  }

  clearContact() {
    this.golemParry = undefined
    this.golemCounter = undefined
    this.impacts = []
    this.reaction = undefined
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

  contact(hits: BattleHit[], { parry, counter, ordered, guarded }: ContactOptions = {}) {
    const now = performance.now()
    for (const hit of hits) {
      this.impacts.push({ ...hit, start: now, markedUntil: now + (this.reducedMotion ? 144 : 95 / this.animationSpeed) })
    }
    if (this.reducedMotion || (parry && this.golemParry !== undefined)) {
      this.restartAnimation()
      return
    }
    const damage = Math.max(0, ...hits.map((hit) => hit.damage))
    const duration = parry ? 120 : ordered ? 80 : damage ? Math.min(140, 50 + 8 * damage) : 0
    this.reaction = { start: now, until: now + Math.max(duration, 96) / this.animationSpeed, block: Boolean(parry || guarded), recoil: hits }
    const strong = hits.some((hit) => hit.defeated || (hit.target === 'enemy' && this.enemyId === 'boss'))
    const added = damage < 5 ? 0 : strong ? .8 : counter ? .5 : .3
    this.trauma = Math.min(1, this.trauma + added)
    this.lastFrame = now
    if (duration) this.freeze(duration, now)
    else this.restartAnimation()
  }

  beginGolemParry(now: number) {
    if (this.reducedMotion || this.enemyId !== 'thorns' || !this.images.get(GOLEM_PARRY.art)?.naturalWidth) return false
    this.motion = undefined
    this.golemParry = now
    this.restartAnimation()
    return true
  }

  playExchange(before: YachtBattle, exchange: Exchange) {
    if (this.reducedMotion) return
    const heroFrames = before.slots.includes('attack') ? [{ pose: 'attack', duration: 160 }]
      : heroExchangePoses(before, exchange).filter(({ pose }) => pose === 'guard')
    const enemyFrames = enemyAttacked(before, exchange) ? [{ pose: 'charge', duration: 152 }] : []
    this.playPoses(heroFrames, enemyFrames)
  }

  get golemParryHeld() {
    return this.golemParry !== undefined && !this.reducedMotion
  }

  beginGolemCounter(defeated: boolean) {
    if (!this.golemParryHeld || !this.images.get(GOLEM_COUNTER.art)?.naturalWidth) return false
    this.golemCounter = { start: performance.now(), defeated }
    this.restartAnimation()
    return true
  }

  counterStrike() {
    if (this.reducedMotion) return
    this.golemParry = undefined
    this.strike = { start: performance.now() }
    this.playPoses([{ pose: 'attack', duration: 288 }], [])
  }

  private playPoses(hero: readonly PoseFrame[], enemy: readonly PoseFrame[], escort: readonly PoseFrame[] = []) {
    const duration = Math.max(...[hero, enemy, escort].map((frames) => frames.reduce((total, frame) => total + frame.duration, 0)))
    this.motion = duration ? { start: performance.now(), duration, hero, enemy, escort } : undefined
    this.restartAnimation()
    return duration
  }

  private restartAnimation() {
    cancelAnimationFrame(this.animation)
    this.animate()
  }

  finishStrike() {
    this.strike = undefined
    this.restartAnimation()
  }

  refresh(battle: YachtBattle, enemyId: AscentEnemyId) {
    if (this.battle?.seed !== battle.seed || this.enemyId !== enemyId) {
      this.motion = undefined
      this.strike = undefined
      this.clearContact()
      this.trauma = 0
      this.enemyId = enemyId
    }
    this.battle = battle
    if (battle.phase !== 'counter') this.golemParry = undefined
    if (this.floor) this.positionActors()
    else this.resize()
    this.load('chamber')
    this.loadSprite(hero)
    this.loadSprite(ENEMY_SPRITES[enemyId])
    if (enemyId === 'thorns') {
      this.load(GOLEM_PARRY.art)
      this.load(GOLEM_COUNTER.art)
    }
    if (enemyId === 'escort') this.loadSprite(ESCORT_SPRITE)
    this.draw()
  }
}
