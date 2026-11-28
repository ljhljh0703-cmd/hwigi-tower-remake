import heroContactRows from './hero-contact-rows.json' with { type: 'json' }
import poolFormat from './pool-format.json' with { type: 'json' }
import poolClips from './pool-clips.json' with { type: 'json' }
import { atlasCell, frame, readyFrame, attackFrame, hurtFrame } from './enemy-motion.ts'
import type { MotionFrame } from './enemy-motion.ts'
import type { EnemyIntent } from './combat.ts'
import { enemyIntentAt, incomingAttack, splitEnemyDamage } from './combat.ts'
import type { Exchange } from './combat.ts'
import type { AscentEnemyId } from './enemy-roster.ts'
import { yachtAllocationTotals } from './yacht-combat.ts'
import type { YachtBattle } from './yacht-combat.ts'
import { drawGolemCounter, drawGolemParry, GOLEM_COUNTER, GOLEM_PARRY } from './golem-parry.ts'
import { drawMaterialChips, impactMaterial, upperMaterials } from './impact-material.ts'
import type { Material } from './impact-material.ts'
import { fracture, scatterBody, splitSilhouette } from './body-fragments.ts'
import { livingEnemies } from './upper-combat.ts'
import type { Formation, UpperRole } from './upper-combat.ts'

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
  // Layout slot when part of the resting ink (a weapon) may reach into the shared gap.
  slotReach?: Sprite['reach']
}
type Placement = { foot: number; scale: number; travel: number }

const fineArt = new Set(['shield-soldier', 'seal-sentinel', 'iron-knight'])
const chamberFloor = 204
const chambers = ['floor-01-04', 'floor-05-08', 'floor-09-12', 'floor-13-14', 'floor-15-17', 'floor-18-19'] as const
const upperLedge = 'ui/backgrounds/upper-rear-ledge'
// Codex regions: halls 1-4, vault 5-8, sanctuary 9-12, stairs 13-14, corridor 15-17, gate 18-19.
const chamberFor = (floor: number) => floor <= 4 ? 0 : floor <= 8 ? 1 : floor <= 12 ? 2 : floor <= 14 ? 3 : floor <= 17 ? 4 : 5
// The stage-two floors fall back to the stage-one chamber they used before their own walls.
const fallbackChamber = (floor: number) => floor <= 4 || floor === 13 || floor === 14 ? 0 : floor <= 8 || floor >= 15 && floor <= 17 ? 1 : 2
const footerHeight = 98
const actorDisplayScale = .8
const heroFootX = 36
const heroPoses = [
  'idle', 'idle-breathe', 'guard-lift', 'guard', 'guard-brace', 'guard-middle', 'guard-low', 'attack-prepare', 'step',
  'attack', 'attack-follow', 'hit', 'recover', 'fall', 'down',
] as const
const hero: Sprite = {
  name: 'hero', footY: 57,
  poses: Object.fromEntries(heroPoses.map((pose) => [pose, heroFootX])),
  scale: 2.5, reach: [30, 60], head: 9, restReach: [25, 41],
}
const heroSwordTip = [94 + .5, 42 + .5] as const

function nearestHeroContact(row: number, guarded: boolean) {
  const stances = guarded ? ['guard-brace', 'guard-middle', 'guard-low'] as const : ['hit'] as const
  let result = { stance: stances[0] as string, x: 0, y: 0 }
  let error = Infinity
  for (const stance of stances) for (const [x, y] of heroContactRows[stance]) {
    const distance = Math.abs(y - row)
    if (distance < error) { error = distance; result = { stance, x, y } }
  }
  return result
}
// Layout metrics in texels. The 2026-11-29 repaint widened several ready and attack
// silhouettes; each tuned value grew by exactly the new ink beyond the old ink on that
// side (manifest bounds against the pivot), so unchanged art keeps its tuned slot.
// The boss's new ready sword points into the shared gap the actors close for contact:
// its slot keeps the tuned left side, so the 12th-floor boss stays 3x on a 320 screen.
const boss: Sprite = { name: 'boss', footY: 47, poses: { idle: 30, charge: 25, attack: 37, knockdown: 36 }, scale: 4, reach: [35, 19], head: 1, restReach: [30, 15], slotReach: [20, 15] }
const golem: Sprite = { name: 'golem', footY: 39, poses: { idle: 15, charge: 15, attack: 21, hit: 13 }, scale: 5, reach: [18, 19], head: 16, restReach: [15, 19] }

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

type Impact = BattleHit & { start: number; hold: number; x: number; y: number; lift: number; dust: boolean; heavy: boolean }
type ContactOptions = { parry?: boolean; ordered?: boolean; guarded?: boolean; incoming?: boolean; joint?: boolean }
type Attack = { start: number; intent: EnemyIntent; count: number; index: number; last?: number; escort: boolean; weakened: boolean; guarded: boolean }
type Swing = { target: 'escort' | 'enemy'; start: number; contact: number; heavy?: boolean; landed?: number }
export const heavyStrike = { threshold: 8, approach: 224, hold: 56, follow: 144 } as const

// Convert elapsed presentation time to the original sword animation's clock.
// The tip reaches source time 96 exactly when damage is committed on screen.
function swingTime(swing: Swing, now: number, speed: number) {
  const elapsed = Math.max(0, (now - swing.start) * speed)
  if (!swing.heavy) return elapsed
  if (swing.landed === undefined) return Math.min(96, elapsed < 32 ? elapsed : 32 + (elapsed - 32) / 3)
  const release = Math.max(0, (now - swing.landed) * speed - heavyStrike.hold)
  return 96 + Math.min(release, heavyStrike.follow) / 3 + Math.max(0, release - heavyStrike.follow)
}
const debrisDuration = 330
const shadowFade = 60

function enemySprite(name: string, footX: number, footY: number, scale: number, reach: Sprite['reach'], head: Sprite['head']): Sprite {
  return { name, footY, poses: { idle: footX, charge: footX, attack: footX, hit: footX }, scale, reach, head }
}

export const ENEMY_SPRITES = {
  thorns: golem,
  lock: enemySprite('lock', 16, 38, 5, [22, 14], 16),
  freeze: { ...enemySprite('freeze', 16, 38, 5, [30, 20], 13), restReach: [20, 20] },
  rage: { ...enemySprite('slime-pool', 49, 41, 2.5, [43, 29], 3), restReach: [33, 26] },
  reaction: { ...enemySprite('reaction', 20, 46, 4, [16, 15], 18), restReach: [16, 12] },
  vitality: enemySprite('vitality', 20, 46, 5, [18, 18], 22),
  escort: enemySprite('escort', 20, 46, 4, [21, 17], 14),
  'shield-soldier': { ...enemySprite('shield-soldier', 16, 38, 7, [18, 9], 21), restReach: [16, 9] },
  'seal-sentinel': enemySprite('seal-sentinel', 16, 38, 6, [18, 12], 18),
  'iron-knight': enemySprite('iron-knight', 20, 46, 6, [20, 11], 25),
  'chain-warden': { ...enemySprite('chain-warden', 29, 42, 5, [29, 10], 15), restReach: [16, 10] },
  boss,
} satisfies Record<AscentEnemyId, Sprite>

export const ESCORT_SPRITE: Sprite = { ...enemySprite('escort-guard', 12, 26, 4, [11, 11], 12), restReach: [11, 7] }

// Upper formations draw their own actors. Their HUD anchors, ground and camera
// range keep the layout metrics of the stage-one sheets they were tuned against.
// The thirteenth floor reuses the rage id for its formation.
const upperLayoutMetrics = new Map<Sprite, Sprite>([
  [hero, { ...hero, footY: 39, scale: 3.75, reach: [20, 22], head: 8, restReach: [7, 21] }],
  [ENEMY_SPRITES.rage, enemySprite('rage', 16, 38, 7, [14, 15], 22)],
  [ENEMY_SPRITES['shield-soldier'], enemySprite('shield-soldier', 16, 38, 7, [15, 7], 22)],
  [boss, { ...boss, restReach: [20, 6], slotReach: undefined }],
])
const layoutMetric = (sprite: Sprite, upper: boolean) => upper ? upperLayoutMetrics.get(sprite) ?? sprite : sprite

