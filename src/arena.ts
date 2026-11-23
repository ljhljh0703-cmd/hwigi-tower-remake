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
  private readonly images = new Map<string, HTMLImageElement>()
  private density = 1
  private spritePixels = spriteScale
  private floor = 0
  private companionHome = 52
  private playerHome = hero.x
  private battle?: YachtBattle
  private enemyId: AscentEnemyId = 'thorns'
  private strike?: { start: number; joint: boolean }
  private motion?: { start: number; duration: number; hero: readonly PoseFrame[]; enemy: readonly PoseFrame[]; escort: readonly PoseFrame[] }
  private animation = 0

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
    this.floor = Math.round((height / 2 + 65 * scale) * density)
    const unitsPerPixel = 360 / width
    this.companionHome = Math.max(48, 52 * unitsPerPixel)
    this.playerHome = Math.max(hero.x, 114 * unitsPerPixel)
    this.encounter.style.setProperty('--player-x', `${this.playerHome / 3.6}%`)
    this.positionOverlays()
    this.draw()
  }

  private get enemyX() { return this.enemyId === 'escort' ? overseerHome : enemyHome }

  private positionOverlays() {
    const sprite = ENEMY_SPRITES[this.enemyId]
    const ground = this.floor / this.density
    const enemyHeight = sprite.footY * this.spritePixels / this.density
    this.encounter.style.setProperty('--ground', `${ground}px`)
    this.encounter.style.setProperty('--enemy-head', `${ground - enemyHeight}px`)
    this.encounter.style.setProperty('--player-head', `${ground - hero.footY * this.spritePixels / this.density}px`)
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

  private drawSprite(sprite: Sprite, pose: string, x: number) {
    const image = this.images.get(`${sprite.name}-${pose}`)
    const readyPose = image?.naturalWidth ? pose : 'idle'
    const readyImage = this.images.get(`${sprite.name}-${readyPose}`)
    if (!readyImage?.naturalWidth) return
    const scale = this.spritePixels
    const left = Math.round(x * this.canvas.width / 360) - sprite.poses[readyPose] * scale
    const top = this.floor - sprite.footY * scale
    this.context.drawImage(readyImage, left, top, readyImage.naturalWidth * scale, readyImage.naturalHeight * scale)
  }

  private drawEnemy(battle: YachtBattle, stagger: number, pose?: string) {
    if (battle.enemyHp <= 0 && !pose) return
    const x = this.enemyX + (this.strike?.joint ? 16 : 12) * stagger
    this.drawSprite(ENEMY_SPRITES[this.enemyId], pose ?? enemyPlanPose(this.enemyId, battle), x)
  }

  private draw(now = performance.now()) {
    const { motion, strike, battle, canvas, context } = this
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!battle || !this.floor) return
    this.drawBackground()
    const elapsed = strike ? now - strike.start : Infinity
    const heroPose = motion && poseAt(motion.hero, now - motion.start)
    const enemyPose = motion && poseAt(motion.enemy, now - motion.start)
    const escortPose = motion && poseAt(motion.escort, now - motion.start)
    if (strike?.joint) {
      const x = this.companionHome + (192 - this.companionHome) * strikeProgress(elapsed, 144) ** 3
      context.save()
      context.globalAlpha = 0.55
      this.drawSprite(hero, 'attack', x)
      context.restore()
    }
    if (battle.playerHp > 0 || heroPose) {
      const x = this.playerHome + (214 - this.playerHome) * strikeProgress(elapsed, 128) ** 3
      this.drawSprite(hero, heroPose ?? 'idle', x)
    }
    this.drawEnemy(battle, strikeProgress(elapsed - 128, 68), enemyPose)
    if (escortPose || (battle.escort && battle.enemyHp > 0)) {
      const ready = battle.phase === 'assign' && enemyIntentAt(battle).hits.length > 0
      this.drawSprite(ESCORT_SPRITE, escortPose ?? (ready ? 'charge' : 'idle'), escortHome)
    }
  }

  private animate = () => {
    const now = performance.now()
    if (this.motion && now - this.motion.start >= this.motion.duration) this.motion = undefined
    this.draw(now)
    if (this.motion || (this.strike && now - this.strike.start < 288)) {
      this.animation = requestAnimationFrame(this.animate)
    }
  }

  playExchange(before: YachtBattle, exchange: Exchange) {
    return this.playPoses(heroExchangePoses(before, exchange), enemyExchangePoses(this.enemyId, before, exchange), escortExchangePoses(before, exchange))
  }

  counterStrike(joint: boolean, animate: boolean) {
    if (animate) this.strike = { start: performance.now(), joint }
    this.playPoses([{ pose: 'attack', duration: 288 }], this.enemyId === 'boss' ? [] : [{ pose: 'hit', duration: 288 }])
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
      this.enemyId = enemyId
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
