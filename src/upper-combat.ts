import type { MapNode } from './ascent-map.ts'
import type { EnemyIntent, SlotTotals } from './combat.ts'
import type { enemyForFight } from './enemy-roster.ts'

export const UPPER_ROLES = ['dash', 'support', 'shield', 'guard', 'gatekeeper'] as const
export type UpperRole = typeof UPPER_ROLES[number]
type BossStep = 'guarded' | 'advance' | 'flurry' | 'prepare' | 'strike' | 'recover'
export type UpperAction = { readonly hits: readonly number[]; readonly support?: UpperRole; readonly pose?: 'prepare' | 'retreat' | 'rest' | 'weakened' | 'cancelled' }

export interface UpperEnemy {
  readonly id: UpperRole
  readonly hp: number
  readonly maxHp: number
  readonly action: UpperAction
  readonly boost?: 2
  readonly toppled?: true
}

export interface Formation {
  readonly room: RoomKey
  readonly cap: number
  readonly enemies: readonly UpperEnemy[]
  readonly retreated?: true
  readonly movedBack?: 'shield'
  readonly bossStep?: BossStep
  readonly heavy?: 'weakened' | 'cancelled'
  readonly counterOrder?: readonly UpperRole[]
  readonly stopAtFront?: true
}

const rest: UpperAction = { hits: [] }
const hit = (...hits: number[]): UpperAction => ({ hits })
const support = (target: UpperRole): UpperAction => ({ hits: [], support: target })
type Beat = Partial<Record<UpperRole, UpperAction>>
type Room = { cap: number; order: readonly (readonly [UpperRole, number])[]; beats: readonly Beat[] }

const rooms: Readonly<Record<string, Room>> = {
  '13:fight': { cap: 6, order: [['dash', 10], ['support', 12]], beats: [
    { dash: hit(4) }, { support: hit(4) }, { dash: hit(4), support: support('dash') },
  ] },
  '14:fight': { cap: 8, order: [['shield', 14], ['dash', 14]], beats: [
    { shield: hit(3, 3) }, { dash: hit(7) }, { shield: { hits: [], pose: 'retreat' }, dash: hit(8) },
  ] },
  '15:fight': { cap: 10, order: [['shield', 17], ['dash', 16]], beats: [
    { shield: hit(5), dash: hit(4) }, { shield: hit(4, 4) }, { dash: hit(10) },
  ] },
  '15:elite': { cap: 12, order: [['shield', 22], ['support', 14]], beats: [
    { shield: hit(6), support: hit(4) }, { shield: hit(4, 4), support: support('shield') }, { shield: hit(10) },
  ] },
  '17:fight': { cap: 14, order: [['shield', 20], ['dash', 19]], beats: [
    { shield: hit(5, 5), dash: hit(4) }, { dash: hit(11) }, { shield: hit(12) },
  ] },
  '17:elite': { cap: 15, order: [['shield', 24], ['dash', 16], ['support', 14]], beats: [
    { shield: hit(6), dash: hit(5), support: support('shield') }, { shield: hit(6, 4) }, { dash: hit(8), support: hit(7) },
  ] },
  '19:boss': { cap: 18, order: [['guard', 26], ['gatekeeper', 64]], beats: [
    { guard: hit(4, 4) }, { gatekeeper: hit(12) },
  ] },
}

type RoomKey = Pick<MapNode, 'floor' | 'kind'>
const roomFor = ({ floor, kind }: RoomKey) => rooms[`${floor}:${kind}`]
const idleIntent: EnemyIntent = { id: 'wait', name: '대기', hits: [], matches: () => true }

export function upperEnemyForNode(node: MapNode): ReturnType<typeof enemyForFight> | undefined {
  const room = roomFor(node)
  if (!room || !node.enemyId) return undefined
  return { id: node.enemyId, hp: room.order.reduce((sum, [, hp]) => sum + hp, 0),
    attackGrowth: 0, attackPerUnlock: 0, intents: [idleIntent] }
}

export function livingEnemies(formation: Formation) {
  return formation.enemies.filter(enemy => enemy.hp > 0)
}

export function effectiveCounterLimit(formation: Formation) {
  return formation.stopAtFront ? formation.enemies.find(enemy => enemy.hp > 0)?.hp ?? 0
    : formation.enemies.reduce((sum, enemy) => sum + enemy.hp, 0)
}

export function startFormation(node: RoomKey): Formation | undefined {
  const room = roomFor(node)
  if (!room) return undefined
  return openFormation({ room: { floor: node.floor, kind: node.kind }, cap: room.cap,
    enemies: room.order.map(([id, hp]) => ({ id, hp, maxHp: hp, action: rest })) }, 1)
}

const bossActions: Record<Exclude<BossStep, 'guarded'>, UpperAction> = {
  advance: { hits: [], pose: 'rest' },
  flurry: hit(5, 5),
  prepare: { hits: [], pose: 'prepare' },
  strike: hit(18),
  recover: { hits: [], pose: 'rest' },
}
const bossNext = { guarded: 'advance', advance: 'flurry', flurry: 'prepare', prepare: 'strike', strike: 'recover', recover: 'flurry' } as const

