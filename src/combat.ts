import { SEVEN_CROWN_MULTIPLIER } from './boss-relic.ts'

export const PLAYER_HP = 22
const MAX_ENEMY_DAMAGE = PLAYER_HP - 1
const MAX_TURN_ATTACK_BONUS = 6
export const ENEMY_HP = 30
export const DIE_COUNT = 3
export const combatSlots = ['attack', 'guard'] as const
export type Slot = (typeof combatSlots)[number]
export type Phase = 'assign' | 'counter' | 'won' | 'lost'

export type DieInterference = 'lock' | 'freeze'
export type Gimmick = 'trip' | 'armor' | 'reflect' | 'topple' | 'retreat'
export type EnemyMechanic =
  | { readonly kind: DieInterference }
  | { readonly kind: 'thorns' | 'rage' | 'seal' | 'steal'; readonly value: number }
  | { readonly kind: 'vitality'; readonly divisor: number; readonly minimum: number }
  | { readonly kind: 'reaction'; readonly value: number; readonly alternate: EnemyIntent }
  | { readonly kind: 'escort'; readonly hp: number; readonly bonus: number }

export interface EnemyIntent {
  readonly id: string
  readonly name: string
  readonly hits: readonly number[]
  readonly matches: (turn: number) => boolean
  readonly chargeThreshold?: number
  readonly damageTakenMultiplier?: number
  readonly mechanic?: EnemyMechanic
  readonly gimmick?: Gimmick
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
  readonly escortDealt?: number
  readonly chargeBroken?: true
  readonly gimmick?: Gimmick
  readonly heartRevived?: true
  readonly crownTriggered?: true
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
  readonly nextInterference?: DieInterference
  readonly fixedDie?: { readonly index: number; readonly kind: DieInterference }
  readonly stolenDie?: { readonly remaining: number }
  readonly escort?: { readonly hp: number; readonly bonus: number }
  readonly weakenedStrikeTurn?: number
  readonly erasedStrikeTurn?: number
  readonly armorBroken?: true
  readonly interrupted?: { readonly turn: number; readonly kind: 'trip' | 'topple' }
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

type IntentContext = Pick<Battle, 'turn' | 'enemyIntents' | 'interrupted'> & {
  readonly itemsSeven?: true
  readonly lastExchange?: Exchange | null
}

export function enemyIntentAt({ turn, enemyIntents = ENEMY_INTENTS, interrupted, itemsSeven, lastExchange }: IntentContext): EnemyIntent {
  if (interrupted?.turn === turn && interrupted.kind === 'topple') {
    const damageTakenMultiplier = itemsSeven && lastExchange?.crownTriggered ? SEVEN_CROWN_MULTIPLIER : 2
    return { id: 'knockdown', name: '넉다운', hits: [], damageTakenMultiplier, matches: () => true }
  }
  if (interrupted?.turn === turn && selectEnemyIntent(turn, enemyIntents).hits.length) {
    return { id: 'stunned', name: '기절', hits: [], matches: () => true }
  }
  return selectEnemyIntent(turn, enemyIntents)
}

export function intentOf(turn: number): Intent
export function intentOf(battle: IntentContext): string
export function intentOf(battle: number | IntentContext): string {
  if (typeof battle === 'number') return selectEnemyIntent(battle, ENEMY_INTENTS).id
  return enemyIntentAt(battle).id
}

function canChangeDie(battle: Battle, index: number): boolean {
  return battle.phase === 'assign' && Number.isInteger(index) && index >= 0 && index < battle.dice.length
}

export function assignDie<T extends Battle>(battle: T, index: number, slot: Slot | null): T {
  if (!canChangeDie(battle, index) || (slot !== null && !combatSlots.includes(slot))) return battle
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

export function dieFaceForSlot(face: number, slot: Slot | null, mechanic?: EnemyMechanic) {
  return slot && mechanic?.kind === 'seal' && face === mechanic.value ? 0 : face
}

export function allocationTotals(battle: Battle, slots = battle.slots, dice = battle.dice) {
  const mechanic = enemyIntentAt(battle).mechanic
  const effectiveDice = mechanic?.kind === 'seal'
    ? dice.map((face, index) => dieFaceForSlot(face, slots[index], mechanic)) : dice
  return totals(effectiveDice, slots)
}

export type SlotTotals = ReturnType<typeof allocationTotals>

export function allocationPower(battle: Battle, totals = allocationTotals(battle), attackMultiplier?: number): SlotTotals {
  const multiplier = Math.max(attackMultiplier ?? 1, enemyIntentAt(battle).damageTakenMultiplier ?? 1, battle.armorBroken ? 1.5 : 1)
  return multiplier === 1 ? totals : { ...totals, attack: Math.floor(totals.attack * multiplier) }
}

export function respondingIntent(intent: EnemyIntent, attack: number): EnemyIntent {
  const mechanic = intent.mechanic
  return mechanic?.kind === 'reaction' && attack >= mechanic.value ? mechanic.alternate : intent
}

export function attackFor(battle: Battle, intent: EnemyIntent, escortSurvives = Boolean(battle.escort)) {
  const { turn, enemyAttackBuff = 0, enemyAttackGrowth = 0, playerHp, rerolled } = battle
  const { name, hits: baseHits, mechanic } = intent
  if (intent.id === 'critical' && battle.erasedStrikeTurn === turn) return { name, hits: [], totalDamage: 0 }
  const rage = mechanic?.kind === 'rage' && rerolled ? mechanic.value : 0
  const buff = enemyAttackBuff + Math.min(MAX_TURN_ATTACK_BONUS, enemyAttackGrowth * (turn - 1))
  let hits = mechanic?.kind === 'vitality'
    ? [Math.max(mechanic.minimum, Math.floor(playerHp / mechanic.divisor))]
    : baseHits.map((hit) => hit + buff)
  // These bonuses apply once to the attack as a whole, including a multi-hit attack.
  if (hits.length) hits[0] += rage + (escortSurvives ? battle.escort?.bonus ?? 0 : 0)
  const rawDamage = hits.reduce((sum, hit) => sum + hit, 0)
  let totalDamage = Math.min(MAX_ENEMY_DAMAGE, rawDamage)
  if (intent.id === 'critical' && battle.weakenedStrikeTurn === turn) {
    totalDamage = Math.floor(totalDamage / 2)
  }
  if (totalDamage < rawDamage) {
    // Scale cumulative damage so rounding preserves the sum and the hit sequence.
    let rawSoFar = 0
    let cappedSoFar = 0
    hits = hits.map((hit) => {
      rawSoFar += hit
      const cappedTotal = Math.round(rawSoFar * totalDamage / rawDamage)
      const cappedHit = cappedTotal - cappedSoFar
      cappedSoFar = cappedTotal
      return cappedHit
    })
  }
  return { name, hits, totalDamage }
}

export function splitEnemyDamage(battle: Battle, damage: number, previous = { dealt: 0, escortDealt: 0 }) {
  const intercepted = Math.min((battle.escort?.hp ?? 0) - previous.escortDealt, damage)
  return {
    dealt: Math.min(battle.enemyHp, previous.dealt + damage - intercepted),
    escortDealt: previous.escortDealt + intercepted,
  }
}

export function escortAfterDamage(escort: Battle['escort'], damage: number) {
  if (!escort || damage >= escort.hp) return undefined
  return damage ? { ...escort, hp: escort.hp - damage } : escort
}

export function incomingAttack(battle: Battle, { attack } = allocationPower(battle)) {
  return attackFor(battle, respondingIntent(enemyIntentAt(battle), attack), attack < (battle.escort?.hp ?? 0))
}

function breaksCharge(intent: EnemyIntent, attack: number) {
  return intent.chargeThreshold !== undefined && attack >= intent.chargeThreshold
}

export function chargedStrikePreview(battle: Battle, { attack } = allocationPower(battle), hammerArmed = false) {
  const intent = enemyIntentAt(battle)
  if (intent.chargeThreshold === undefined) return null
  const { escortDealt } = splitEnemyDamage(battle, attack)
  const bodyAttack = attack - escortDealt
  const weakened = breaksCharge(intent, bodyAttack)
  const turn = battle.turn + 1
  const next = { ...battle, turn, weakenedStrikeTurn: undefined, erasedStrikeTurn: undefined }
  const escortSurvives = attack < (battle.escort?.hp ?? 0)
  const nextIntent = enemyIntentAt(next)
  const fullDamage = attackFor(next, nextIntent, escortSurvives).totalDamage
  const erased = hammerArmed && bodyAttack >= intent.chargeThreshold + 3 && nextIntent.id === 'critical'
  const { totalDamage } = erased ? { totalDamage: 0 } : weakened ? attackFor({ ...next, weakenedStrikeTurn: turn }, nextIntent, escortSurvives)
    : { totalDamage: fullDamage }
  return { fullDamage, totalDamage, threshold: intent.chargeThreshold, weakened, ...(hammerArmed && { hammerThreshold: intent.chargeThreshold + 3, erased }) }
}

export function forecast(
  battle: Battle, slots = battle.slots, dice = battle.dice,
  { attack, guard } = allocationPower(battle, allocationTotals(battle, slots, dice)),
  suppress?: 'reflect' | number,
) {
  const intent = respondingIntent(enemyIntentAt(battle), attack)
  const inflicted = splitEnemyDamage(battle, attack)
  const actual = attackFor(battle, intent, inflicted.escortDealt < (battle.escort?.hp ?? 0))
  const { dealt, escortDealt } = suppress === 'reflect' ? splitEnemyDamage(battle, actual.totalDamage, inflicted) : inflicted
  let remainingAbsorption = typeof suppress === 'number' ? suppress : 0
  const incoming = suppress === 'reflect' ? { ...actual, hits: [], totalDamage: 0 }
    : typeof suppress === 'number' ? { ...actual, hits: actual.hits.map((hit) => {
      const blocked = Math.min(hit, remainingAbsorption)
      remainingAbsorption -= blocked
      return hit - blocked
    }).filter(Boolean), totalDamage: Math.max(0, actual.totalDamage - suppress) } : actual
  const thorns = intent.mechanic?.kind === 'thorns'
    ? slots.filter((slot) => slot === 'attack').length * intent.mechanic.value : 0

  let shield = guard
  const hits = (dealt === battle.enemyHp ? [] : incoming.hits).map((hit) => {
    const blocked = Math.min(shield, hit)
    shield -= blocked
    return hit - blocked
  })
  const attackDamage = hits.reduce((sum, hit) => sum + hit, 0)
  const retaliation = Math.min(thorns, MAX_ENEMY_DAMAGE - attackDamage)
  if (retaliation) hits.push(retaliation)
  return {
    dealt,
    escortDealt,
    intent,
    incoming,
    chargeBroken: breaksCharge(intent, attack - escortDealt),
    hits,
    damage: attackDamage + retaliation,
    counter: suppress === undefined && dealt < battle.enemyHp && incoming.totalDamage > 0 && guard === incoming.totalDamage,
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
    ...(result.escortDealt > 0 && { escortDealt: result.escortDealt }),
  }
  const { escort: previousEscort, ...rest } = battle
  const escort = escortAfterDamage(previousEscort, result.escortDealt)
  const resolved: Battle = {
    ...rest,
    ...(escort && { escort }),
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
  return applyCounterResult(battle, { slot, ...rewards[slot] })
}

export function applyCounterResult(battle: Battle, counter: CounterResult): Battle {
  if (battle.phase !== 'counter' || !battle.lastExchange) return battle
  const { dealt, escortDealt } = splitEnemyDamage(battle, counter.damage)
  const { escort: previousEscort, ...rest } = battle
  const escort = escortAfterDamage(previousEscort, escortDealt)
  const enemyHp = battle.enemyHp - dealt
  const resolved = { ...rest, ...(escort && { escort }), enemyHp, lastExchange: { ...battle.lastExchange, counter } }
  if (enemyHp === 0) return { ...resolved, phase: 'won' }
  return nextTurn(resolved)
}
