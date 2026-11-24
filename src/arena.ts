import { enemyIntentAt, incomingAttack } from './combat.ts'
import type { Exchange } from './combat.ts'
import type { AscentEnemyId } from './enemy-roster.ts'
import { yachtAllocationTotals } from './yacht-combat.ts'
import type { YachtBattle } from './yacht-combat.ts'

const enemyHome = 262
const overseerHome = 293
const escortHome = 204
// Align the actor feet with the foreground floor row in the 99×176 chamber.
const chamberFloor = 136
const spriteScale = 3
// The frames are centered on the pose artwork. Each x coordinate marks the planted foot.
const hero = { name: 'hero', x: 94, footY: 39, poses: { idle: 14, attack: 12, guard: 11, hit: 17 } }
const boss = { name: 'boss', footY: 47, poses: { idle: 30, charge: 25, attack: 37, knockdown: 36 } }
const golem = { name: 'golem', footY: 39, poses: { idle: 15, charge: 15, attack: 21, hit: 13 } }

type Sprite = { name: string; footY: number; poses: Readonly<Record<string, number>> }
type PoseFrame = { pose: string; duration: number }
export type ImpactTarget = 'player' | 'enemy' | 'escort'
export type BattleHit = { target: ImpactTarget; damage: number; defeated?: boolean }
type Impact = BattleHit & { start: number; markedUntil: number }
type ContactOptions = { parry?: boolean; counter?: boolean; ordered?: boolean; guarded?: boolean }
const flashDuration = 80
const debrisDuration = 400
const shadowFade = 60
const escortMark = ['..D..', '.DLD.', 'DLLLD', '.DLD.', '..D..']

function enemySprite(name: string, footX: number, footY: number): Sprite {
  return { name, footY, poses: { idle: footX, charge: footX, attack: footX, hit: footX } }
}

export const ENEMY_SPRITES = {
  thorns: golem,
  lock: enemySprite('lock', 16, 38),
  freeze: enemySprite('freeze', 16, 38),
  rage: enemySprite('rage', 16, 38),
  reaction: enemySprite('reaction', 20, 46),
  vitality: enemySprite('vitality', 20, 46),
  escort: enemySprite('escort', 20, 46),
  'shield-soldier': enemySprite('shield-soldier', 16, 38),
  'seal-sentinel': enemySprite('seal-sentinel', 16, 38),
  'iron-knight': enemySprite('iron-knight', 20, 46),
  boss,
} satisfies Record<AscentEnemyId, Sprite>

export const ESCORT_SPRITE = enemySprite('escort-guard', 12, 26)

export function enemyPlanPose(enemyId: AscentEnemyId, battle: YachtBattle) {
  const intent = enemyIntentAt(battle)
  if (enemyId === 'boss' && intent.id === 'knockdown') return 'knockdown'
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
  const dealt = exchange.escortDealt ?? 0
  const poses: PoseFrame[] = []
  if (dealt) poses.push({ pose: 'hit', duration: 140 })
  if (dealt < before.escort.hp && enemyAttacked(before, exchange)) poses.push({ pose: 'attack', duration: 160 })
  return poses
}