export function openFormation(formation: Formation, turn: number): Formation {
  const { enemies, movedBack: _movedBack, counterOrder: _order, ...previous } = formation
  const node = formation.room
  const room = roomFor(node)
  const guarded = enemies.some(enemy => enemy.id === 'guard' && enemy.hp > 0)
  const bossStep = node.floor !== 19 ? undefined : guarded ? 'guarded' : bossNext[formation.bossStep ?? 'guarded']
  let beat = room.beats[(turn - 1) % room.beats.length]
  if (bossStep && bossStep !== 'guarded') {
    const action = bossStep === 'strike' && formation.heavy
      ? { hits: formation.heavy === 'weakened' ? [9] : [], pose: formation.heavy }
      : bossActions[bossStep]
    beat = { gatekeeper: action }
  }
  const bossToppled = enemies.some(enemy => enemy.id === 'gatekeeper' && enemy.hp > 0 && enemy.toppled)
  const heavy = bossStep === 'prepare' ? bossToppled ? 'cancelled' : undefined : bossStep === 'strike' ? formation.heavy : undefined
  const planned = enemies.map(enemy => ({
    ...enemy, action: enemy.hp === 0 || enemy.toppled ? rest :
      beat[enemy.id]?.pose === 'retreat' && formation.retreated ? rest : beat[enemy.id] ?? rest,
  }))
  const front = planned.find(enemy => enemy.hp > 0)
  if (front?.action.pose === 'retreat' && planned.some(enemy => enemy !== front && enemy.hp > 0)) {
    return { ...previous, retreated: true, movedBack: 'shield',
      enemies: [...planned.filter(enemy => enemy !== front), { ...front, action: rest }] }
  }
  return { ...previous, bossStep, heavy, enemies: planned }
}

export interface FormationDamage {
  readonly id: UpperRole
  readonly amount: number
  readonly hp: number
  readonly advance?: UpperRole
  readonly pierce: boolean
}

export function damageFormation(formation: Formation, power: number, direct = false,
  order: readonly UpperRole[] = livingEnemies(formation).map(enemy => enemy.id)) {
  const enemies = [...formation.enemies]
  const contacts: FormationDamage[] = []
  let remaining = power
  let chargeBroken = false
  let uncarriedCost = 0
  for (const id of order) {
    if (remaining <= 0) break
    const index = enemies.findIndex(enemy => enemy.id === id)
    const enemy = enemies[index]
    if (!enemy?.hp) continue
    const factor = direct && enemy.toppled ? 2 : 1
    const amount = Math.min(enemy.hp, remaining * factor)
    const hp = enemy.hp - amount
    const cost = Math.ceil(amount / factor)
    remaining -= cost
    uncarriedCost += cost
    enemies[index] = hp ? { ...enemy, hp } : { ...enemy, hp, action: rest, boost: undefined, toppled: undefined }
    const advance = hp === 0 ? enemies.find(other => other.hp > 0)?.id : undefined
    contacts.push({ id, amount, hp, advance, pierce: contacts.length > 0 })
    if (hp && direct && enemy.id === 'gatekeeper' && enemy.action.pose === 'prepare' && remaining + cost >= 12) chargeBroken = true
    if (formation.stopAtFront) break
  }
  return { formation: { ...formation, enemies, ...(chargeBroken && { heavy: 'weakened' as const }) },
    contacts, dealt: contacts.reduce((sum, contact) => sum + contact.amount, 0),
    defeated: contacts.filter(contact => contact.hp === 0).length, chargeBroken, cost: uncarriedCost }
}

export interface FormationHit {
  readonly id: UpperRole
  readonly amount: number
  readonly boosted: boolean
}

export type FormationAction = { readonly hit: FormationHit } | { readonly from: UpperRole; readonly to: UpperRole }

export function formationActions(formation: Formation) {
  const enemies = formation.enemies.map(enemy => ({ ...enemy }))
  const actions: FormationAction[] = []
  for (const enemy of enemies) {
    if (enemy.hp === 0) continue
    const { hits, support: target } = enemy.action
    const recipient = target && enemies.find(other => other.id === target && other.hp > 0)
    if (recipient) {
      recipient.boost = 2
      actions.push({ from: enemy.id, to: recipient.id })
    }
    if (hits.length) {
      for (const [index, amount] of hits.entries()) {
        const boost = index === 0 ? enemy.boost ?? 0 : 0
        actions.push({ hit: { id: enemy.id, amount: amount + boost, boosted: boost > 0 } })
      }
      enemy.boost = undefined
    }
    enemy.toppled = undefined
  }
  const raw = actions.reduce((sum, action) => sum + ('hit' in action ? action.hit.amount : 0), 0)
  const totalDamage = Math.min(21, formation.cap, raw)
  let rawSoFar = 0
  let cappedSoFar = 0
  const capped = raw <= totalDamage ? actions : actions.flatMap((action): FormationAction[] => {
    if (!('hit' in action)) return [action]
    rawSoFar += action.hit.amount
    const cappedTotal = Math.round(rawSoFar * totalDamage / raw)
    const amount = cappedTotal - cappedSoFar
    cappedSoFar = cappedTotal
    return amount ? [{ hit: { ...action.hit, amount } }] : []
  })
  return { formation: { ...formation, enemies }, actions: capped, totalDamage }
}

export function forecastFormation(formation: Formation, totals: SlotTotals) {
  const direct = damageFormation(formation, totals.attack, true)
  const enemy = formationActions(direct.formation)
  let guard = totals.guard
  const hits = enemy.actions.flatMap(action => {
    if (!('hit' in action)) return []
    const blocked = Math.min(guard, action.hit.amount)
    guard -= blocked
    return [action.hit.amount - blocked]
  })
  return { direct, enemy, hits, damage: hits.reduce((sum, hit) => sum + hit, 0),
    counter: enemy.totalDamage > 0 && totals.guard === enemy.totalDamage }
}

export interface FormationExchange {
  readonly direct: readonly FormationDamage[]
  readonly actions: readonly FormationAction[]
  readonly delayed: readonly FormationDamage[]
  readonly counter?: readonly FormationDamage[]
}
