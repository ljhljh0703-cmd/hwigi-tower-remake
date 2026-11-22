export const PLAYER_HP = 22
export const ENEMY_HP = 30
export const DIE_COUNT = 3
export type Slot = 'attack' | 'guard'
export type Phase = 'assign' | 'counter' | 'won' | 'lost'

export interface EnemyIntent {
  readonly id: string
  readonly name: string
  readonly hits: readonly number[]
  readonly matches: (turn: number) => boolean
}

// The first matching row takes precedence.
export const ENEMY_INTENTS = [
  { id: 'impact', name: '한 방', hits: [12], matches: (turn) => turn % 2 === 1 },
  { id: 'combo', name: '연타', hits: [4, 4, 4], matches: (turn) => turn % 2 !== 1 },
] as const satisfies readonly EnemyIntent[]

export type Intent = (typeof ENEMY_INTENTS)[number]['id']

export interface Enemy {
  readonly hp: number
  readonly intents: readonly EnemyIntent[]
  readonly attackGrowth?: number
}

export const COUNTER_REWARDS = [
  { damage: 1, joint: false },
  { damage: 2, joint: false },
  { damage: 3, joint: false },
  { damage: 4, joint: false },
  { damage: 6, joint: true },
  { damage: 8, joint: true },
] as const

export type CounterReward = Pick<CounterResult, 'damage' | 'joint'>

export interface CounterResult {
  readonly slot: number
  readonly damage: number
  readonly joint: boolean
}

export interface Exchange {
  readonly turn: number
  readonly dealt: number
  readonly hitsTaken: readonly number[]
  readonly counter: CounterResult | null
  readonly awakened: boolean
  readonly awakenedDice?: readonly number[]
  readonly pairGuardBonus?: true
}

export interface Battle {
  readonly seed: number
  readonly turn: number
  readonly playerHp: number
  readonly enemyHp: number
  readonly enemyAttackBuff: number
  readonly enemyAttackGrowth?: number
  readonly enemyIntents: readonly EnemyIntent[]
  readonly dice: readonly number[]
  readonly slots: readonly (Slot | null)[]
  readonly phase: Phase
  readonly rerolled: boolean
  readonly awakened: boolean
  readonly lastExchange: Exchange | null
}

export function draw(seed: number, turn: number, channel: number): number {
  // Each draw has its own channel so a reroll never changes a later turn's opening dice.
  let value = seed ^ Math.imul(turn, 0x9e3779b9) ^ Math.imul(channel + 1, 0x85ebca6b)
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return (value ^ (value >>> 15)) >>> 0
}

export function roll(seed: number, turn: number, channel: number): number {
  return (draw(seed, turn, channel) % 6) + 1
}

export function openTurn(seed: number, turn: number) {
  return {
    turn,
    dice: Array.from({ length: DIE_COUNT }, (_, index) => roll(seed, turn, index)),
    slots: Array<Slot | null>(DIE_COUNT).fill(null),
    rerolled: false,
    phase: 'assign' as const,
  }
}

export function startBattle(seed: number, enemyIntents: readonly EnemyIntent[] = ENEMY_INTENTS): Battle {
  const normalizedSeed = seed >>> 0
  return {
    ...openTurn(normalizedSeed, 1),
    seed: normalizedSeed,
    playerHp: PLAYER_HP,
    enemyHp: ENEMY_HP,
    enemyAttackBuff: 0,
    enemyIntents,
    awakened: false,
    lastExchange: null,
  }
}

function selectEnemyIntent<T extends EnemyIntent>(turn: number, intents: readonly T[]): T {
  const intent = intents.find((row) => row.matches(turn))
  if (!intent) throw new Error(`No enemy intent defined for turn ${turn}`)
  return intent
}

type IntentContext = Pick<Battle, 'turn' | 'enemyIntents'>

export function intentOf(turn: number): Intent
export function intentOf(battle: IntentContext): string
export function intentOf(battle: number | IntentContext): string {
  if (typeof battle === 'number') return selectEnemyIntent(battle, ENEMY_INTENTS).id
  return selectEnemyIntent(battle.turn, battle.enemyIntents).id
}

function canChangeDie(battle: Battle, index: number): boolean {
  return battle.phase === 'assign' && Number.isInteger(index) && index >= 0 && index < battle.dice.length
}

export function assignDie<T extends Battle>(battle: T, index: number, slot: Slot | null): T {
  if (!canChangeDie(battle, index)) return battle
  return { ...battle, slots: battle.slots.map((current, i) => i === index ? slot : current) }
}

// Preserve the single-die draw and leave counter and awakening draws independent.
export const rerollChannels = [3, 6, 7]

export function rerollDice(battle: Battle, indices: readonly number[]): Battle {
  if (battle.rerolled || !indices.length || !indices.every((index) => canChangeDie(battle, index))) {
    return battle
  }

  const chosen = new Set(indices)
  let drawIndex = 0
  const dice = battle.dice.map((value, index) => {
    if (!chosen.has(index)) return value
    return roll(battle.seed, battle.turn, rerollChannels[drawIndex++])
  })
  return { ...battle, dice, rerolled: true }
}