export const upperSprites: Record<UpperRole, string> = {
  dash: 'upper-dash', support: 'upper-support', shield: 'upper-shield', guard: 'upper-shield', gatekeeper: 'upper-boss',
}
export const upperCardLanes = (count: number) => count === 3 ? [.39, .631, .91] : count === 2 ? [.50, .845] : [.72]
const upperActorLanes = (count: number, wide: boolean) => count === 3
  ? wide ? [.31, .631, .914] : [.347, .656, .920]
  : upperCardLanes(count)
const upperHeroLane = .13
const upperTier = (width: number) => width >= 344 ? 60 : 35
const upperBossArt = 'upper-boss-special'
const upperAttackStages = ['anticipate', 'approach', 'contact', 'follow'] as const
const upperHeavyPoses = ['charge-set', 'charge-approach', 'charge-contact', 'charge-follow'] as const
const upperWeakPoses = ['weak-set', 'weak-set', 'weak-contact', 'recover-start'] as const
type UpperMotion = {
  id: UpperRole; kind: 'swing' | 'hit' | 'advance' | 'attack' | 'block' | 'recoil' | 'support'
  amount?: number; defeated?: boolean; heavy?: boolean; weakened?: boolean; repeat?: boolean; blade?: boolean
  from?: Formation
}

