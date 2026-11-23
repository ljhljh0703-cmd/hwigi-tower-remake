import { enemyIntentAt, incomingAttack } from './combat.ts'
import type { Exchange } from './combat.ts'
import { yachtAllocationTotals } from './yacht-combat.ts'
import type { YachtBattle } from './yacht-combat.ts'

const enemy = { x: 262, width: 106, height: 153, fill: '#868686' }
const companion = { x: 23, width: 29, height: 67, fill: '#a9a9a9' }
// Align the actor feet with the foreground floor row in the 99×176 chamber.
const chamberFloor = 136
const spriteScale = 3
const hero = { name: 'hero', x: 94, footX: 16, footY: 38, poses: ['idle', 'attack', 'guard', 'hit'] }
const boss = { name: 'boss', footX: 24, footY: 46, poses: ['idle', 'charge', 'attack', 'knockdown'] }
const golem = { name: 'golem', footX: 16, footY: 38, poses: ['idle', 'charge', 'attack', 'hit'] }

type Sprite = Pick<typeof hero, 'name' | 'footX' | 'footY'>
type PoseFrame = { pose: string; duration: number }

function spriteFor(enemyId: string) {
  return enemyId === 'boss' ? boss : enemyId === 'thorns' ? golem : undefined
}

export function enemyPlanPose(enemyId: string, battle: YachtBattle) {
  const intent = enemyIntentAt(battle)
  if (enemyId === 'boss') {
    if (intent.id === 'knockdown') return 'knockdown'
    if (battle.phase === 'assign' && intent.chargeThreshold !== undefined) return 'charge'
  }
  if (enemyId === 'thorns' && battle.phase === 'assign' && intent.hits.length) return 'charge'
  return 'idle'
}