export function heroExchangePoses(before: YachtBattle, exchange: Exchange) {
  const frames: PoseFrame[] = []
  if (before.slots.includes('attack')) frames.push({ pose: 'attack', duration: 160 })
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
  private readonly canvas = document.createElement('canvas')
  private readonly context = this.canvas.getContext('2d')!
  private readonly flashCanvas = document.createElement('canvas')
  private readonly flashContext = this.flashCanvas.getContext('2d')!
  private readonly images = new Map<string, HTMLImageElement>()
  private density = 1
  private spritePixels = spriteScale
  private floor = 0
  private playerHome = hero.x
  private battle?: YachtBattle
  private enemyId: AscentEnemyId = 'thorns'
  private strike?: { start: number }
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

  constructor(frame: HTMLElement, encounter: HTMLElement) {
    this.frame = frame
    this.encounter = encounter
    frame.append(this.canvas)
    new ResizeObserver(this.resize).observe(frame)
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
    this.spritePixels = Math.max(1, Math.round(spriteScale * density))
    this.canvas.width = Math.round(right * density) - pxLeft
    this.canvas.height = Math.round(bottom * density) - pxTop
    this.canvas.style.left = `${pxLeft / density - left}px`
    this.canvas.style.top = `${pxTop / density - top}px`
    this.canvas.style.width = `${this.canvas.width / density}px`
    this.canvas.style.height = `${this.canvas.height / density}px`
    this.context.imageSmoothingEnabled = false
    const scale = Math.min(width / 240, height / 300)
    this.floor = Math.round(Math.min(height / 2 + 65 * scale, height - 95) * density)
    this.positionPlayer()
    this.positionOverlays()
    this.draw()
  }

  private positionPlayer() {
    const width = this.canvas.width / this.density
    if (!width) return
    const home = Math.max(hero.x, 114 * 360 / width)
    this.playerHome = this.enemyId === 'escort' ? Math.min(home, escortHome - 81 * 360 / width) : home
    this.encounter.style.setProperty('--player-x', `${this.playerHome / 3.6}%`)
  }

  private get enemyX() { return this.enemyId === 'escort' ? overseerHome : enemyHome }

  private positionOverlays() {
    const sprite = ENEMY_SPRITES[this.enemyId]
    const ground = this.floor / this.density
    const enemyHeight = sprite.footY * this.spritePixels / this.density
    this.encounter.style.setProperty('--ground', `${ground}px`)
    this.encounter.style.setProperty('--enemy-head', `${ground - enemyHeight}px`)
    const pixel = this.spritePixels / this.density
    this.encounter.style.setProperty('--enemy-body', `${ground - enemyHeight * .51}px`)
    this.encounter.style.setProperty('--player-body', `${ground - hero.footY * pixel * .51}px`)
    this.encounter.style.setProperty('--escort-body', `${ground - ESCORT_SPRITE.footY * pixel * .57}px`)
    this.encounter.style.setProperty('--enemy-x', `${this.enemyX / 3.6}%`)
    this.encounter.style.setProperty('--escort-x', `${escortHome / 3.6}%`)
    const vitalShift = (this.enemyX - enemyHome) * this.canvas.width / (360 * this.density)
    this.encounter.style.setProperty('--enemy-vital-shift', `${vitalShift}px`)
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

  private drawSprite(sprite: Sprite, pose: string, x: number, offset = 0, flash = 0, shieldMark = false) {
    const image = this.images.get(`${sprite.name}-${pose}`)
    const readyPose = image?.naturalWidth ? pose : 'idle'
    const readyImage = this.images.get(`${sprite.name}-${readyPose}`)
    if (!readyImage?.naturalWidth) return
    const scale = this.spritePixels
    const foot = Math.round(x * this.canvas.width / 360 + offset * this.density)
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
    const x = this.enemyX * this.canvas.width / 360 - 22 * density
    const y = this.floor - 70 * density
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
    const anchor = { player: this.playerHome, enemy: this.enemyX, escort: escortHome }[impact.target]
    const sprite = { player: hero, enemy: ENEMY_SPRITES[this.enemyId], escort: ESCORT_SPRITE }[impact.target]
    const x = anchor * this.canvas.width / 360
    const y = this.floor - sprite.footY * this.spritePixels * .51
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

  private draw(now = performance.now()) {
    const { motion, strike, battle, canvas, context, reaction } = this
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!battle || !this.floor) return
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
      context.translate(Math.sin(now / 29) * 10 * strength, Math.cos(now / 37) * 7 * strength)
      this.drawBackground()
    }
    for (const shadow of this.shadows) this.drawShadow(now, shadow)
    if (battle.playerHp > 0 || heroPose) {
      const x = this.playerHome + (214 - this.playerHome) * strikeProgress(elapsed, 128) ** 3
      this.drawSprite(hero, heroPose ?? 'idle', x, offset('player', -1), flash('player'))
    }
    if (battle.enemyHp > 0 || enemyPose) {
      const x = this.enemyX + 12 * strikeProgress(elapsed - 128, 68)
      this.drawSprite(ENEMY_SPRITES[this.enemyId], enemyPose ?? enemyPlanPose(this.enemyId, battle),
        x, offset('enemy', 1), flash('enemy'))
    }
    const shieldMark = this.impacts.some((hit) => hit.target === 'escort' && now < hit.markedUntil)
    if (escortPose || shieldMark || (battle.escort && battle.enemyHp > 0)) {
      const ready = battle.phase === 'assign' && enemyIntentAt(battle).hits.length > 0
      this.drawSprite(ESCORT_SPRITE, escortPose ?? (ready ? 'charge' : 'idle'),
        escortHome, shieldMark ? 0 : offset('escort', 1), flash('escort'), shieldMark)
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
    if (!this.frozen && this.motion && (now - this.motion.start) * this.animationSpeed >= this.motion.duration) this.motion = undefined
    if (this.strike && (now - this.strike.start) * this.animationSpeed >= 288 && !this.frozen) this.strike = undefined
    if (this.reaction && now >= this.reaction.until) this.reaction = undefined
    this.shadows = this.shadows.filter(({ at }) => (now - at) * this.animationSpeed < 80 + shadowFade)
    this.impacts = this.impacts.filter((hit) => now - hit.start < (this.reducedMotion ? 144 : debrisDuration / this.animationSpeed))
    this.draw(now)
    if (this.motion || this.strike || this.impacts.length || this.frozen || this.reaction || this.shadows.length || this.trauma) {
      this.animation = requestAnimationFrame(this.animate)
    }
  }

  setAnimation(speed: number, reducedMotion: boolean) {
    if (this.animationSpeed === speed && this.reducedMotion === reducedMotion) return
    this.animationSpeed = speed
    this.reducedMotion = reducedMotion
    if (reducedMotion) {
      this.trauma = 0
      this.motion = undefined
      this.reaction = undefined
      this.strike = undefined
      this.frozen = undefined
      this.shadows = []
    }
    this.restartAnimation()
  }

  clearContact() {
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
    if (this.reducedMotion) {
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

  playExchange(before: YachtBattle, exchange: Exchange) {
    if (this.reducedMotion) return
    const heroFrames = before.slots.includes('attack') ? [{ pose: 'attack', duration: 160 }]
      : heroExchangePoses(before, exchange).filter(({ pose }) => pose === 'guard')
    const enemyFrames = enemyAttacked(before, exchange) ? [{ pose: 'charge', duration: 152 }] : []
    this.playPoses(heroFrames, enemyFrames)
  }

  counterStrike() {
    if (this.reducedMotion) return
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
      this.positionPlayer()
      this.positionOverlays()
    }
    this.battle = battle
    this.load('chamber')
    this.loadSprite(hero)
    this.loadSprite(ENEMY_SPRITES[enemyId])
    if (enemyId === 'escort') this.loadSprite(ESCORT_SPRITE)
    this.draw()
  }
}