function layoutSprites(sprites: readonly Sprite[], width: number, density: number, headroom: number, forecastHeight: number, zoom: number, upper = false) {
  const edge = 8 * density
  const metrics = sprites.map((sprite) => layoutMetric(sprite, upper))
  const scales = sprites.map((sprite, index) => {
    const height = headroom - (index === sprites.length - 1 ? forecastHeight : 0)
    const { scale, footY, head } = metrics[index]
    const preferred = Math.round(Math.round(scale * actorDisplayScale) * density * zoom)
    if (sprite === hero) return preferred
    if (sprite === boss && headroom >= 50 * preferred) return preferred
    return Math.max(1, Math.min(preferred, Math.floor(height / (footY - head))))
  })

  const last = sprites.length - 1
  const resting = metrics.map((sprite) => sprite.slotReach ?? sprite.restReach ?? sprite.reach)
  // The actors move into the shared space for contact. Only the two outer edges
  // need to reserve the full pose overhang when choosing a pixel scale.
  const footprint = (_sprite: Sprite, index: number) =>
    ((index === 0 ? metrics[index].reach[0] : resting[index][0]) +
      (index === last ? metrics[index].reach[1] : resting[index][1])) * scales[index]
  const available = width - 2 * edge
  while (sprites.reduce((sum, sprite, index) => sum + footprint(sprite, index), 0) > available) {
    let widest = -1
    for (const [index, sprite] of sprites.entries()) {
      if (sprite !== hero && scales[index] > 1 && (widest < 0 || footprint(sprite, index) > footprint(sprites[widest], widest))) widest = index
    }
    if (widest < 0) break
    scales[widest]--
  }

  // Double-density sheets need an even scale to land each fine texel on whole pixels.
  if (!upper) sprites.forEach((sprite, index) => {
    if (fineArt.has(sprite.name) && scales[index] >= 4) scales[index] -= scales[index] % 2
  })
  const bodyWidth = resting.reduce((sum, [left, right], index) => sum + (left + right) * scales[index], 0)
  const leftOverhang = Math.max(0, (metrics[0].reach[0] - resting[0][0]) * scales[0])
  const rightOverhang = Math.max(0, (metrics[last].reach[1] - resting[last][1]) * scales[last])
  const gap = Math.max(0, Math.min(30 * density, (width - bodyWidth - 2 * edge - leftOverhang - rightOverhang) / last))
  const center = (width - bodyWidth - gap * last) / 2
  let start = Math.max(edge + leftOverhang, Math.min(center, width - bodyWidth - gap * last - edge - rightOverhang))
  const freeEdge = Math.max(0, Math.min(start - leftOverhang, width - start - bodyWidth - gap * last - rightOverhang) - edge)
  const travel = Math.min(35 * density, freeEdge / 2)
  const shake = Math.max(0, Math.floor(freeEdge + edge - travel - 3 * density))
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
  private readonly shards = new Map<string, ReturnType<typeof splitSilhouette>>()
  private attack?: Attack
  private swing?: Swing
  private brace?: { at: number; parry: boolean }
  private falls = new Map<ImpactTarget, Impact>()
  private transition?: { at: number; pose: MotionFrame }
  private recoverUntil = 0
  private chamber: typeof chambers[number] = chambers[0]
  private fallback: typeof chambers[number] = chambers[0]
  private readonly images = new Map<string, HTMLImageElement>()
  private density = 1
  private placements = new Map<Sprite, Placement>()
  private shake = 0
  private intentBottom = 0
  private bossNameBottom = 0
  private floor = 0
  private battle?: YachtBattle
  private enemyId: AscentEnemyId = 'thorns'
  private golemParry?: number
  private golemCounter?: { start: number; defeated: boolean; landedAt?: number }
  private idleTimer?: number
  private animation = 0
  private animationSpeed = 1
  private reducedMotion = false
  private impacts: Impact[] = []
  private heldParryAt?: number
  private frozen?: { at: number; until: number }
  private shadows: { at: number; multi: boolean }[] = []
  private trauma = 0
  private kickAt = 0
  private direction = 1
  private rebounds = false
  private lastFrame = 0
  private upperScene?: Formation
  private upperMotion?: UpperMotion & { at: number; hold: number }
  private upperFallen: { id: UpperRole; lane: number; count: number; at: number }[] = []
  private upperHeroFit?: { key: string; scale: number }

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
    image.addEventListener('error', () => {
      // A missing stage-two wall keeps the stage-one chamber it replaced.
      if (name.startsWith('ui/backgrounds/floor-')) this.load(name.replace(this.chamber, this.fallback))
    }, { once: true })
    image.addEventListener('load', () => {
      if ((name.startsWith('motion/') && !name.endsWith('-layers')) || name.startsWith('hero-') || name.startsWith('chain-warden-') || name === GOLEM_COUNTER.art) {
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
    const styles = getComputedStyle(this.encounter)
    const footer = parseFloat(styles.getPropertyValue('--arena-footer')) || footerHeight
    this.floor = Math.max(1, this.canvas.height - Math.round(footer * this.density))
    const enemy = ENEMY_SPRITES[this.enemyId]
    const actors = this.enemyId === 'escort' ? [hero, ESCORT_SPRITE, enemy] : [hero, enemy]
    const { width: intentWidth, height: intentHeight } = this.intent.getBoundingClientRect()
    const stage = this.frame.getBoundingClientRect()
    const rail = this.inventory.getBoundingClientRect()
    const gap = 6
    const zoom = Number(styles.getPropertyValue('--arena-actor-zoom')) || 1
    const top = rail.height && stage.left < rail.right && rail.left < stage.right ? Math.max(gap, rail.bottom - stage.top + gap) : gap
    const { placements, shake } = layoutSprites(actors, this.canvas.width, this.density,
      this.floor - (enemy === boss ? gap : top) * this.density, (intentHeight + gap) * this.density, zoom, Boolean(this.battle?.formation))
    this.placements = placements
    this.shake = shake

    const canvasLeft = parseFloat(this.canvas.style.left)
    const canvasTop = parseFloat(this.canvas.style.top)
    const x = (sprite: Sprite) => canvasLeft + placements.get(sprite)!.foot / this.density
    const ground = canvasTop + this.floor / this.density
    const foe = placements.get(enemy)!
    const formation = Boolean(this.battle?.formation)
    const heroMetric = layoutMetric(hero, formation), enemyMetric = layoutMetric(enemy, formation)
    let headY = ground - (enemyMetric.footY - enemyMetric.head) * foe.scale / this.density
    const half = intentWidth / 2
    let center = Math.max(half + gap, Math.min(x(enemy), stage.width - half - gap))
    let lowest = top
    if (enemy === boss && this.battle) {
      const intent = enemyIntentAt(this.battle)
      const { cell, atlas } = atlasCell(readyFrame(boss.name, intent, this.battle.erasedStrikeTurn === this.battle.turn))
      headY = ground - (atlas.pivot[1] - cell.bounds[1]) * foe.scale / this.density
      const left = canvasLeft + (this.atlasFoot(boss) + (cell.bounds[0] - atlas.pivot[0]) * foe.scale) / this.density
      if (headY - intentHeight - gap < top) {
        if (left >= intentWidth + gap * 2) center = left - half - gap
        else {
          // Too wide to stand beside the painted ink (the sword tip included), e.g. with a
          // wider system font. Use the band above the boss's head between the rectangles
          // actually occupied there (relic rail, boss name) at full type size.
          const above = headY - intentHeight - gap
          const local = (r: DOMRect) => ({ left: r.left - stage.left, right: r.right - stage.left, top: r.top - stage.top, bottom: r.bottom - stage.top })
          const name = this.encounter.querySelector<HTMLElement>('#encounter-name')?.getBoundingClientRect()
          const wanted = Math.max(half + gap, Math.min(x(enemy), stage.width - half - gap))
          let low = gap, high = stage.width - gap
          for (const r of [rail, name]) {
            if (!r?.width || !r.height) continue
            const box = local(r)
            if (box.bottom + gap <= above || box.top - gap >= headY - gap) continue
            if (box.left + (box.right - box.left) / 2 < wanted) low = Math.max(low, box.right + gap)
            else high = Math.min(high, box.left - gap)
          }
          if (above >= gap && high - low >= intentWidth) {
            center = Math.max(low + half, Math.min(wanted, high - half))
            lowest = above
          }
        }
      }
    }
    this.encounter.style.setProperty('--intent-center', `${center}px`)
    if (!formation) for (const actor of actors) {
      // A wide forecast also clears the head of any other actor it spans.
      if (actor === enemy) continue
      const metric = layoutMetric(actor, false), { scale } = placements.get(actor)!
      const [left, right] = metric.restReach ?? metric.reach
      const spans = x(actor) - left * scale / this.density < center + half && x(actor) + right * scale / this.density > center - half
      if (spans) headY = Math.min(headY, ground - (metric.footY - metric.head) * scale / this.density)
    }
    const intentTop = Math.max(lowest, headY - intentHeight - gap)
    this.encounter.style.setProperty('--intent-top', `${intentTop}px`)
    this.intentBottom = (intentTop + intentHeight - canvasTop) * this.density
    this.encounter.style.setProperty('--inventory-clearance', `${top}px`)
    if (enemy === boss) {
      const name = this.encounter.querySelector<HTMLElement>('#encounter-name')!.getBoundingClientRect()
      this.bossNameBottom = Math.max(0, name.bottom - stage.top - canvasTop) * this.density
    }
    this.encounter.style.setProperty('--ground', `${ground}px`)
    const upper = this.battle?.formation
    const tier = upperTier(stage.width)
    if (upper) this.encounter.style.setProperty('--upper-tier', `${tier}px`)
    this.encounter.style.setProperty('--player-x', `${upper ? stage.width * upperHeroLane : x(hero)}px`)
    this.encounter.style.setProperty('--enemy-x', `${upper ? stage.width * upperActorLanes(livingEnemies(upper).length, tier === 60)[0] : x(enemy)}px`)
    this.encounter.style.setProperty('--player-body', `${ground - heroMetric.footY * placements.get(hero)!.scale * .51 / this.density}px`)
    this.encounter.style.setProperty('--enemy-body', `${ground - (enemyMetric.footY - enemyMetric.head) * foe.scale * .57 / this.density}px`)
    if (this.enemyId === 'escort') {
      this.encounter.style.setProperty('--escort-x', `${x(ESCORT_SPRITE)}px`)
      const guard = placements.get(ESCORT_SPRITE)!
      this.encounter.style.setProperty('--escort-body', `${ground - ESCORT_SPRITE.footY * guard.scale * .58 / this.density}px`)
    }
  }

  private drawBackground(ground: number, width: number, height: number) {
    const loaded = (name: string) => [this.chamber, this.fallback].map(chamber => this.images.get('ui/backgrounds/' + chamber + name))
      .find(image => image?.naturalWidth)
    const image = loaded('')
    if (!image) return
    const rows = Math.max(1, Math.round(ground * image.width / width))
    const compact = loaded('-compact')
    const wall = rows < 144 && compact?.naturalWidth ? compact : image
    const seam = wall === image ? chamberFloor : wall.height
    const shown = Math.min(rows, seam)
    this.context.drawImage(wall, 0, seam - shown, wall.width, shown, 0, 0, width, ground)
    this.context.drawImage(image, 0, chamberFloor, image.width, image.height - chamberFloor,
      0, ground, width, height - ground)
  }

  private drawHero(pose: string, shift = 0, lift = 0) {
    if (pose === 'idle' && !this.reducedMotion && Math.floor(performance.now() / 470) % 2) pose = 'idle-breathe'
    const image = this.images.get('hero-' + pose)
    if (!image?.naturalWidth) return
    const { foot, scale } = this.placements.get(hero)!
    const anchoredX = Math.round(foot + shift - hero.poses[pose] * scale)
    const x = pose === 'down' ? Math.max(Math.ceil(3 * this.density), anchoredX) : anchoredX
    this.context.drawImage(image, x,
      Math.round(this.floor + lift - hero.footY * scale), image.width * scale, image.height * scale)
  }

  private drawCell(pose: MotionFrame, foot: number, ground: number, scale: number, lift = 0, strikeHeight?: number) {
    const { cell, atlas, art } = atlasCell(pose)
    const image = this.images.get(art)
    if (!image?.naturalWidth) return
    const [x, y, w, h] = cell.rect
    const fine = scale >= 2 ? this.images.get('motion/detail/' + pose.sheet) : undefined
    const ink = fine?.naturalWidth ? fine : image
    const factor = ink === image ? 1 : 2
    const drawRows = (start: number, rows: number, destination: number, height: number) => {
      this.context.drawImage(ink, x * factor, (y + start) * factor, w * factor, rows * factor, left, destination, w * scale, height)
    }
    const left = Math.round(foot - atlas.pivot[0] * scale), top = Math.round(ground - atlas.pivot[1] * scale)
    const offset = Math.round(lift)
    if (strikeHeight !== undefined && offset) {
      // Keep the illustrated contact texel rigid and the soles on the floor.
      const sole = atlas.pivot[1]
      const joint = Math.max(1, Math.min(sole - 1, sole + strikeHeight + 1))
      const seam = top + joint * scale + offset
      drawRows(0, joint, top + offset, joint * scale)
      drawRows(joint, sole - joint, seam, ground - seam)
      if (h > sole) drawRows(sole, h - sole, ground, (h - sole) * scale)
      return
    }
    drawRows(0, h, top + offset, h * scale)
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
    const metric = layoutMetric(sprite, Boolean(this.battle?.formation))
    const [left, right] = metric.restReach ?? metric.reach
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
    if (sprite.name === 'slime-pool' && this.pixelData.has('motion/slime-pool-rig')) {
      const hitClip = this.swing?.heavy ? poolClips['heavy-hit'] : poolClips.hit
      const entry = hitClip.filter(([t]) => t <= (this.swing?.heavy ? .04 : .045)).at(-1)!
      const [width, height] = poolFormat.size
      const [px, py] = poolFormat.pivot
      const edge = this.edgePixel('motion/slime-pool-rig', [entry[1], entry[2], width, height], py - .5 + bladeHeight / scale, false)
      return { x: foot + (edge.x + .5 - px) * scale, y: this.floor + (edge.y + .5 - py) * scale, lift: 0 }
    }
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
    if (sprite.name !== 'slime-pool') {
      const { x, y, stance: selected } = nearestHeroContact(row, guarded)
      const sx = hand.foot + (x + .5 - heroFootX) * hand.scale
      const sy = this.floor + (y + .5 - hero.footY) * hand.scale
      return { stance: selected, x: sx, y: sy, shift: sx - this.atlasFoot(sprite) - (tip[0] + .5 - atlas.pivot[0]) * actor.scale, lift: sy - this.floor - height }
    }
    const edge = this.edgePixel('hero-' + stance, [0, 0, pixel?.width ?? 104, pixel?.height ?? 60],
      guarded ? Math.max(20, Math.min(26, row)) : Math.max(27, Math.min(31, row)), true)
    const x = hand.foot + (edge.x + .5 - hero.poses[stance]) * hand.scale
    const y = this.floor + (edge.y + .5 - hero.footY) * hand.scale
    return { stance, x, y, shift: x - (this.atlasFoot(sprite) + (tip[0] + .5 - atlas.pivot[0]) * actor.scale), lift: y - this.floor - height }
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
    const material = impactMaterial(this.enemyId, impact.target)
    if (impact.heavy && age < 122 && !this.reducedMotion) {
      // One asymmetric, pixel-aligned blade flare. At release the solid core
      // disappears and two narrow splinters carry the eye towards the recoil.
      const ctx = this.context
      ctx.save()
      ctx.translate(Math.round(impact.x), Math.round(impact.y))
      ctx.scale(px, px)
      if (age < heavyStrike.hold) {
        for (let row = -7; row <= 7; row++) {
          const weight = 1 - Math.abs(row) / 8
          const left = -Math.round(18 * weight ** 2)
          const right = Math.round(15 * weight)
          ctx.fillStyle = '#863f32'
          ctx.fillRect(left - 1, row, right - left + 2, 1)
          ctx.fillStyle = '#f39769'
          ctx.fillRect(left + 1, row, Math.max(1, right - left - 2), 1)
          if (Math.abs(row) < 4) {
            ctx.fillStyle = '#fff3da'
            ctx.fillRect(left + 3, row, Math.max(2, right - left - 6), 1)
          }
        }
        ctx.fillStyle = '#ffe4c3'
        ctx.fillRect(3, -11, 2, 7)
        ctx.fillRect(-3, 4, 2, 6)
      } else {
        const t = (age - heavyStrike.hold) / (122 - heavyStrike.hold)
        ctx.fillStyle = '#e8a17b'
        for (const sign of [-1, 1]) ctx.fillRect(7 + Math.round(12 * t),
          sign * (4 + Math.round(7 * t)), Math.max(1, Math.round(7 * (1 - t))), 2)
      }
      ctx.restore()
    } else if (!impact.heavy && age < (material ? 55 : 78) && !this.reducedMotion) {
      const cell = material === 'ice' ? age < 25 ? 'frost-start' : 'frost-contact'
        : age < 25 || material === 'brass' ? 'chip-start' : 'chip-burst'
      this.drawCell(frame('effects', cell), impact.x, impact.y, px)
    }
    if (this.reducedMotion || !impact.dust) return
    if (impact.defeated && impact.target !== 'player') return
    if (material) {
      drawMaterialChips(this.context, material, age, impact.x, impact.y, this.floor, px, impact.heavy)
      return
    }
    for (let i = 0; i < 7; i++) {
      const t = Math.max(0, (age - (i > 3 ? 72 : 20)) / debrisDuration)
      if (!t) continue
      this.context.fillStyle = i > 3 ? '#a89880' : '#d5c6aa'
      const size = (i > 3 ? 1 : 2) * px
      this.context.fillRect(Math.round(impact.x + dir * (8 + i * 5) * t * px),
        Math.round(impact.y + (50 * t * t - (i % 3 + 1) * 9 * t) * px), size, size)
    }
  }

  private drawBrokenBody(art: string, rect: readonly number[], pivot: readonly number[], foot: number, ground: number, scale: number, age: number,
    material: Material | null | undefined = impactMaterial(this.enemyId, 'enemy')) {
    const sheet = this.pixelData.get(art)
    if (!sheet) return false
    const key = art + '/' + rect.join(',') + '/' + (material ?? '')
    let pieces = this.shards.get(key)
    if (!pieces) {
      pieces = splitSilhouette(sheet, rect, material ?? undefined)
      this.shards.set(key, pieces)
    }
    if (!pieces.length) return false
    const clearance = 5 * this.density
    let ceiling = clearance
    if (art === 'motion/escort-guard' && !this.intent.hidden) ceiling += this.intentBottom
    if (this.enemyId === 'boss') ceiling += this.bossNameBottom
    scatterBody(this.context, pieces, foot - pivot[0] * scale, ground - pivot[1] * scale,
      foot, this.floor, scale, age, this.density, ceiling)
    return true
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
    if (battle.formation) {
      this.drawUpperBattle(this.upperScene ?? battle.formation, now)
      return
    }
    if (battle.phase === 'lost') {
      this.drawDefeat(battle)
      return
    }
    this.drawBackground(this.floor, canvas.width, canvas.height)
    context.save()
    // The masonry shares the actors' plane during a camera kick; the first
    // background pass covers the small strip exposed at an edge.
    if (this.drawCameraKick(now)) this.drawBackground(this.floor, canvas.width, canvas.height)
    const parryArt = this.images.get(GOLEM_PARRY.art)
    const counterArt = this.images.get(GOLEM_COUNTER.art)
    if (this.golemCounter && parryArt?.naturalWidth && counterArt?.naturalWidth) {
      const elapsed = this.golemCounter.landedAt === undefined
        ? Math.min(GOLEM_COUNTER.contact - 1, (now - this.golemCounter.start) * this.animationSpeed)
        : GOLEM_COUNTER.contact + (now - this.golemCounter.landedAt) * this.animationSpeed
      drawGolemCounter(context, counterArt, parryArt, elapsed, this.floor, this.density,
        this.placements.get(hero)!, this.placements.get(golem)!, this.golemCounter.defeated,
        (rect, pivot, foot, scale, age) => this.drawBrokenBody(GOLEM_COUNTER.art, rect, pivot, foot, this.floor, scale, age))
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
    const swingAge = swing ? swingTime(swing, now, this.animationSpeed) : Infinity
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
      : swingAge < swing.contact + (swing.heavy ? 12 : 35) ? 'attack' : 'attack-follow'
    else if (approaching && attack.guarded) pose = this.reducedMotion || left < 113 ? 'guard' : 'guard-lift'
    if (pose === 'guard-brace' && attack && enemy.name !== 'slime-pool') {
      const striker = attack.escort && attack.index <= 0 && battle.escort ? ESCORT_SPRITE : enemy
      const intent = striker === ESCORT_SPRITE ? { ...attack.intent, id: 'impact', mechanic: undefined } : attack.intent
      pose = this.incomingPoint(attackFrame(striker.name, intent, attack.index > 0, attack.weakened, 'contact'), striker, true).stance
    }
    let dx = 0, dy = 0
    if (swing && (pose === 'attack' || pose === 'step' || pose === 'attack-follow')) {
      const point = this.bladePoint(swing.target)
      const t = this.reducedMotion ? 1 : swingProgress ** 2
      dx = (point.x - hand.foot - (heroSwordTip[0] - hero.poses.attack) * hand.scale) * t
      dy = (point.y - this.floor - (heroSwordTip[1] - hero.footY) * hand.scale) * t
      if (swing.heavy && swingAge < 96) dx -= (1 - t) * 10 * this.density
      if (swing.heavy && pose === 'attack-follow') dx += 8 * this.density * Math.sin(Math.PI * Math.min(1, (swingAge - 108) / 70))
    } else if (pose === 'attack-prepare' && swing?.heavy) {
      dx = -10 * this.density * Math.min(1, swingAge / 22)
    } else if (!this.reducedMotion && !pose.startsWith('guard-') && pose !== 'hit' && (hurt || (brace && !brace.parry))) {
      // These two contact drawings already carry the recoil above the planted boot.
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
      const isPool = sprite.name === 'slime-pool'
      let clip: keyof typeof poolClips = 'idle'
      let clock = this.reducedMotion ? 0 : (now * this.animationSpeed % 940) / 1000
      if (target === 'enemy' && !this.reducedMotion && this.frame.offsetParent && battle.enemyHp && this.idleTimer === undefined) {
        this.idleTimer = window.setTimeout(() => {
          this.idleTimer = undefined
          if (this.frame.offsetParent) this.draw()
        }, isPool ? 25 : 135)
      }
      let poolAim: { x: number, y: number } | undefined
      let shift = 0, lift = 0, strikeHeight: number | undefined
      const defeated = impact?.defeated || target === 'enemy' && battle.enemyHp === 0
      if (defeated && isPool) {
        // The pool takes the finishing hit in its rigged hit clip, then its own painted
        // cell breaks into fragments on the same release, flight and landing as stone.
        const heavy = Boolean(impact?.heavy)
        const held = Math.min(this.reducedMotion ? 0 : elapsed, fracture.release)
        clip = heavy ? 'heavy-hit' : 'hit'
        clock = heavy ? .04 + held / 810 : .045 + held / 610
        const image = this.images.get('motion/slime-pool-rig')
        if (image?.naturalWidth && (this.reducedMotion || elapsed >= fracture.release)) {
          const frames = poolClips[clip]
          const [, x, y] = frames.filter(([t]) => t <= clock + 1e-6).at(-1) ?? frames[0]
          if (this.drawBrokenBody('motion/slime-pool-rig', [x, y, ...poolFormat.size], poolFormat.pivot,
            this.atlasFoot(sprite), this.floor, placement.scale, this.reducedMotion ? fracture.settled : elapsed)) return
          clip = 'death'
          clock = .85
        }
      } else if (defeated) {
        // The recoiling full body breaks into its own painted pixels (seed 12 contract).
        cell = frame(sprite.name, 'hit')
        shift = this.reducedMotion ? 0 : 4 * this.density * Math.min(1, Math.max(0, elapsed - 40) / 44)
        if (target === 'escort' && impact) lift = impact.lift * Math.max(0, 1 - elapsed / 105)
        if (this.reducedMotion || elapsed >= fracture.release) {
          const { art, atlas, cell: source } = atlasCell(cell)
          if (this.drawBrokenBody(art, source.rect, atlas.pivot, this.atlasFoot(sprite) + shift,
            this.floor + lift, placement.scale, this.reducedMotion ? fracture.settled : elapsed)) return
          cell = hurtFrame(sprite.name, 0, true, fracture.settled)
        }
      } else if (impact && elapsed < (impact.heavy ? 245 : 135) && (!striking || !atContact || impact.start >= (attack.last ?? 0))) {
        clip = impact.heavy ? 'heavy-hit' : 'hit'
        clock = this.reducedMotion ? (impact.heavy ? .105 : .045) : (impact.heavy ? .04 + elapsed / 810 : .045 + elapsed / 610)
        cell = hurtFrame(sprite.name, impact.damage, false, elapsed)
        if (target === 'escort') lift = impact.lift * Math.max(0, 1 - elapsed / 105)
        if (impact.heavy && !this.reducedMotion) {
          cell = frame(sprite.name, elapsed < heavyStrike.hold ? 'hit' : 'heavy-hit')
          const recoil = Math.min(1, Math.max(0, elapsed - heavyStrike.hold) / 185)
          if (isPool) shift = 17 * this.density * Math.sin(Math.PI * recoil)
        } else if (isPool && !this.reducedMotion && elapsed > impact.hold) {
          shift = 6 * this.density * Math.sin(Math.PI * Math.min(1, (elapsed - impact.hold) / 88))
        }
      } else if (striking && (since < contactHold + 54 || approaching)) {
        const stage = atContact ? 'contact' : since < contactHold + 54 ? 'follow' : left <= 78 ? 'approach' : 'anticipate'
        const repeated = atContact || since < contactHold + 54 ? attack.index > 0 : attack.index >= 0
        const attackIntent = target === 'escort' ? { ...attack.intent, id: 'impact', mechanic: undefined } : attack.intent
        cell = attackFrame(sprite.name, attackIntent, repeated, attack.weakened, stage)
        if (isPool) {
          clip = 'attack'
          clock = atContact ? poolFormat.event.time + Math.min(.049, since / 1000)
            : stage === 'follow' ? .37 + Math.max(0, since - contactHold) / 260
            : Math.max(0, poolFormat.event.time * (1 - left / 154))
        }
        const contact = attackFrame(sprite.name, attackIntent, repeated, attack.weakened, 'contact')
        const tip = this.incomingPoint(contact, sprite, attack.guarded)
        const ink = atlasCell(contact)
        if (!isPool && ink.cell.candidateContact) strikeHeight = ink.cell.candidateContact[1] - ink.atlas.pivot[1]
        if (isPool) {
          poolAim = tip
          const picture = this.images.get('hero-' + pose)
          if ((atContact || (clock >= .37 && clock < .375)) && picture?.naturalWidth) {
            const heroX = Math.round(hand.foot + dx - hero.poses[pose] * hand.scale)
            const heroY = Math.round(this.floor + dy - hero.footY * hand.scale)
            const edge = this.edgePixel('hero-' + pose, [0, 0, picture.width, picture.height],
              (tip.y - heroY) / hand.scale - .5, true)
            poolAim = { x: heroX + (edge.x + .5) * hand.scale, y: heroY + (edge.y + .5) * hand.scale }
          }
        }
        const t = atContact ? 1 : since < contactHold + 54 ? 1 - (since - contactHold) / 54 : Math.max(0, 1 - left / 90)
        shift = tip.shift * Math.min(1, t)
        lift = tip.lift * Math.min(1, t)
      } else if (interrupted) {
        cell = this.transition!.pose
        clip = 'heavy-hit'
        clock = .105
      } else if (isPool && attack && since >= contactHold + 54 && since < contactHold + 160 && !this.reducedMotion) {
        clip = 'attack'
        clock = Math.min(.78, .577 + (since - contactHold - 54) / 510)
      } else if (isPool && cell.pose !== 'ready') {
        clip = cell.pose === 'anticipate' ? 'attack' : 'heavy-hit'
        clock = cell.pose === 'anticipate' ? .105 : .155
      }
      if (isPool) {
        const image = this.images.get('motion/slime-pool-rig')
        if (image?.naturalWidth) {
          const frames = poolClips[clip]
          let index = frames.length - 1
          while (index > 0 && frames[index][0] > clock + 1e-6) index--
          const [, x, y] = frames[index]
          const scale = placement.scale
          const [width, height] = poolFormat.size
          const groundX = Math.round(this.atlasFoot(sprite) - poolFormat.pivot[0] * scale)
          const groundY = Math.round(this.floor - poolFormat.pivot[1] * scale)
          const parts = this.images.get('motion/slime-pool-layers')
          if (clip === 'attack' && poolAim && parts?.naturalWidth && clock >= .223) {
            const sheetHeight = image.naturalHeight
            context.drawImage(parts, x, y, width, height, groundX, groundY, width * scale, height * scale)
            const [tipX, tipY] = poolFormat.contact
            const strike = poolFormat.event.time
            const reach = Math.max(0, Math.min(1, (clock - .223) / (strike - .223), (.58 - clock) / (.58 - .375)))
            const deltaX = (poolAim.x - groundX - tipX * scale) * reach
            const deltaY = (poolAim.y - groundY - tipY * scale) * reach
            const hinge = 61
            const weight = (column: number) => Math.max(0, Math.min(1, (hinge - column) / (hinge - tipX)))
            const screenX = (column: number) => Math.round(groundX + column * scale + deltaX * weight(column))
            for (let col = 0; col < hinge; col++) {
              const leftEdge = screenX(col)
              const span = screenX(col + 1) - leftEdge
              if (span > 0) context.drawImage(parts, x + col, y + sheetHeight, 1, height, leftEdge,
                groundY + Math.round(deltaY * weight(col + .5)), span, height * scale)
            }
            context.drawImage(parts, x + hinge, y + sheetHeight, width - hinge, height,
              groundX + hinge * scale, groundY, (width - hinge) * scale, height * scale)
            context.drawImage(parts, x, y + sheetHeight * 2, width, height, groundX, groundY, width * scale, height * scale)
          } else {
            context.drawImage(image, x, y, width, height, groundX, groundY, width * scale, height * scale)
          }
          return
        }
      }
      const foot = this.atlasFoot(sprite) + shift
      if (cell.pose === 'ready' && !this.reducedMotion && Math.floor(now * this.animationSpeed / 510) % 2) {
        const detailed = placement.scale >= 2 ? this.images.get('motion/detail/idle-alt/' + sprite.name) : undefined
        const alt = detailed?.naturalWidth ? detailed : this.images.get('motion/idle-alt/' + sprite.name)
        if (alt?.naturalWidth) {
          const {atlas, cell: base} = atlasCell(cell)
          context.drawImage(alt, 0, 0, alt.width, alt.height, Math.round(foot - atlas.pivot[0] * placement.scale),
            Math.round(this.floor - atlas.pivot[1] * placement.scale), base.rect[2] * placement.scale, base.rect[3] * placement.scale)
          return
        }
      }
      this.drawCell(cell, foot, this.floor, placement.scale, lift, strikeHeight)
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

  private drawCameraKick(now: number) {
    if (this.reducedMotion || !this.trauma) return 0
    const distance = Math.min(this.shake, 7 * this.density * this.trauma ** 2)
    const elapsed = Math.max(0, (now - this.kickAt) * this.animationSpeed)
    const wave = this.rebounds ? Math.cos(Math.PI * Math.min(1, elapsed / 58)) : 1
    const cameraX = this.direction * Math.round(wave * distance)
    this.context.translate(cameraX, 0)
    return cameraX
  }

  private drawUpperBattle(formation: Formation, now: number) {
    const { canvas, context, density, floor } = this
    this.drawBackground(floor, canvas.width, canvas.height)
    context.save()
    const cameraX = this.drawCameraKick(now)
    const px = Math.max(1, Math.round(density))
    const tier = upperTier(canvas.width / density)
    const wide = tier === 60
    const upper = Math.round(tier * density)
    // The rear rank stands on a fixed stone ledge, drawn behind every actor.
    const ledge = this.images.get(upperLedge)
    const ledgeX = Math.round(canvas.width * .535)
    if (ledge?.naturalWidth) context.drawImage(ledge, ledgeX, floor - upper, canvas.width - ledgeX, upper)
    const motion = this.upperMotion
    const elapsed = motion ? Math.max(0, (now - motion.at) * this.animationSpeed - motion.hold) : Infinity
    const progress = this.reducedMotion ? 1 : Math.min(1, elapsed / 220)
    const shiftProgress = motion?.from ? motion.kind === 'advance' ? progress : 0 : 1
    const foes = livingEnemies(formation)
    const previous = motion?.from && livingEnemies(motion.from)
    const getX = (lane: number, count = foes.length) => Math.round(upperActorLanes(count, wide)[lane] * canvas.width)
    const getY = (lane: number) => floor - (lane ? upper : 0)
    const point = (id: UpperRole, index: number) => {
      const before = previous?.findIndex(enemy => enemy.id === id) ?? index
      const old = before < 0 ? index : before
      const fromX = getX(old, previous?.length)
      return { x: Math.round(fromX + (getX(index) - fromX) * shiftProgress),
        y: Math.round(getY(old) + (getY(index) - getY(old)) * shiftProgress), old }
    }
    // The boss has denser front art and its own compact rear cells.
    const selectScale = (id: UpperRole, index: number) => (4 + Number(wide) - Number(index > 0 || id === 'gatekeeper')) * px
    const centerOffset = (cell: ReturnType<typeof atlasCell>['cell'], pivot: number[], scale: number) =>
      Math.round((cell.bounds[0] + cell.bounds[2] / 2 - pivot[0]) * scale)
    // The swordsman stands at the lower arena's whole scale when the opening front rank
    // leaves room for the idle body (only the 4-texel sword tip may pass in front of the
    // foe's edge), otherwise one step smaller. The choice is kept for the encounter and
    // screen width, so the hero never resizes when a foe falls. Every pose's back foot
    // (hit and wind-up reach 30 texels behind the anchor) stays on screen.
    const laneHeroX = (count: number) => Math.round(canvas.width * (count === 3 ? .083 : .095))
    const heroBack = 30, heroFront = 41 - 4
    const safeHeroX = (count: number, scale: number) => Math.max(laneHeroX(count), heroBack * scale)
    const fitKey = formation.enemies.map(({ id }) => id).join() + '@' + canvas.width
    if (this.upperHeroFit?.key !== fitKey && foes.length) {
      const { cell, atlas } = atlasCell(frame(upperSprites[foes[0].id], 'ready'))
      const scale = selectScale(foes[0].id, 0)
      const frontInk = getX(0) - centerOffset(cell, atlas.pivot, scale) + (cell.bounds[0] - atlas.pivot[0]) * scale
      let fit = px
      for (let candidate = 2 * px; candidate > px; candidate--) {
        if (safeHeroX(foes.length, candidate) + heroFront * candidate <= frontInk) { fit = candidate; break }
      }
      this.upperHeroFit = { key: fitKey, scale: fit }
    }
    const heroScale = this.upperHeroFit?.scale ?? px
    const heroX = safeHeroX((previous ?? foes).length, heroScale)
    // Smallest horizontal offset that keeps this pose's painted pixels on the canvas
    // after the camera translation.
    const heroSafeShift = (pose: string) => {
      const left = this.heroInkLeft(pose)
      return left === undefined ? -Infinity : Math.ceil((heroFootX - left) * heroScale - heroX - cameraX)
    }
    if (foes.length) {
      context.fillStyle = '#bfa985'
      context.fillRect(getX(0) - 21 * px, floor + px, 42 * px, px)
    }
    for (const [index, enemy] of foes.entries()) {
      const { x, y } = point(enemy.id, index)
      // The painted stone ledge replaces the flat placeholder strip under the rear rank.
      if (y < floor && ledge?.naturalWidth) continue
      const ledgeWidth = (index ? 21 : 24) * px
      context.fillStyle = index ? '#8a8171' : '#a69678'
      context.fillRect(x - ledgeWidth, y + px, ledgeWidth * 2, px)
      context.fillStyle = '#1a1715b8'
      context.fillRect(x - ledgeWidth - 2 * px, y + 2 * px, (ledgeWidth + 2 * px) * 2, 2 * px)
    }
    for (const fall of this.upperFallen) {
      const name = upperSprites[fall.id]
      const age = this.reducedMotion ? fracture.settled : (now - fall.at) * this.animationSpeed
      const scale = selectScale(fall.id, fall.lane)
      const pose = this.reducedMotion ? frame(name, 'down') : hurtFrame(name, 8, true, age)
      const { cell, atlas, art } = atlasCell(age < fracture.release || this.reducedMotion ? pose : frame(name, 'heavy-hit'))
      const x = getX(fall.lane, fall.count) - centerOffset(cell, atlas.pivot, scale)
      const y = getY(fall.lane)
      if (age < fracture.release || this.reducedMotion) this.drawCell(pose, x, y, scale)
      else this.drawBrokenBody(art, cell.rect, atlas.pivot, x, y, scale, age, upperMaterials[fall.id] ?? null)
    }
    let bladeX = 0, bladeY = 0
    let blockPoint: { x: number; y: number } | undefined
    let heroPose = this.battle?.phase === 'lost' ? 'down' : 'idle'
    function bladeOffset(x: number, y: number, t: number) {
      bladeX = (x - heroX - (heroSwordTip[0] - heroFootX) * heroScale) * t
      bladeY = (y - floor - (heroSwordTip[1] - hero.footY) * heroScale) * t
    }
    const drawOrder = foes.map((_, index) => index).reverse()
    if (motion && (motion.kind === 'attack' ? !this.reducedMotion && elapsed >= 60 :
      (motion.kind === 'block' || motion.kind === 'recoil') && elapsed <= 126)) {
      // A descending attacker passes in front of the guard when its feet cross
      // the halfway point between the ledge and the floor, then returns behind it.
      const active = drawOrder.findIndex(lane => lane > 0 && foes[lane].id === motion.id)
      if (active >= 0) drawOrder.push(drawOrder.splice(active, 1)[0])
    }
    for (const index of drawOrder) {
      const enemy = foes[index]
      const name = upperSprites[enemy.id]
      const { old, ...position } = point(enemy.id, index)
      let { x, y } = position
      const displayLane = shiftProgress < .65 ? old : index
      const scale = selectScale(enemy.id, displayLane)
      const isSource = motion?.id === enemy.id
      const stance = enemy.action.pose
      let pose = frame(name, displayLane ? 'rear-ready' : 'ready')
      let contactLift = 0, contactRow: number | undefined
      if (enemy.toppled) pose = frame(name, 'fall')
      else if (enemy.id === 'gatekeeper') {
        if (stance === 'prepare') pose = frame(upperBossArt, wide ? 'charge-peak' : 'charge-set')
        if (stance === 'weakened') pose = frame(upperBossArt, 'weak-set')
        if (stance === 'cancelled') pose = frame(upperBossArt, 'interrupted-knee')
        if (formation.bossStep === 'recover') pose = frame(upperBossArt, 'recover-end')
      }
      if (motion?.kind === 'advance' && (old !== index || previous?.length !== foes.length) && progress < 1) {
        pose = frame(name, progress < .47 ? 'step-plant' : 'step-stride')
        if (isSource && formation.movedBack === enemy.id && progress < .32) pose = frame(name, 'special-contact')
        if (!this.reducedMotion) y -= Math.round(Math.sin(progress * Math.PI * 2) ** 2 * 3 * px)
      }
      if (isSource && motion.kind === 'support') pose = frame(name, 'special-contact')
      if (isSource && motion.kind === 'hit' && elapsed < 225) {
        pose = hurtFrame(name, motion.amount!, false, elapsed)
        if (!this.reducedMotion) x += Math.round(Math.sin(Math.PI * progress) * (motion.amount! >= 5 ? 9 : 4) * px)
      }
      if (isSource && (motion.kind === 'attack' || motion.kind === 'block' || motion.kind === 'recoil')) {
        const preparing = motion.kind === 'attack'
        const stage = preparing ? elapsed < 55 ? 'anticipate' : 'approach' : elapsed < 65 ? 'contact' : 'follow'
        const intent = { ...enemyIntentAt(this.battle!), id: 'impact' as const, mechanic: undefined }
        const attackPose = (beat: typeof stage) => motion.heavy
          ? frame(upperBossArt, (motion.weakened ? upperWeakPoses : upperHeavyPoses)[upperAttackStages.indexOf(beat)])
          : attackFrame(name, intent, Boolean(motion.repeat), false, beat)
        pose = displayLane && stage === 'anticipate' && !motion.heavy && !motion.repeat ? frame(name, 'rear-anticipate') : attackPose(stage)
        const { cell, atlas } = atlasCell(attackPose('contact'))
        const tip = cell.candidateContact ?? [cell.bounds[0], atlas.pivot[1] - 14]
        const distance = preparing ? Math.min(1, elapsed / 120) : Math.max(0, 1 - Math.max(0, elapsed - 65) / 120)
        contactRow = tip[1] - atlas.pivot[1]
        const tipHeight = contactRow * scale + Math.floor(scale / 2)
        const aim = nearestHeroContact(hero.footY + (tipHeight - Math.floor(heroScale / 2)) / heroScale, !motion.amount)
        heroPose = preparing ? 'guard' : aim.stance
        if (motion.kind === 'recoil' && !this.reducedMotion) {
          bladeX = -Math.round(Math.sin(Math.PI * Math.min(1, elapsed / 108)) * (motion.heavy ? 7 : 4) * px)
        }
        // The recoil and the camera kick share the anchor the weapon aims at. Shorten the
        // recoil so the pose's painted back edge never leaves the canvas.
        bladeX = Math.max(bladeX, heroSafeShift(heroPose))
        const aimX = heroX + bladeX + (aim.x - heroFootX) * heroScale + Math.floor(heroScale / 2)
        const aimY = floor + (aim.y - hero.footY) * heroScale + Math.floor(heroScale / 2)
        if (!this.reducedMotion || !preparing) {
          const tipX = (tip[0] - atlas.pivot[0]) * scale + Math.floor(scale / 2)
          x += Math.round((aimX - x - tipX) * distance)
          // Descend from the rear ledge to the front floor. Any remaining vertical
          // error belongs to the weapon-bearing upper body; keep the soles planted.
          y += Math.round((floor - y) * distance)
          contactLift = Math.round((aimY - floor - tipHeight) * distance)
        }
        if (motion.kind === 'block') blockPoint = { x: aimX, y: aimY }
      }
      context.save()
      if (displayLane && !(isSource && motion.kind !== 'advance')) context.filter = 'brightness(.93)'
      const { cell, atlas } = atlasCell(pose)
      if (!isSource || !['attack', 'block', 'recoil'].includes(motion.kind)) {
        x -= centerOffset(cell, atlas.pivot, scale)
      }
      this.drawCell(pose, x, y, scale, contactLift, contactRow)
      context.restore()
      if (isSource && motion.kind === 'swing') {
        const t = this.reducedMotion ? 1 : Math.min(1, elapsed / 106)
        heroPose = t < .35 ? 'attack-prepare' : t < .82 ? 'step' : 'attack'
        bladeOffset(x + (cell.bounds[0] - atlas.pivot[0]) * scale, y - 18 * px, t)
      }
    }
    if (motion?.blade && motion.kind === 'hit' && elapsed < 145) {
      const lane = previous?.findIndex(enemy => enemy.id === motion.id) ?? 0
      const name = upperSprites[motion.id]
      const { cell } = atlasCell(frame(name, lane ? 'rear-ready' : 'ready'))
      const held = this.reducedMotion ? 1 : Math.min(1, (145 - elapsed) / 92)
      heroPose = held === 1 ? 'attack' : 'attack-follow'
      bladeOffset(getX(lane, previous?.length) - cell.bounds[2] * selectScale(motion.id, lane) / 2, getY(lane) - 18 * px, held)
    }
    this.placements.set(hero, { foot: heroX, scale: heroScale, travel: 0 })
    this.drawHero(heroPose, Math.max(bladeX, heroSafeShift(heroPose)), bladeY)
    if (motion?.kind === 'hit' && !motion.defeated && !this.reducedMotion) {
      const material = upperMaterials[motion.id]
      const lane = previous?.findIndex(enemy => enemy.id === motion.id) ?? -1
      if (material && lane >= 0) {
        const { cell } = atlasCell(frame(upperSprites[motion.id], lane ? 'rear-ready' : 'ready'))
        const ground = getY(lane)
        const x = getX(lane, previous?.length) - cell.bounds[2] * selectScale(motion.id, lane) / 2
        drawMaterialChips(context, material, elapsed, x, ground - 18 * px, ground, px, motion.amount! >= 5)
      }
    }
    if (blockPoint && elapsed < 100) {
      context.fillStyle = '#ffe5a6'
      context.fillRect(blockPoint.x - 3 * px, blockPoint.y - px, 8 * px, 2 * px)
      context.fillRect(blockPoint.x - px, blockPoint.y - 4 * px, 2 * px, 8 * px)
    }
    context.restore()
  }

  private heroInk = new Map<string, number>()
  private heroInkLeft(pose: string) {
    if (this.heroInk.has(pose)) return this.heroInk.get(pose)
    const pixels = this.pixelData.get('hero-' + pose)
    if (!pixels) return undefined
    let left = pixels.width
    for (let y = 0; y < pixels.height; y++) for (let x = 0; x < left; x++) {
      if (pixels.data[(y * pixels.width + x) * 4 + 3]) { left = x; break }
    }
    this.heroInk.set(pose, left)
    return left
  }

  setUpperScene(formation?: Formation, motion?: UpperMotion) {
    const at = performance.now()
    let hold = 0
    if (!this.reducedMotion && (motion?.kind === 'hit' || motion?.kind === 'recoil')) {
      const tier = battleImpactTier({ target: motion.kind === 'hit' ? 'enemy' : 'player', damage: motion.amount!, defeated: motion.defeated })
      hold = Math.min(56, this.kickCamera(tier, motion.kind === 'hit' ? 1 : -1, at))
      this.lastFrame = at
    }
    this.upperScene = formation
    this.upperMotion = motion && { ...motion, at, hold }
    if (!formation) this.upperFallen = []
    if (motion?.defeated && formation) {
      const previous = livingEnemies(motion.from ?? formation)
      const lane = previous.findIndex(enemy => enemy.id === motion.id)
      this.upperFallen.push({ id: motion.id, lane: Math.max(0, lane), count: previous.length, at })
    }
    this.restartAnimation()
  }

  private animate = () => {
    if (this.heldParryAt !== undefined) return
    const now = performance.now()
    this.trauma = Math.max(0, this.trauma - Math.max(0, now - this.lastFrame) * .0065 * this.animationSpeed)
    this.lastFrame = now
    if (this.frozen && now >= this.frozen.until) {
      this.frozen = undefined
    }
    const parryIsPlaying = this.golemParry !== undefined && (now - this.golemParry) * this.animationSpeed < GOLEM_PARRY.end
    const counterIsPlaying = this.golemCounter && (this.golemCounter.landedAt === undefined ||
      (now - this.golemCounter.landedAt) * this.animationSpeed <
      (this.golemCounter.defeated ? fracture.settled : GOLEM_COUNTER.end - GOLEM_COUNTER.contact))
    const falling = !this.reducedMotion && [...this.falls.values()].some(hit => hit.target !== 'player' && (now - hit.start) * this.animationSpeed < fracture.settled)
    this.shadows = this.shadows.filter(({ at }) => (now - at) * this.animationSpeed < 80 + shadowFade)
    this.impacts = this.impacts.filter((hit) => now - hit.start < (this.reducedMotion ? 144 : debrisDuration / this.animationSpeed))
    if (this.attack && this.attack.index + 1 >= this.attack.count && now - (this.attack.last ?? this.attack.start) > 180 / this.animationSpeed) this.attack = undefined
    if (this.swing && swingTime(this.swing, now, this.animationSpeed) > this.swing.contact + 150) this.swing = undefined
    if (this.transition && (now - this.transition.at) * this.animationSpeed > 200) this.transition = undefined
    this.draw(now)
    const upperPlaying = !this.reducedMotion && (this.upperMotion && (now - this.upperMotion.at) * this.animationSpeed < 240 ||
      this.upperFallen.some(fall => (now - fall.at) * this.animationSpeed < fracture.settled))
    if (this.attack || this.swing || this.transition || parryIsPlaying || counterIsPlaying || falling || upperPlaying || this.impacts.length || this.frozen || this.shadows.length || this.trauma) {
      this.animation = requestAnimationFrame(this.animate)
    }
  }

  setAnimation(speed: number, reducedMotion: boolean) {
    if (this.animationSpeed === speed && this.reducedMotion === reducedMotion) return
    this.animationSpeed = speed
    this.reducedMotion = reducedMotion
    if (reducedMotion) {
      if (this.swing?.heavy) this.swing = undefined
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

  clearContact(keepFallen = false) {
    this.heldParryAt = undefined
    this.attack = undefined
    this.trauma = 0
    this.recoverUntil = 0
    this.swing = undefined
    this.brace = undefined
    this.transition = undefined
    if (!keepFallen) this.falls.clear()
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

  private kickCamera(tier: keyof typeof impactMotion, direction: number, now: number) {
    const motion = impactMotion[tier]
    this.trauma = Math.max(this.trauma, motion.shake)
    this.kickAt = now
    this.direction = direction
    this.rebounds = tier !== 'light'
    return motion.stop
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
      const heavy = Boolean(this.swing?.heavy && this.swing.target === hit.target && this.swing.landed === undefined)
      const impact = { ...hit, ...point, start: now, hold, heavy, dust: !ordered || !incoming || Boolean(current && current.index === current.count - 1) }
      this.impacts.push(impact)
      if (hit.defeated) this.falls.set(hit.target, impact)
      if (hit.target !== 'player' && !joint) {
        if (heavy && this.swing) this.swing.landed = now
        else this.swing = { start: now - 96 / this.animationSpeed, contact: 96, target: hit.target }
        const recovery = hit.defeated ? fracture.end : heavy ? heavyStrike.hold + heavyStrike.follow + 80 : 150
        this.recoverUntil = Math.max(this.recoverUntil, now + recovery / this.animationSpeed)
      }
    }
    if (this.reducedMotion || (parry && this.golemParry !== undefined)) {
      this.restartAnimation()
      return
    }
    let duration = parry ? 120 : guarded ? 30 : 0
    for (const hit of hits) {
      duration = Math.max(duration, this.kickCamera(battleImpactTier(hit), hit.target === 'player' ? -1 : 1, now))
    }
    this.lastFrame = now
    if (duration) this.freeze(duration, now)
    else this.restartAnimation()
  }

  windUpHeavy(target: 'enemy' | 'escort', now: number) {
    this.swing = { start: now, contact: 96, target, heavy: true }
    this.restartAnimation()
  }

  scheduleResponse(start: number) {
    if (this.attack) this.attack.start = start
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
    this.clearContact(true)
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

  landGolemCounter() {
    if (!this.golemCounter) return
    const now = performance.now()
    this.golemCounter.landedAt = now
    // Commit the authored contact cell in the same task as its damage and HP.
    this.draw(now)
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
    if (enemyId === 'rage') {
      this.load('motion/slime-pool-rig')
      this.load('motion/slime-pool-layers')
    }
    if (fineArt.has(enemy.name)) {
      this.load('motion/detail/' + enemy.name)
      this.load('motion/detail/idle-alt/' + enemy.name)
    }
    if (enemyId !== 'rage') this.load('motion/idle-alt/' + enemy.name)
    this.load('motion/' + enemy.name)
    this.load(enemy.name + '-idle')
    this.load('motion/effects')
    if (enemyId === 'boss') this.load('motion/boss-special')
    if (enemyId === 'freeze') this.load('freeze-ready')
    if (enemyId === 'escort') {
      this.load('motion/idle-alt/escort-guard')
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
    this.chamber = chambers[chamberFor(floor)]
    this.fallback = chambers[fallbackChamber(floor)]
    if (!this.encounter.hidden) {
      this.load('ui/backgrounds/' + this.chamber)
      this.load('ui/backgrounds/' + this.chamber + '-compact')
      if (battle.formation) this.load(upperLedge)
    }
    if (this.battle?.seed !== battle.seed || this.enemyId !== enemyId) {
      this.clearContact()
      this.trauma = 0
      this.enemyId = enemyId
    }
    this.battle = battle
    this.upperScene = undefined
    this.upperMotion = undefined
    this.upperFallen = []
    if (battle.formation) {
      this.loadSprite(hero)
      for (const enemy of battle.formation.enemies) this.load('motion/' + upperSprites[enemy.id])
      if (battle.formation.enemies.some(enemy => enemy.id === 'gatekeeper')) this.load('motion/' + upperBossArt)
    } else this.prime(enemyId)
    if (battle.phase !== 'counter') this.golemParry = undefined
    if (this.floor) this.positionActors()
    else this.resize()
    this.draw()
  }
}