export function totals(dice: readonly number[], slots: readonly (Slot | null)[]) {
  let attack = 0
  let guard = 0
  dice.forEach((value, index) => {
    if (slots[index] === 'attack') attack += value
    if (slots[index] === 'guard') guard += value
  })
  return { attack, guard }
}

export function incomingAttack({ turn, enemyAttackBuff = 0, enemyAttackGrowth = 0, enemyIntents = ENEMY_INTENTS }: Battle) {
  const { name, hits: baseHits } = selectEnemyIntent(turn, enemyIntents)
  const buff = enemyAttackBuff + enemyAttackGrowth * (turn - 1)
  const hits = baseHits.map((hit) => hit + buff)
  const totalDamage = hits.reduce((sum, hit) => sum + hit, 0)
  return { name, hits, totalDamage }
}

export function forecast(battle: Battle, slots = battle.slots, dice = battle.dice, attackBonus = 0) {
  const { attack, guard } = totals(dice, slots)
  const incoming = incomingAttack(battle)
  const dealt = Math.min(battle.enemyHp, attack + attackBonus)
  if (dealt === battle.enemyHp) return { dealt, hits: [], damage: 0, counter: false }

  let shield = guard
  const hits = incoming.hits.map((hit) => {
    const blocked = Math.min(shield, hit)
    shield -= blocked
    return hit - blocked
  })
  return {
    dealt,
    hits,
    damage: hits.reduce((sum, hit) => sum + hit, 0),
    counter: guard === incoming.totalDamage,
  }
}

function nextTurn(battle: Battle): Battle {
  return { ...battle, ...openTurn(battle.seed, battle.turn + 1) }
}

const awakeningFaces = [6, 5, 4, 3, 2, 1]
const awakeningOptions = awakeningFaces.flatMap((first) =>
  awakeningFaces.flatMap((second) => awakeningFaces.map((third) => [first, second, third])),
)

function chooseAwakeningDice(battle: Battle): number[] {
  let bestDice = battle.dice
  let bestFinishing = 0
  let bestDamage = Infinity
  let bestAttack = 0

  // Descending die order breaks ties by keeping the first equally good roll.
  for (const dice of awakeningOptions) {
    const { attack } = totals(dice, battle.slots)
    const { dealt, damage } = forecast(battle, battle.slots, dice)
    const finishing = Number(dealt === battle.enemyHp)
    const improvement = (finishing - bestFinishing) || (bestDamage - damage) || (attack - bestAttack)
    if (improvement <= 0) continue

    bestDice = dice
    bestFinishing = finishing
    bestDamage = damage
    bestAttack = attack
  }
  return [...bestDice]
}

export function resolveTurn(battle: Battle): Battle {
  if (battle.phase !== 'assign' || battle.slots.includes(null)) return battle

  const planned = forecast(battle)
  const inCrisis = planned.damage >= battle.playerHp || battle.playerHp * 10 <= PLAYER_HP * 3
  const awakeningRoll = draw(battle.seed, battle.turn, 5) / 0x100000000
  const awakened = !battle.awakened && inCrisis && awakeningRoll < 0.1
  const awakenedDice = awakened ? chooseAwakeningDice(battle) : undefined
  const dice = awakenedDice ?? battle.dice
  const result = awakenedDice ? forecast(battle, battle.slots, awakenedDice) : planned

  const playerHp = Math.max(0, battle.playerHp - result.damage)
  const enemyHp = battle.enemyHp - result.dealt
  const lastExchange: Exchange = {
    turn: battle.turn,
    dealt: result.dealt,
    hitsTaken: result.hits,
    counter: null,
    awakened,
    ...(awakenedDice && { awakenedDice }),
  }
  const resolved: Battle = {
    ...battle,
    dice,
    playerHp,
    enemyHp,
    awakened: battle.awakened || awakened,
    lastExchange,
  }

  if (enemyHp === 0) return { ...resolved, phase: 'won' }
  if (playerHp === 0) return { ...resolved, phase: 'lost' }
  if (planned.counter) return { ...resolved, phase: 'counter' }
  return nextTurn(resolved)
}

export function spinCounter(battle: Battle, rewards: readonly CounterReward[] = COUNTER_REWARDS): Battle {
  if (battle.phase !== 'counter' || !battle.lastExchange) return battle

  const slot = draw(battle.seed, battle.turn, 4) % rewards.length
  const counter = { slot, ...rewards[slot] }
  const enemyHp = Math.max(0, battle.enemyHp - counter.damage)
  const resolved = { ...battle, enemyHp, lastExchange: { ...battle.lastExchange, counter } }
  if (enemyHp === 0) return { ...resolved, phase: 'won' }
  return nextTurn(resolved)
}
