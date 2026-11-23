import { enemyIntentAt } from './combat.ts'
import type { Exchange } from './combat.ts'
import type { YachtBattle } from './yacht-combat.ts'

const player = { x: 94, width: 63, height: 95, fill: '#d1d1d1' }
const enemy = { x: 262, width: 106, height: 153, fill: '#868686' }
const companion = { x: 23, width: 29, height: 67, fill: '#a9a9a9' }
// Align the actor feet with the foreground floor row in the 99×176 chamber.
const chamberFloor = 136
const boss = { name: 'boss', footX: 24, footY: 46, poses: ['idle', 'charge', 'attack', 'knockdown'] }
const golem = { name: 'golem', footX: 16, footY: 38, poses: ['idle', 'charge', 'attack', 'hit'] }

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

function strikeProgress(elapsed: number, oneWay: number) {
  return Math.max(0, 1 - Math.abs(elapsed / oneWay - 1))
}

export class Arena {
  private readonly canvas = document.createElement('canvas')
  private readonly context = this.canvas.getContext('2d')!
  private readonly images = new Map<string, HTMLImageElement>()
  private density = 1
  private scale = 0
  private ground = 0
  private companionHome = companion.x
  private playerHome = player.x
  private battle?: YachtBattle
  private enemyId = ''
  private strike?: { start: number; joint: boolean }
  private poses?: { start: number; frames: ReturnType<typeof enemyExchangePoses> }
  private animation = 0

  constructor(private readonly frame: HTMLElement, private readonly encounter: HTMLElement) {
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
    this.canvas.width = Math.round(right * density) - pxLeft
    this.canvas.height = Math.round(bottom * density) - pxTop
    this.canvas.style.left = `${pxLeft / density - left}px`
    this.canvas.style.top = `${pxTop / density - top}px`
    this.canvas.style.width = `${this.canvas.width / density}px`
    this.canvas.style.height = `${this.canvas.height / density}px`
    this.context.imageSmoothingEnabled = false
    this.scale = Math.min(width / 240, height / 300)
    this.ground = height / 2 + 85 * this.scale
    const unitsPerPixel = 360 / width
    const companionHalfWidth = companion.width * this.scale / 2
    const playerHalfWidth = player.width * this.scale / 2
    this.companionHome = Math.max(companion.x, (12 + companionHalfWidth) * unitsPerPixel)
    this.playerHome = Math.max(player.x, this.companionHome + (companionHalfWidth + playerHalfWidth + 8) * unitsPerPixel)
    this.encounter.style.setProperty('--ground', `${this.ground}px`)
    this.encounter.style.setProperty('--enemy-head', `${this.ground - enemy.height * this.scale}px`)
    this.encounter.style.setProperty('--player-head', `${this.ground - player.height * this.scale}px`)
    this.encounter.style.setProperty('--player-x', `${this.playerHome / 3.6}%`)
    this.draw()
  }

  private drawBackground() {
    const image = this.images.get('chamber')
    if (!image?.naturalWidth) return
    const { width, height } = this.canvas
    const floor = Math.round(this.ground * this.density)
    const scale = Math.ceil(Math.max(width / image.width, floor / chamberFloor, (height - floor) / (image.height - chamberFloor)))
    this.context.drawImage(image, Math.round((width - image.width * scale) / 2),
      floor - chamberFloor * scale, image.width * scale, image.height * scale)
  }

  private drawActor(actor: typeof player, x: number, fill = actor.fill, outlined = false) {
    const center = x * this.canvas.width / 360
    const halfWidth = actor.width * this.scale * this.density / 2
    const left = Math.round(center - halfWidth)
    const width = Math.round(center + halfWidth) - left
    const top = Math.round((this.ground - actor.height * this.scale) * this.density)
    const height = Math.round(this.ground * this.density) - top
    const edge = outlined ? Math.max(1, Math.round(this.density)) : 0
    if (outlined) {
      this.context.fillStyle = '#c1c1c1'
      this.context.fillRect(left, top, width, height)
    }
    this.context.fillStyle = fill
    this.context.fillRect(left + edge, top + edge, width - 2 * edge, height - 2 * edge)
  }

  private drawEnemy(battle: YachtBattle, stagger: number) {
    const sprite = spriteFor(this.enemyId)
    let pose: string | undefined
    if (this.poses) {
      let elapsed = performance.now() - this.poses.start
      for (const frame of this.poses.frames) {
        if (elapsed < frame.duration) {
          pose = frame.pose
          break
        }
        elapsed -= frame.duration
      }
      if (!pose) this.poses = undefined
    }
    if (battle.enemyHp <= 0 && !pose) return
    const x = enemy.x + (this.strike?.joint ? 16 : 12) * stagger
    if (sprite) {
      const image = this.images.get(`${sprite.name}-${pose ?? enemyPlanPose(this.enemyId, battle)}`)
      if (image?.naturalWidth) {
        const scale = Math.max(1, Math.round((sprite === boss ? 3 : 2.4) * this.scale * this.density))
        const left = Math.round(x * this.canvas.width / 360) - sprite.footX * scale
        const top = Math.round(this.ground * this.density) - sprite.footY * scale
        this.context.drawImage(image, left, top, image.width * scale, image.height * scale)
        return
      }
    }
    if (battle.enemyHp > 0) this.drawActor(enemy, x, stagger > 0 ? '#e9e9e9' : enemy.fill, true)
  }

  private draw() {
    const { strike, battle, canvas, context } = this
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!battle || !this.scale) return
    this.drawBackground()
    const elapsed = strike ? performance.now() - strike.start : Infinity
    if (strike?.joint) this.drawActor(companion, this.companionHome + (192 - this.companionHome) * strikeProgress(elapsed, 144) ** 3)
    if (battle.playerHp > 0) this.drawActor(player, this.playerHome + (214 - this.playerHome) * strikeProgress(elapsed, 128) ** 3)
    this.drawEnemy(battle, strikeProgress(elapsed - 128, 68))
  }

  private animate = () => {
    this.draw()
    if (this.poses || (this.strike && performance.now() - this.strike.start < 288)) {
      this.animation = requestAnimationFrame(this.animate)
    }
  }

  playExchange(before: YachtBattle, exchange: Exchange) {
    const frames = enemyExchangePoses(this.enemyId, before, exchange)
    this.poses = frames.length ? { start: performance.now(), frames } : undefined
    this.restartAnimation()
  }

  counterStrike(joint: boolean, animate: boolean) {
    const start = performance.now()
    if (animate) this.strike = { start, joint }
    if (this.enemyId === 'thorns') this.poses = { start, frames: [{ pose: 'hit', duration: 288 }] }
    this.restartAnimation()
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
      this.poses = undefined
      this.strike = undefined
    }
    this.battle = battle
    this.enemyId = enemyId
    this.load('chamber')
    const sprite = spriteFor(enemyId)
    if (sprite) for (const pose of sprite.poses) this.load(`${sprite.name}-${pose}`)
    this.draw()
  }
}