export function enemyExchangePoses(enemyId: string, before: YachtBattle, exchange: Exchange) {
  if (enemyId === 'boss' && enemyIntentAt(before).id === 'critical' && exchange.hitsTaken.length) {
    return [{ pose: 'attack', duration: 220 }]
  }
  if (enemyId !== 'thorns') return []
  const poses = []
  if (exchange.dealt) poses.push({ pose: 'hit', duration: 140 })
  if (exchange.dealt < before.enemyHp && exchange.hitsTaken.length) poses.push({ pose: 'attack', duration: 160 })
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
  private scale = 0
  private floor = 0
  private companionHome = companion.x
  private playerHome = hero.x
  private battle?: YachtBattle
  private enemyId = ''
  private strike?: { start: number; joint: boolean }
  private motion?: { start: number; duration: number; hero: readonly PoseFrame[]; enemy: readonly PoseFrame[] }
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
    this.scale = Math.min(width / 240, height / 300)
    this.floor = Math.round((height / 2 + 85 * this.scale) * density)
    const unitsPerPixel = 360 / width
    const companionHalfWidth = companion.width * this.scale / 2
    const playerHalfWidth = hero.footX * this.spritePixels / density
    this.companionHome = Math.max(companion.x, (12 + companionHalfWidth) * unitsPerPixel)
    this.playerHome = Math.max(hero.x, this.companionHome + (companionHalfWidth + playerHalfWidth + 8) * unitsPerPixel)
    this.encounter.style.setProperty('--player-x', `${this.playerHome / 3.6}%`)
    this.positionOverlays()
    this.draw()
  }

  private positionOverlays() {
    const sprite = spriteFor(this.enemyId)
    const ground = this.floor / this.density
    const enemyHeight = sprite ? sprite.footY * this.spritePixels / this.density : enemy.height * this.scale
    this.encounter.style.setProperty('--ground', `${ground}px`)
    this.encounter.style.setProperty('--enemy-head', `${ground - enemyHeight}px`)
    this.encounter.style.setProperty('--player-head', `${ground - hero.footY * this.spritePixels / this.density}px`)
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

  private drawActor(actor: typeof enemy, x: number, fill = actor.fill, outlined = false) {
    const center = x * this.canvas.width / 360
    const halfWidth = actor.width * this.scale * this.density / 2
    const left = Math.round(center - halfWidth)
    const width = Math.round(center + halfWidth) - left
    const height = Math.round(actor.height * this.scale * this.density)
    const top = this.floor - height
    const edge = outlined ? Math.max(1, Math.round(this.density)) : 0
    if (outlined) {
      this.context.fillStyle = '#c1c1c1'
      this.context.fillRect(left, top, width, height)
    }
    this.context.fillStyle = fill
    this.context.fillRect(left + edge, top + edge, width - 2 * edge, height - 2 * edge)
  }

  private drawSprite(sprite: Sprite, pose: string, x: number) {
    const image = this.images.get(`${sprite.name}-${pose}`)
    const idle = this.images.get(`${sprite.name}-idle`)
    const ready = image?.naturalWidth ? image : idle
    if (!ready?.naturalWidth) return false
    const scale = this.spritePixels
    const left = Math.round(x * this.canvas.width / 360) - sprite.footX * scale
    const top = this.floor - sprite.footY * scale
    this.context.drawImage(ready, left, top, ready.naturalWidth * scale, ready.naturalHeight * scale)
    return true
  }

  private drawEnemy(battle: YachtBattle, stagger: number, pose?: string) {
    if (battle.enemyHp <= 0 && !pose) return
    const x = enemy.x + (this.strike?.joint ? 16 : 12) * stagger
    const sprite = spriteFor(this.enemyId)
    if (sprite && this.drawSprite(sprite, pose ?? enemyPlanPose(this.enemyId, battle), x)) return
    if (battle.enemyHp > 0) this.drawActor(enemy, x, stagger > 0 ? '#e9e9e9' : enemy.fill, true)
  }

  private draw(now = performance.now()) {
    const { motion, strike, battle, canvas, context } = this
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!battle || !this.scale) return
    this.drawBackground()
    const elapsed = strike ? now - strike.start : Infinity
    const heroPose = motion && poseAt(motion.hero, now - motion.start)
    const enemyPose = motion && poseAt(motion.enemy, now - motion.start)
    if (strike?.joint) this.drawActor(companion, this.companionHome + (192 - this.companionHome) * strikeProgress(elapsed, 144) ** 3)
    if (battle.playerHp > 0 || heroPose) {
      const x = this.playerHome + (214 - this.playerHome) * strikeProgress(elapsed, 128) ** 3
      this.drawSprite(hero, heroPose ?? 'idle', x)
    }
    this.drawEnemy(battle, strikeProgress(elapsed - 128, 68), enemyPose)
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
    return this.playPoses(heroExchangePoses(before, exchange), enemyExchangePoses(this.enemyId, before, exchange))
  }

  counterStrike(joint: boolean, animate: boolean) {
    const start = performance.now()
    if (animate) this.strike = { start, joint }
    this.playPoses([{ pose: 'attack', duration: 288 }], this.enemyId === 'thorns' ? [{ pose: 'hit', duration: 288 }] : [], start)
  }

  private playPoses(hero: readonly PoseFrame[], enemy: readonly PoseFrame[], start = performance.now()) {
    const duration = Math.max(...[hero, enemy].map((frames) => frames.reduce((total, frame) => total + frame.duration, 0)))
    this.motion = duration ? { start, duration, hero, enemy } : undefined
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

  refresh(battle: YachtBattle, enemyId: string) {
    if (this.battle?.seed !== battle.seed || this.enemyId !== enemyId) {
      this.motion = undefined
      this.strike = undefined
      this.enemyId = enemyId
      this.positionOverlays()
    }
    this.battle = battle
    this.load('chamber')
    for (const pose of hero.poses) this.load(`hero-${pose}`)
    const sprite = spriteFor(enemyId)
    if (sprite) for (const pose of sprite.poses) this.load(`${sprite.name}-${pose}`)
    this.draw()
  }
}
